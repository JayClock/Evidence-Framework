from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_support import API_PATH, API_ROOT, FM_ROOT, FM_SKILL, REPO_ROOT

CLI = API_ROOT / "scripts" / "fm_api.py"


class CliTest(unittest.TestCase):
    def command(self, name: str, *extra: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                sys.executable,
                str(CLI),
                name,
                "--project-root",
                str(REPO_ROOT),
                "--fm",
                str(FM_ROOT),
                "--fm-skill",
                str(FM_SKILL),
                *extra,
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=120,
        )

    def test_inspect_is_read_only_json(self) -> None:
        result = self.command("inspect")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["schemaVersion"], "3.0")
        self.assertTrue(payload["fmCheckSummary"]["valid"])

    def test_evidence_layout_keeps_inputs_and_discovery_unchanged(self) -> None:
        example = API_ROOT / "assets/examples/full-lifecycle"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            evidence = root / ".evidence"
            fm = evidence / "fm"
            api = evidence / "api/api.yaml"
            output = evidence / "api/generated/batch-001"
            shutil.copytree(example / "fm", fm)
            output.parent.mkdir(parents=True)
            shutil.copyfile(example / "api.yaml", api)
            notes = evidence / "discovery.md"
            notes.write_text("# Discovery\nKeep existing notes.\n", encoding="utf-8")
            inputs = {
                path: path.read_bytes()
                for path in evidence.rglob("*")
                if path.is_file()
            }
            result = subprocess.run(
                [
                    sys.executable,
                    str(CLI),
                    "project",
                    "--project-root",
                    str(root),
                    "--fm",
                    str(fm),
                    "--fm-skill",
                    str(FM_SKILL),
                    "--api",
                    str(api),
                    "--out",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
            )
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertEqual(str(output), json.loads(result.stdout)["out"])
            self.assertEqual(
                {
                    "projection.json",
                    "api-capabilities.md",
                    "design-report.md",
                    "api-contracts.md",
                    "openapi.yaml",
                    "representation-examples.json",
                    "http-journeys.json",
                    "e2e-test-vectors.json",
                    "manifest.json",
                },
                {path.name for path in output.iterdir()},
            )
            self.assertEqual(inputs, {path: path.read_bytes() for path in inputs})
            new_files = {
                path for path in evidence.rglob("*") if path.is_file()
            } - inputs.keys()
            self.assertTrue(all(path.is_relative_to(output) for path in new_files))
            vectors = json.loads((output / "e2e-test-vectors.json").read_text())
            self.assertEqual("synthetic", vectors["dataClassification"])
            self.assertFalse(vectors["runtimeValidated"])
            self.assertTrue(vectors["vectors"])
            self.assertTrue(
                all(
                    item["provisioning"] == "unresolved"
                    for vector in vectors["vectors"]
                    for item in vector["setup"]
                )
            )

    def test_e2e_vectors_preserve_contract_examples_and_idempotency(self) -> None:
        example = API_ROOT / "assets/examples/full-lifecycle"
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            output = Path(directory) / "projected"
            result = subprocess.run(
                [
                    sys.executable,
                    str(CLI),
                    "project",
                    "--project-root",
                    str(REPO_ROOT),
                    "--fm",
                    str(example / "fm"),
                    "--fm-skill",
                    str(FM_SKILL),
                    "--api",
                    str(example / "api.yaml"),
                    "--out",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=120,
            )
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
            document = json.loads((output / "e2e-test-vectors.json").read_text())
            vector = next(
                item
                for item in document["vectors"]
                if item["journeyRef"] == "http.quote-products"
            )
            create = vector["steps"][0]
            self.assertEqual("POST", create["request"]["method"])
            self.assertEqual(201, create["expect"]["status"])
            self.assertIn("Idempotency-Key", create["request"]["headers"])
            self.assertTrue(create["request"]["body"])
            self.assertIn("Location", create["expect"]["headers"])

    def test_check_and_project_are_deterministic(self) -> None:
        checked = self.command("check", "--api", str(API_PATH))
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(json.loads(checked.stdout)["interfaceCount"], 2)
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            parent = Path(directory)
            first = parent / "one"
            second = parent / "two"
            for output in (first, second):
                projected = self.command(
                    "project", "--api", str(API_PATH), "--out", str(output)
                )
                self.assertEqual(projected.returncode, 0, projected.stderr)
            for name in (
                "projection.json",
                "api-capabilities.md",
                "design-report.md",
                "e2e-test-vectors.json",
                "manifest.json",
            ):
                self.assertEqual(
                    hashlib.sha256((first / name).read_bytes()).digest(),
                    hashlib.sha256((second / name).read_bytes()).digest(),
                )
            repeated = self.command(
                "project", "--api", str(API_PATH), "--out", str(first)
            )
            self.assertEqual(repeated.returncode, 1)
            self.assertIn("OUTPUT_EXISTS", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
