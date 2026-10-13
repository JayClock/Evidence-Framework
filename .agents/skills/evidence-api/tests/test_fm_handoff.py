"""API consumes a fresh FM result without rerunning FM validation."""
from __future__ import annotations

import importlib
import io
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from test_support import (
    API_PATH,
    API_ROOT,
    FM_ROOT,
    FM_SKILL,
    REPO_ROOT,
    check_path,
    fm_adapter,
)

sys.path.insert(0, str(FM_SKILL / "scripts"))
check_fm = importlib.import_module("check_fm")
fm_model = importlib.import_module("fm_model")


class FMHandoffTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = check_fm.check_model(FM_ROOT)
        assert cls.report["valid"], cls.report

    def test_api_adapter_does_not_run_fm_checker_or_compiler(self):
        with (
            patch.object(subprocess, "run", side_effect=AssertionError("duplicate FM process")),
            patch.object(check_fm, "check_model", side_effect=AssertionError("duplicate FM check")),
            patch.object(fm_model, "validate_model", side_effect=AssertionError("duplicate validation")),
        ):
            index, diagnostics = fm_adapter.load_fm(FM_ROOT, self.report)
        self.assertEqual([], diagnostics)
        self.assertIsNotNone(index)
        self.assertEqual(self.report, index.check)
        self.assertEqual("4.0", index.compiled["schemaVersion"])

    def test_inspect_check_and_project_all_reuse_one_fm_result(self):
        cli = importlib.import_module("fm_api")
        report = check_path(FM_ROOT)
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            for command in ("inspect", "check", "project"):
                with self.subTest(command=command):
                    args = [command, "--project-root", str(REPO_ROOT), "--fm", str(FM_ROOT),
                            "--fm-check", str(report)]
                    if command != "inspect":
                        args += ["--api", str(API_PATH)]
                    if command == "project":
                        args += ["--out", str(Path(directory) / "output")]
                    with (
                        patch.object(subprocess, "run", side_effect=AssertionError("duplicate FM process")),
                        patch.object(check_fm, "check_model", side_effect=AssertionError("duplicate FM check")),
                        patch.object(fm_model, "validate_model", side_effect=AssertionError("duplicate validation")),
                        redirect_stdout(io.StringIO()),
                    ):
                        self.assertEqual(0, cli.run(args))

    def test_suite_change_during_read_invalidates_handoff(self):
        with tempfile.TemporaryDirectory() as directory:
            fm = Path(directory) / "fm"
            shutil.copytree(FM_ROOT, fm)
            read = fm_adapter._load_json_objects

            def changed(root, pattern):
                values = read(root, pattern)
                manifest = fm / "model.json"
                manifest.write_text(manifest.read_text() + "\n", encoding="utf-8")
                return values

            with patch.object(fm_adapter, "_load_json_objects", side_effect=changed):
                index, diagnostics = fm_adapter.load_fm(fm, self.report)
        self.assertIsNone(index)
        self.assertIn("SOURCE_CHANGED", {item.code for item in diagnostics})

    def test_failed_changed_or_unbound_result_is_rejected(self):
        for field, value in (("valid", False), ("inputChanged", True), ("modelDigest", None)):
            with self.subTest(field=field):
                report = {**self.report, field: value}
                index, diagnostics = fm_adapter.load_fm(FM_ROOT, report)
                self.assertIsNone(index)
                self.assertIn("FM_CHECK_INVALID", {item.code for item in diagnostics})
        index, diagnostics = fm_adapter.load_fm(FM_ROOT, [])
        self.assertIsNone(index)
        self.assertIn("FM_CHECK_INVALID", {item.code for item in diagnostics})

    def test_stale_result_cannot_be_used_after_source_change(self):
        with tempfile.TemporaryDirectory() as directory:
            fm = Path(directory) / "fm"
            shutil.copytree(FM_ROOT, fm)
            manifest = fm / "model.json"
            manifest.write_text(manifest.read_text() + "\n", encoding="utf-8")
            index, diagnostics = fm_adapter.load_fm(fm, self.report)
        self.assertIsNone(index)
        self.assertIn("FM_CHECK_STALE", {item.code for item in diagnostics})

    def test_cli_requires_fm_result_instead_of_implicitly_rechecking(self):
        result = subprocess.run(
            [sys.executable, "-B", str(API_ROOT / "scripts/fm_api.py"), "inspect",
             "--project-root", str(REPO_ROOT), "--fm", str(FM_ROOT)],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(2, result.returncode)
        self.assertIn("--fm-check", result.stderr)

    def test_cli_reports_unreadable_result_without_traceback(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "fm-check.json"
            report.write_text("{broken", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, "-B", str(API_ROOT / "scripts/fm_api.py"), "inspect",
                 "--project-root", str(REPO_ROOT), "--fm", str(FM_ROOT),
                 "--fm-check", str(report)],
                capture_output=True, text=True, check=False,
            )
        self.assertEqual(1, result.returncode, result.stderr)
        self.assertIn("FM_CHECK_INVALID", result.stdout)
        self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
