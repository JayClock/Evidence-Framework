"""Key-data inventory contracts; a report is not business approval."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
MODEL = SKILL / "tests/fixtures/models/valid-traceable-subscription"


def file_hashes(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file()
    }


class KeyDataAuditTests(unittest.TestCase):
    def test_report_classifies_key_data_and_never_writes_the_model(self):
        before = file_hashes(MODEL)
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                str(SKILL / "scripts/audit_key_data.py"),
                str(MODEL),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(1, report["checkVersion"])
        self.assertTrue(report["valid"])
        self.assertEqual(
            report["keyDataCount"], sum(report["counts"].values())
        )
        allowed = {
            "derived",
            "contract-term",
            "domain-source",
            "negotiation-source",
            "result-fact",
            "request-input",
            "needs-decision",
        }
        self.assertLessEqual(set(report["counts"]), allowed)
        for bucket in ("derived", "contract-term", "result-fact", "needs-decision"):
            self.assertIn(bucket, report["counts"], bucket)
        self.assertGreater(report["counts"]["derived"], 0)
        self.assertIn(
            "request.content-access#expired_at",
            [item["path"] for item in report["needsDecision"]],
        )
        derived = {item["path"]: item for item in report["derived"]}
        self.assertIn("request.content-payment#requested_minor_units", derived)
        self.assertTrue(derived["request.content-payment#requested_minor_units"]["sources"])
        self.assertEqual(before, file_hashes(MODEL))

    def test_invalid_model_reports_errors_instead_of_an_inventory(self):
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                str(SKILL / "scripts/audit_key_data.py"),
                str(SKILL / "tests/fixtures/models"),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(1, result.returncode)
        report = json.loads(result.stdout)
        self.assertFalse(report["valid"])
        self.assertTrue(report["errors"])


if __name__ == "__main__":
    unittest.main()
