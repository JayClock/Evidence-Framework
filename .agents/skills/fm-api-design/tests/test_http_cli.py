from __future__ import annotations

import hashlib
import importlib
import json
import tempfile
import unittest
from pathlib import Path

import yaml
from test_support import REPO_ROOT, design

fixture = importlib.import_module("test_contracts").fixture
cli_tests = importlib.import_module("test_cli")


def api_fixture():
    api = design()
    api["http"] = fixture()[1]
    return api


class HttpCliTest(unittest.TestCase):
    command = cli_tests.CliTest.command

    def test_check_project_preserves_input_and_is_deterministic(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            parent = Path(directory)
            path = parent / "api.yaml"
            path.write_text(yaml.safe_dump(api_fixture(), allow_unicode=True))
            before = path.read_bytes()
            checked = self.command("check", "--api", str(path), "--require-complete")
            self.assertEqual(checked.returncode, 0, checked.stdout + checked.stderr)
            self.assertTrue(
                json.loads(checked.stdout)["projection"]["http"]["complete"]
            )
            for output in (parent / "one", parent / "two"):
                result = self.command(
                    "project", "--api", str(path), "--out", str(output)
                )
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertTrue((output / "api-contracts.md").is_file())
                manifest = json.loads((output / "manifest.json").read_text())
                self.assertEqual(set(manifest["inputs"]), {"fm", "api", "sources"})
                for name, info in manifest["outputs"].items():
                    self.assertEqual(
                        hashlib.sha256((output / name).read_bytes()).hexdigest(),
                        info["sha256"],
                    )
                    self.assertEqual(
                        (parent / "one" / name).read_bytes(),
                        (output / name).read_bytes(),
                    )
            self.assertEqual(path.read_bytes(), before)

    def test_non_json_values_are_rejected_without_traceback(self):
        api = api_fixture()
        representation = api["http"]["representations"][0]
        representation["fields"] = [
            {
                "name": "value",
                "schema": {"type": "number"},
                "required": True,
                "origin": "server",
                "decision": "Synthetic transport value",
            }
        ]
        representation["example"] = {"value": float("nan")}
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(api))
            result = self.command("check", "--api", str(path))
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertNotIn("Traceback", result.stderr)
            self.assertIn("DESIGN_INVALID", result.stdout)

    def test_output_cannot_overlap_api_input(self):
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(api_fixture()))
            before = path.read_bytes()
            result = self.command("project", "--api", str(path), "--out", str(path))
            self.assertEqual(result.returncode, 1)
            self.assertIn("OUTPUT_INPUT_CONFLICT", result.stderr)
            self.assertEqual(path.read_bytes(), before)

    def test_invalid_document_and_incomplete_scope_have_distinct_exit_codes(self):
        api = api_fixture()
        api["http"]["journeys"] = []
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            path = Path(directory) / "api.yaml"
            path.write_text(yaml.safe_dump(api))
            output = Path(directory) / "out"
            result = self.command(
                "project",
                "--api",
                str(path),
                "--out",
                str(output),
                "--require-complete",
            )
            self.assertEqual(result.returncode, 3, result.stdout + result.stderr)
            self.assertFalse(output.exists())
            path.write_text("schemaVersion: '3.0'\nhttp: {operations: [null]}\n")
            result = self.command("check", "--api", str(path))
            self.assertEqual(result.returncode, 1)
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
