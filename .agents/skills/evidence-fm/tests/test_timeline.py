from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from build_fm_timeline import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    build_timeline,
    canonical_bytes,
    timeline_summary,
)
from fm_model import load_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_simulation import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    load_validation_suite,
)


class TimelineTests(unittest.TestCase):
    def fixture(self) -> Path:
        return Path(__file__).parent / "fixtures/valid-traceable-subscription"

    def test_timeline_contains_only_evidence_instances_and_context_lanes(self) -> None:
        model = load_model(self.fixture())
        suite = load_validation_suite(self.fixture())
        timeline, errors = build_timeline(model, suite)
        self.assertEqual([], errors)
        self.assertEqual(4, len(timeline["instances"]))
        self.assertNotIn("fulfillment.content-payment", {
            item["entityRef"] for item in timeline["instances"]
        })
        request = next(
            item for item in timeline["instances"]
            if item["entityRef"] == "request.content-payment"
        )
        confirmation = next(
            item for item in timeline["instances"]
            if item["entityRef"] == "confirmation.content-payment"
        )
        self.assertEqual("interval", request["time"]["kind"])
        self.assertEqual("moment", confirmation["time"]["kind"])
        self.assertIn("instance.payment-request", confirmation["basedOn"])

    def test_timeline_matches_schema_and_is_byte_stable(self) -> None:
        model = load_model(self.fixture())
        suite = load_validation_suite(self.fixture())
        first, errors = build_timeline(model, suite)
        second, second_errors = build_timeline(model, suite)
        self.assertEqual([], [*errors, *second_errors])
        schema = json.loads((SKILL_DIR / "schemas/timeline.schema.json").read_text())
        self.assertEqual([], list(Draft202012Validator(schema).iter_errors(first)))
        self.assertEqual(canonical_bytes(first), canonical_bytes(second))
        self.assertEqual(timeline_summary(first), timeline_summary(second))

    def test_cli_writes_generated_timeline_without_changing_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "timeline.json"
            command = [
                sys.executable,
                "-B",
                str(SKILL_DIR / "scripts/build_fm_timeline.py"),
                str(self.fixture()),
                "--output",
                str(output),
            ]
            first = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(0, first.returncode, first.stdout + first.stderr)
            content = output.read_bytes()
            second = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(0, second.returncode, second.stdout + second.stderr)
            self.assertEqual(content, output.read_bytes())

    def test_cycle_future_dependency_and_invalid_interval_fail(self) -> None:
        model = load_model(self.fixture())
        original = load_validation_suite(self.fixture())
        for defect in ("cycle", "future", "interval"):
            suite = copy.deepcopy(original)
            request = suite.instances_by_id["instance.payment-request"]
            confirmation = suite.instances_by_id["instance.payment-confirmation"]
            if defect == "cycle":
                request["basedOn"] = ["instance.payment-confirmation"]
            elif defect == "future":
                confirmation["values"]["confirmed_at"] = "2026-09-01T09:00:00Z"
            else:
                request["values"]["started_at"] = "2026-09-01T10:00:00Z"
            _, errors = build_timeline(model, suite)
            self.assertTrue(errors, defect)

    def test_unrelated_evidence_order_remains_unresolved(self) -> None:
        model = load_model(self.fixture())
        suite = load_validation_suite(self.fixture())
        model.entities.append(
            {
                "type": "entity",
                "id": "evidence.audit-note",
                "category": "evidence",
                "kind": "other_evidence",
                "label": "审计记录",
                "contextRef": "fulfillment.content-payment",
                "responsibleRoleRef": "role.subscriber",
                "attributes": [
                    {
                        "name": "created_at",
                        "label": "记录形成时间",
                        "valueType": "timestamp",
                        "required": True,
                        "keyData": True,
                        "meaning": "审计记录形成的业务时刻",
                    }
                ],
            }
        )
        timeline, errors = build_timeline(model, suite)
        self.assertEqual([], errors)
        self.assertTrue(
            any("evidence.audit-note" in pair.values() for pair in timeline["unresolvedOrder"])
        )


if __name__ == "__main__":
    unittest.main()
