"""JSON glossary contracts; these checks do not approve domain meanings."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from check_glossary import check_glossary  # noqa: E402


def glossary():
    return {
        "schemaVersion": "1.0",
        "terms": [
            {
                "id": "term.receipt",
                "name": "收件回执",
                "definition": "证明材料已收到，不证明质量合格。",
                "sourceRefs": ["discovery.json#Q-001"],
            }
        ],
    }


class GlossaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "glossary.json"

    def save(self, document):
        self.path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")

    def test_valid_glossary_without_model_is_read_only(self):
        self.save(glossary())
        before = self.path.read_bytes()
        result = check_glossary(self.path)
        self.assertTrue(result["valid"], result)
        self.assertEqual(1, result["termCount"])
        self.assertFalse(result["inputChanged"])
        self.assertEqual(before, self.path.read_bytes())
        self.assertEqual([self.path], list(self.root.iterdir()))

    def test_strict_json_rejects_non_object_duplicates_and_constants(self):
        for text in (
            '[]', '{"terms": [], "terms": []}',
            '{"schemaVersion": "1.0", "terms": [],}',
            '{"terms": NaN}', '{"terms": Infinity}',
            '{"terms": -Infinity}', '{}\n{}', '// comment\n{}',
        ):
            with self.subTest(text=text):
                self.path.write_text(text, encoding="utf-8")
                self.assertFalse(check_glossary(self.path)["valid"])
                self.assertEqual(text, self.path.read_text(encoding="utf-8"))

    def test_schema_rejects_missing_sources_unknown_fields_and_empty_definitions(self):
        for change in (
            lambda term: term.pop("sourceRefs"),
            lambda term: term.update(sourceRefs=[]),
            lambda term: term.update(definition=" "),
            lambda term: term.update(status="approved"),
            lambda term: term.update(id="entity.receipt"),
            lambda term: term.update(aliases=[""]),
        ):
            document = glossary()
            change(document["terms"][0])
            self.save(document)
            self.assertFalse(check_glossary(self.path)["valid"], document)

    def test_duplicate_ids_and_same_context_names_are_rejected(self):
        document = glossary()
        document["terms"].append(copy.deepcopy(document["terms"][0]))
        self.save(document)
        result = check_glossary(self.path)
        self.assertFalse(result["valid"])
        self.assertTrue(any("duplicate term id" in e for e in result["errors"]))
        document["terms"][1]["id"] = "term.other"
        self.save(document)
        self.assertFalse(check_glossary(self.path)["valid"])
        document["terms"][1]["context"] = "另一业务上下文"
        self.save(document)
        self.assertTrue(check_glossary(self.path)["valid"])

    def test_correction_keeps_id_and_changes_digest(self):
        document = glossary()
        self.save(document)
        before = check_glossary(self.path)
        document["terms"][0].update(
            definition="证明指定材料已收到，不证明材料已被审核。",
            sourceRefs=["discovery.json#Q-001-correction"],
        )
        self.save(document)
        after = check_glossary(self.path)
        self.assertTrue(after["valid"])
        self.assertEqual("term.receipt", document["terms"][0]["id"])
        self.assertNotEqual(before["glossaryDigest"], after["glossaryDigest"])

    def test_changed_input_invalidates_the_result(self):
        self.save(glossary())
        before = self.path.read_bytes()
        with patch.object(Path, "read_bytes", side_effect=[before, before + b"\n"]):
            result = check_glossary(self.path)
        self.assertFalse(result["valid"])
        self.assertTrue(result["inputChanged"])

    def test_missing_unreadable_or_symlink_files_fail_without_writes(self):
        self.assertFalse(check_glossary(self.path)["valid"])
        self.save(glossary())
        with patch.object(Path, "read_bytes", side_effect=PermissionError("denied")):
            self.assertFalse(check_glossary(self.path)["valid"])
        link = self.root / "link.json"
        link.symlink_to(self.path)
        self.assertFalse(check_glossary(link)["valid"])

    def test_cli_exit_status_and_json_result(self):
        self.save(glossary())
        command = [sys.executable, "-B", str(SKILL / "scripts/check_glossary.py"), str(self.path)]
        good = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(0, good.returncode, good.stderr)
        self.assertTrue(json.loads(good.stdout)["valid"])
        self.path.write_text("{}", encoding="utf-8")
        bad = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(1, bad.returncode)
        self.assertFalse(json.loads(bad.stdout)["valid"])


if __name__ == "__main__":
    unittest.main()
