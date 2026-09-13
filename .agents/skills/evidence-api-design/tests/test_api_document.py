"""One API document owns the complete interface and HTTP design."""

from __future__ import annotations

import importlib
import io
import json
import re
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import yaml
from test_support import API_ROOT, FM_ROOT, FM_SKILL, REPO_ROOT, design


class ApiDocumentTest(unittest.TestCase):
    def command(self, action, api_path, fm_root=FM_ROOT, *extra):
        return subprocess.run(
            [
                sys.executable,
                str(API_ROOT / "scripts/fm_api.py"),
                action,
                "--project-root",
                str(REPO_ROOT),
                "--fm",
                str(fm_root),
                "--fm-skill",
                str(FM_SKILL),
                "--api",
                str(api_path),
                *extra,
            ],
            text=True,
            capture_output=True,
            timeout=120,
        )

    def test_missing_http_is_rejected_without_writing_output(self):
        api = design()
        api["http"] = None
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(api, allow_unicode=True))
            before = path.read_bytes()
            checked = self.command("check", path)
            self.assertEqual(checked.returncode, 1, checked.stdout + checked.stderr)
            self.assertIn("DESIGN_INVALID", checked.stdout)
            out = Path(directory) / "out"
            generated = self.command("project", path, FM_ROOT, "--out", str(out))
            self.assertEqual(generated.returncode, 1)
            self.assertFalse(out.exists())
            self.assertEqual(path.read_bytes(), before)

    def test_packaged_document_includes_http_without_another_input(self):
        example = API_ROOT / "assets/examples/full-lifecycle"
        result = self.command("check", example / "api.yaml", example / "fm")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["interfaceCount"], 13)
        self.assertTrue(report["complete"])
        self.assertEqual(len(report["projection"]["http"]["operations"]), 13)
        self.assertFalse(report["projection"]["http"]["runtimeValidated"])

    def test_http_is_required_and_has_no_independent_identity(self):
        loader = importlib.import_module("fm_api_core.api_loader")
        api = design()
        api.pop("http", None)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(api))
            _, diagnostics = loader.load_api(path)
            self.assertTrue(diagnostics)
            api["http"] = importlib.import_module("test_contracts").fixture()[1]
            path.write_text(yaml.safe_dump(api))
            self.assertEqual(loader.load_api(path)[1], [])
            for field, value in (("schemaVersion", "4.0"), ("id", "nested")):
                api["http"][field] = value
                path.write_text(yaml.safe_dump(api))
                self.assertTrue(loader.load_api(path)[1])
                del api["http"][field]

    def test_command_surface_has_one_api_input(self):
        expected = {
            "--help",
            "--project-root",
            "--fm",
            "--fm-skill",
            "--api",
        }
        for action in ("check", "project"):
            result = self.command(action, REPO_ROOT / "api.yaml", FM_ROOT, "--help")
            self.assertEqual(result.returncode, 0)
            self.assertEqual(
                set(re.findall(r"--[a-z-]+", result.stdout)),
                expected | ({"--out"} if action == "project" else set()),
            )

    def test_api_cannot_be_inside_fm_root(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            fm_root = Path(directory) / "fm"
            fm_root.mkdir()
            path = fm_root / "api.yaml"
            path.write_text(yaml.safe_dump(design()))
            before = path.read_bytes()
            result = self.command("check", path, fm_root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("API_INPUT_CONFLICT", result.stderr)
            self.assertEqual(path.read_bytes(), before)

    def test_changed_api_invalidates_the_whole_projection(self):
        cli = importlib.import_module("fm_api")
        api = design()
        api["http"] = importlib.import_module("test_contracts").fixture()[1]
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(api))
            build = cli.projector.build_projection

            def change_after_build(*args, **kwargs):
                result = build(*args, **kwargs)
                path.write_text(path.read_text() + "\n")
                return result

            output = io.StringIO()
            with (
                patch.object(
                    cli.projector, "build_projection", side_effect=change_after_build
                ),
                redirect_stdout(output),
            ):
                code = cli.run(
                    [
                        "check",
                        "--project-root",
                        str(REPO_ROOT),
                        "--fm",
                        str(FM_ROOT),
                        "--fm-skill",
                        str(FM_SKILL),
                        "--api",
                        str(path),
                    ]
                )
            self.assertEqual(code, 1)
            report = json.loads(output.getvalue())
            self.assertFalse(report["valid"])
            self.assertFalse(report["complete"])
            self.assertFalse(report["projection"]["http"]["complete"])
            self.assertIn(
                "SOURCE_CHANGED", {item["code"] for item in report["diagnostics"]}
            )


if __name__ == "__main__":
    unittest.main()
