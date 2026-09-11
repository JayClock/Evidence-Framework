from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_support import API_ROOT, DESIGN_PATH, FM_ROOT, FM_SKILL, REPO_ROOT

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

    def test_check_and_project_are_deterministic(self) -> None:
        checked = self.command("check", "--design", str(DESIGN_PATH))
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(json.loads(checked.stdout)["candidateCount"], 1)
        with tempfile.TemporaryDirectory(dir=REPO_ROOT) as directory:
            parent = Path(directory)
            first = parent / "one"
            second = parent / "two"
            for output in (first, second):
                projected = self.command(
                    "project", "--design", str(DESIGN_PATH), "--out", str(output)
                )
                self.assertEqual(projected.returncode, 0, projected.stderr)
            for name in (
                "projection.json",
                "api-capabilities.md",
                "design-report.md",
                "manifest.json",
            ):
                self.assertEqual(
                    hashlib.sha256((first / name).read_bytes()).digest(),
                    hashlib.sha256((second / name).read_bytes()).digest(),
                )
            repeated = self.command(
                "project", "--design", str(DESIGN_PATH), "--out", str(first)
            )
            self.assertEqual(repeated.returncode, 1)
            self.assertIn("OUTPUT_EXISTS", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
