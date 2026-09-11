from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

import check_fm  # noqa: E402


class CheckModelTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.project = Path(self.temp.name).resolve()
        self.model = self.project / ".evidence/fm"
        shutil.copytree(SKILL / "assets/examples/domain", self.model)

    def test_read_only_report_binds_exact_source_bytes_and_is_location_independent(
        self,
    ):
        before = {p: p.read_bytes() for p in self.model.rglob("*") if p.is_file()}
        first = check_fm.check_model(self.model)
        self.assertTrue(first["valid"])
        self.assertFalse(first["inputChanged"])
        expected = {
            p.relative_to(self.model).as_posix(): hashlib.sha256(data).hexdigest()
            for p, data in before.items()
        }
        digest = hashlib.sha256(
            json.dumps(
                expected, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode()
        ).hexdigest()
        self.assertEqual("sha256:" + digest, first["modelDigest"])
        copy = self.project / "elsewhere"
        shutil.copytree(self.model, copy)
        self.assertEqual(
            first["modelDigest"], check_fm.check_model(copy)["modelDigest"]
        )
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        self.assertIsNone(first["simulationPassed"])

    def test_edit_changes_digest_and_invalid_model_is_not_repaired(self):
        first = check_fm.check_model(self.model)
        manifest = self.model / "model.yaml"
        manifest.write_text("type: [broken yaml", encoding="utf-8")
        second = check_fm.check_model(self.model)
        self.assertFalse(second["valid"])
        self.assertNotEqual(first["modelDigest"], second["modelDigest"])
        self.assertEqual("type: [broken yaml", manifest.read_text())

    def test_generated_outputs_do_not_change_source_digest(self):
        first = check_fm.check_model(self.model)
        generated = self.model / "generated"
        generated.mkdir()
        (generated / "model.json").write_text("{}", encoding="utf-8")
        self.assertEqual(
            first["modelDigest"], check_fm.check_model(self.model)["modelDigest"]
        )

    def test_source_change_during_check_invalidates_result(self):
        original = check_fm.validate_model

        def change_after_validation(model):
            errors = original(model)
            manifest = self.model / "model.yaml"
            manifest.write_text(manifest.read_text() + "\n# concurrent edit\n")
            return errors

        with patch.object(
            check_fm, "validate_model", side_effect=change_after_validation
        ):
            report = check_fm.check_model(self.model)
        self.assertFalse(report["valid"])
        self.assertTrue(report["inputChanged"])
        self.assertIn("Model inputs changed during validation", report["errors"])

    def test_cli_prints_report_without_writing_model_or_workflow_files(self):
        state = self.project / ".evidence/state.json"
        state.write_text('{"owner":"host"}')
        before = {p: p.read_bytes() for p in self.project.rglob("*") if p.is_file()}
        result = subprocess.run(
            [sys.executable, "-B", str(SKILL / "scripts/check_fm.py"), str(self.model)],
            capture_output=True,
            text=True,
            check=False,
            timeout=60,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertRegex(
            json.loads(result.stdout)["modelDigest"], r"^sha256:[0-9a-f]{64}$"
        )
        self.assertEqual(
            before, {p: p.read_bytes() for p in self.project.rglob("*") if p.is_file()}
        )


if __name__ == "__main__":
    unittest.main()
