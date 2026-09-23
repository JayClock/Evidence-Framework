"""Domain language has one authoritative definition and read-only resolution."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from context_samples import attribute, entity, write_model

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
SPEC = importlib.util.spec_from_file_location("check_glossary", SCRIPTS / "check_glossary.py")
assert SPEC and SPEC.loader
checker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(checker)


def standalone(**fields):
    return {
        "id": "term.receipt",
        "kind": "standalone",
        "name": "收稿回执",
        "definition": "证明收到稿件，不证明质量合格。",
        "sourceRefs": ["discovery.json#Q-1"],
        **fields,
    }


def model_term(**fields):
    return {"id": "term.receipt", "kind": "model", "target": {"objectRef": "party.author"}, **fields}


class GlossaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "glossary.json"

    def save(self, terms):
        self.path.write_text(json.dumps({"schemaVersion": "2.0", "terms": terms}, ensure_ascii=False))
        return checker.check_glossary(self.path)

    def model(self):
        root = self.root / "fm"
        docs = [
            entity("context.authors", "context", "domain", "作者领域", rootRefs=["party.author"]),
            entity("party.author", "participant", "party", "作者", notes="向出版方提供稿件的主体。",
                   contextRef="context.authors", attributes=[attribute("author_id", "string", "稳定作者编号")]),
            {"type": "relationship", "id": "relation.author", "kind": "references",
             "sourceRef": "context.authors", "targetRef": "party.author", "label": "领域引用作者", "notes": "定位作者主体。"},
            {"type": "rule", "id": "rule.author", "label": "作者规则", "description": "用于结构解析的合成规则。",
             "contextRef": "context.authors", "kind": "invariant", "expression": "true", "bindings": {}, "resultType": "bool"},
        ]
        write_model(root, docs, "context.authors")
        return root

    def source(self, identity):
        return next(p for p in (self.root / "fm").rglob("*.json") if json.loads(p.read_text()).get("id") == identity)

    def test_standalone_before_model(self):
        result = self.save([standalone()])
        self.assertTrue(result["valid"], result)
        self.assertIsNone(result["referenceValidated"])
        self.assertIsNone(result["fmSourceDigest"])
        self.assertEqual("收稿回执", result["resolvedTerms"][0]["name"])
        self.assertFalse(result["inputChanged"])

    def test_required_standalone_fields_and_unknown_fields(self):
        for key in ("id", "kind", "name", "definition", "sourceRefs"):
            term = standalone()
            del term[key]
            with self.subTest(key=key):
                self.assertFalse(self.save([term])["valid"])
        for term in (standalone(name=" "), standalone(sourceRefs=[]), standalone(extra=True)):
            self.assertFalse(self.save([term])["valid"])

    def test_rejects_previous_contract_and_mixed_definitions(self):
        self.path.write_text(json.dumps({"schemaVersion": "1.0", "terms": []}))
        self.assertFalse(checker.check_glossary(self.path)["valid"])
        for key, value in {"name": "副本", "definition": "副本", "context": "副本", "distinctions": ["副本"],
                           "modelRefs": ["party.author"]}.items():
            with self.subTest(key=key):
                self.assertFalse(self.save([model_term(**{key: value})])["valid"])
        self.assertFalse(self.save([standalone(target={"objectRef": "party.author"})])["valid"])
        self.assertFalse(self.save([model_term(target={"objectRef": "party.author", "path": "source.json"})])["valid"])

    def test_duplicate_id_name_and_context(self):
        self.assertFalse(self.save([standalone(), standalone()])["valid"])
        self.assertFalse(self.save([standalone(), standalone(id="term.other")])["valid"])
        self.assertTrue(self.save([standalone(context="one"), standalone(id="term.other", context="two")])["valid"])

    def test_resolves_current_model_without_copying_source(self):
        self.model()
        result = self.save([model_term(aliases=["投稿者"])])
        self.assertTrue(result["valid"], result)
        self.assertTrue(result["referenceValidated"])
        resolved = result["resolvedTerms"][0]
        self.assertEqual("作者", resolved["name"])
        self.assertEqual("向出版方提供稿件的主体。", resolved["definition"])
        before = self.path.read_bytes()
        source = self.source("party.author")
        document = json.loads(source.read_text())
        document.update(label="签约作者", notes="当前定义。")
        source.write_text(json.dumps(document))
        updated = checker.check_glossary(self.path)
        self.assertTrue(updated["valid"], updated)
        self.assertEqual("签约作者", updated["resolvedTerms"][0]["name"])
        self.assertEqual("当前定义。", updated["resolvedTerms"][0]["definition"])
        self.assertNotEqual(result["fmSourceDigest"], updated["fmSourceDigest"])
        self.assertEqual(before, self.path.read_bytes())

    def test_attributes_relationships_and_rules(self):
        self.model()
        cases = [("party.author", "author_id", "meaning", "稳定作者编号"),
                 ("relation.author", None, "notes", "定位作者主体。"),
                 ("rule.author", None, "description", "用于结构解析的合成规则。")]
        for ref, attr, field, meaning in cases:
            target = {"objectRef": ref, **({"attribute": attr} if attr else {})}
            result = self.save([model_term(target=target)])
            self.assertTrue(result["valid"], result)
            self.assertEqual(field, result["resolvedTerms"][0]["definitionField"])
            self.assertEqual(meaning, result["resolvedTerms"][0]["definition"])

    def test_dangling_deleted_and_renamed_targets_fail(self):
        self.assertFalse(self.save([model_term()])["valid"])
        self.model()
        for target in ({"objectRef": "party.missing"}, {"objectRef": "party.author", "attribute": "missing"},
                       {"objectRef": "relation.author", "attribute": "author_id"}):
            result = self.save([model_term(target=target)])
            self.assertFalse(result["valid"], result)
            self.assertEqual([], result["resolvedTerms"])
        self.source("party.author").unlink()
        self.assertFalse(self.save([model_term()])["valid"])

    def test_missing_authoritative_definition_is_not_replaced_by_label(self):
        self.model()
        source = self.source("party.author")
        document = json.loads(source.read_text())
        del document["notes"]
        source.write_text(json.dumps(document))
        result = self.save([model_term()])
        self.assertFalse(result["valid"])
        self.assertTrue(any("authoritative notes" in error for error in result["errors"]))

    def test_duplicate_targets_and_standalone_shadows_fail(self):
        self.model()
        self.assertFalse(self.save([model_term(), model_term(id="term.other")])["valid"])
        self.assertFalse(self.save([standalone(name="作者")])["valid"])
        self.assertFalse(self.save([standalone(name="稳定作者编号")])["valid"])
        self.assertTrue(self.save([standalone(name="作者", context="context.other")])["valid"])

    def test_explicit_root_source_move_and_read_only(self):
        root = self.model()
        self.save([model_term()])
        moved = self.root / "model-source"
        root.rename(moved)
        source = next(p for p in moved.rglob("*.json") if json.loads(p.read_text()).get("id") == "party.author")
        source.rename(moved / "moved.json")
        before = {p: p.read_bytes() for p in self.root.rglob("*.json")}
        result = checker.check_glossary(self.path, moved)
        self.assertTrue(result["valid"], result)
        self.assertEqual("moved.json", result["resolvedTerms"][0]["sourceFile"])
        self.assertEqual(before, {p: p.read_bytes() for p in self.root.rglob("*.json")})

    def test_model_source_changes_during_check_are_detected(self):
        self.model()
        self.save([model_term()])
        with patch.object(checker, "fm_signature", side_effect=["before", "after"]):
            result = checker.check_glossary(self.path)
        self.assertFalse(result["valid"])
        self.assertTrue(result["inputChanged"])
        self.assertFalse(result["referenceValidated"])
        self.assertEqual([], result["resolvedTerms"])

    def test_strict_json_and_symlinks(self):
        for text in ('[]', '{"schemaVersion":"2.0","schemaVersion":"2.0","terms":[]}',
                     '{"schemaVersion":"2.0","terms":[],}', '{}\n{}', '{"terms":NaN}'):
            self.path.write_text(text)
            self.assertFalse(checker.check_glossary(self.path)["valid"], text)
        self.save([standalone()])
        link = self.root / "link.json"
        link.symlink_to(self.path)
        self.assertFalse(checker.check_glossary(link)["valid"])

    def test_standalone_becomes_reference_with_same_term_identity(self):
        self.assertTrue(self.save([standalone(name="作者", definition="向出版方提供稿件的主体。")])["valid"])
        self.model()
        self.assertFalse(checker.check_glossary(self.path)["valid"])
        result = self.save([model_term()])
        self.assertTrue(result["valid"], result)
        self.assertEqual("term.receipt", result["resolvedTerms"][0]["id"])
        persisted = json.loads(self.path.read_text())["terms"][0]
        self.assertNotIn("name", persisted)
        self.assertNotIn("definition", persisted)


if __name__ == "__main__":
    unittest.main()
