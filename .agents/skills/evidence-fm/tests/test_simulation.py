from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from fm_model import (  # type: ignore[import-not-found]  # noqa: E402
    load_model,
    validate_model,
)
from fm_simulation import (  # type: ignore[import-not-found]  # noqa: E402
    fulfillment_status,
    load_validation_suite,
    simulate_validation_suite,
    validate_validation_suite,
)


class SimulationTests(unittest.TestCase):
    def fixture(self, name: str) -> Path:
        return Path(__file__).parent / "fixtures" / name

    def test_traceable_fixture_simulates_deterministically(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        model = load_model(root)
        suite = load_validation_suite(root)
        self.assertEqual([], validate_model(model))
        self.assertEqual([], validate_validation_suite(model, suite))
        first, first_errors = simulate_validation_suite(model, suite)
        second, second_errors = simulate_validation_suite(model, suite)
        self.assertEqual([], first_errors)
        self.assertEqual([], second_errors)
        self.assertEqual(first, second)
        self.assertEqual(2, len(first["scenarioResults"]))
        result = next(
            item
            for item in first["scenarioResults"]
            if item["scenarioId"] == "scenario.successful-payment"
        )
        overdue = next(
            item
            for item in first["scenarioResults"]
            if item["scenarioId"] == "scenario.overdue-payment"
        )
        self.assertTrue(result["simulationPassed"])
        self.assertEqual("pending", result["stakeholderReview"]["status"])
        self.assertEqual("completed", result["fulfillmentStatuses"][0]["status"])
        self.assertEqual("breached", overdue["fulfillmentStatuses"][0]["status"])

    def test_wrong_acting_role_is_rejected_before_simulation(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        model = load_model(root)
        suite = copy.deepcopy(load_validation_suite(root))
        scenario = suite.scenarios_by_id["scenario.successful-payment"]
        scenario["steps"][0]["actingRoleRef"] = "role.subscriber"
        errors = validate_validation_suite(model, suite)
        self.assertTrue(
            any("must equal Evidence responsibleRoleRef" in error for error in errors)
        )

    def test_explicit_now_cannot_drift_from_scenario_as_of(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        model = load_model(root)
        suite = copy.deepcopy(load_validation_suite(root))
        scenario = suite.scenarios_by_id["scenario.overdue-payment"]
        breach = next(
            item
            for item in scenario["evaluations"]
            if item["ruleRef"] == "rule.payment-expired"
        )
        breach["bindings"]["now"] = {"value": "2026-09-01T09:00:00Z"}
        errors = validate_validation_suite(model, suite)
        self.assertTrue(any("Scenario asOf" in error for error in errors), errors)

    def test_missing_required_asserted_value_is_rejected(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        model = load_model(root)
        suite = copy.deepcopy(load_validation_suite(root))
        contract = suite.instances_by_id["instance.subscription-contract"]
        del contract["values"]["currency"]
        errors = validate_validation_suite(model, suite)
        self.assertTrue(
            any("required asserted value" in error for error in errors), errors
        )

    def test_wrong_payment_amount_fails_invariant(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        model = load_model(root)
        suite = copy.deepcopy(load_validation_suite(root))
        payment = next(
            instance
            for instance in suite.instances
            if instance["id"] == "instance.payment-confirmation"
        )
        payment["values"]["paid_minor_units"] = 19800
        report, errors = simulate_validation_suite(model, suite)
        self.assertTrue(errors)
        self.assertTrue(report["machineValidated"])
        self.assertTrue(
            all(item["machineValidated"] for item in report["scenarioResults"])
        )
        self.assertFalse(report["simulationPassed"])
        self.assertTrue(
            any("payment-matches-request" in error for error in errors), errors
        )

    def test_evidence_role_player_can_complete_core_request(self) -> None:
        model = load_model(self.fixture("valid-roleized-payment"))
        self.assertEqual([], validate_model(model))
        instances = {
            "instance.request": {
                "id": "instance.request",
                "entityRef": "request.content-payment",
                "values": {},
            },
            "instance.external-confirmation": {
                "id": "instance.external-confirmation",
                "entityRef": "confirmation.external-payment",
                "values": {},
                "basedOn": ["instance.request"],
            },
        }
        status = fulfillment_status(
            model,
            instances,
            set(instances),
            "fulfillment.content-payment",
            "instance.request",
            {},
            set(),
        )
        self.assertEqual("completed", status)

    def test_refund_reversal_correction_and_compensation_are_new_evidence(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        model = load_model(root)
        suite = copy.deepcopy(load_validation_suite(root))
        scenario = copy.deepcopy(suite.scenarios_by_id["scenario.successful-payment"])
        scenario["id"] = "scenario.append-only-adjustments"
        original_payment = copy.deepcopy(
            suite.instances_by_id["instance.payment-confirmation"]["values"]
        )
        for sequence, adjustment in enumerate(
            ["refund", "reversal", "correction", "compensation"], start=3
        ):
            entity_ref = f"evidence.payment-{adjustment}"
            instance_ref = f"instance.payment-{adjustment}"
            model.entities.append(
                {
                    "type": "entity",
                    "id": entity_ref,
                    "category": "evidence",
                    "kind": "other_evidence",
                    "label": adjustment.title(),
                    "contextRef": "context.content-subscription",
                    "responsibleRoleRef": "role.subscriber",
                    "attributes": [
                        {
                            "name": "created_at",
                            "label": "Recorded at",
                            "valueType": "timestamp",
                            "required": True,
                            "keyData": True,
                            "meaning": "Immutable adjustment evidence time",
                        }
                    ],
                }
            )
            suite.instances.append(
                {
                    "type": "evidence_instance",
                    "id": instance_ref,
                    "entityRef": entity_ref,
                    "values": {"created_at": f"2026-09-01T09:{8 + sequence}:00Z"},
                    "basedOn": ["instance.payment-confirmation"],
                }
            )
            scenario["steps"].append(
                {
                    "sequence": sequence,
                    "actingRoleRef": "role.subscriber",
                    "issueInstanceRef": instance_ref,
                    "availableInstanceRefs": ["instance.payment-confirmation"],
                }
            )
        suite.scenarios.append(scenario)
        self.assertEqual([], validate_model(model))

        report, errors = simulate_validation_suite(
            model, suite, ["scenario.append-only-adjustments"]
        )
        self.assertEqual([], errors)
        issued = set(report["scenarioResults"][0]["issuedInstanceRefs"])
        self.assertTrue(
            {
                "instance.payment-refund",
                "instance.payment-reversal",
                "instance.payment-correction",
                "instance.payment-compensation",
            }.issubset(issued)
        )
        self.assertEqual(
            original_payment,
            suite.instances_by_id["instance.payment-confirmation"]["values"],
        )

    def test_breach_rule_results_are_scoped_to_the_related_request(self) -> None:
        model = load_model(self.fixture("valid-traceable-subscription"))
        instances = {
            "instance.request-1": {
                "id": "instance.request-1",
                "entityRef": "request.content-payment",
                "values": {},
            },
            "instance.request-2": {
                "id": "instance.request-2",
                "entityRef": "request.content-payment",
                "values": {},
            },
            "instance.late-payment": {
                "id": "instance.late-payment",
                "entityRef": "confirmation.content-payment",
                "values": {},
                "basedOn": ["instance.request-2"],
            },
        }
        rule_results = {
            "rule.payment-expired": [
                {"result": True, "instanceRefs": {"instance.request-2"}}
            ]
        }
        self.assertEqual(
            "pending",
            fulfillment_status(
                model,
                instances,
                set(instances),
                "fulfillment.content-payment",
                "instance.request-1",
                rule_results,
                set(),
            ),
        )
        self.assertEqual(
            "breached",
            fulfillment_status(
                model,
                instances,
                set(instances),
                "fulfillment.content-payment",
                "instance.request-2",
                rule_results,
                set(),
            ),
        )

    def test_amount_and_manual_completion_use_explicit_scenario_results(self) -> None:
        model = load_model(self.fixture("valid-traceable-subscription"))
        instances = {
            "instance.request": {
                "id": "instance.request",
                "entityRef": "request.content-payment",
                "values": {},
            }
        }
        fulfillment = model.fulfillment_contexts_by_id["fulfillment.content-payment"]
        fulfillment["completionPolicy"] = {
            "mode": "amount",
            "completionRuleRef": "rule.payment-matches-request",
        }
        results = {
            "rule.payment-matches-request": [
                {"result": True, "instanceRefs": {"instance.request"}}
            ]
        }
        self.assertEqual(
            "completed",
            fulfillment_status(
                model,
                instances,
                {"instance.request"},
                "fulfillment.content-payment",
                "instance.request",
                results,
                set(),
            ),
        )
        fulfillment["completionPolicy"] = {"mode": "manual"}
        self.assertEqual(
            "completed",
            fulfillment_status(
                model,
                instances,
                {"instance.request"},
                "fulfillment.content-payment",
                "instance.request",
                {},
                {"instance.request"},
            ),
        )

    def test_count_policy_uses_repeated_instances_without_duplicate_types(self) -> None:
        model = load_model(self.fixture("valid-subscription"))
        fulfillment = model.fulfillment_contexts_by_id["fulfillment.content-payment"]
        fulfillment["completionPolicy"] = {"mode": "count", "minimumConfirmations": 2}
        instances = {
            "instance.request": {
                "id": "instance.request",
                "entityRef": "request.content-payment",
                "values": {},
            },
            "instance.payment-1": {
                "id": "instance.payment-1",
                "entityRef": "confirmation.content-payment",
                "values": {},
                "basedOn": ["instance.request"],
            },
            "instance.payment-2": {
                "id": "instance.payment-2",
                "entityRef": "confirmation.content-payment",
                "values": {},
                "basedOn": ["instance.request"],
            },
        }
        self.assertEqual(
            "pending",
            fulfillment_status(
                model,
                instances,
                {"instance.request", "instance.payment-1"},
                "fulfillment.content-payment",
                "instance.request",
                {},
                set(),
            ),
        )
        self.assertEqual(
            "completed",
            fulfillment_status(
                model,
                instances,
                set(instances),
                "fulfillment.content-payment",
                "instance.request",
                {},
                set(),
            ),
        )

    def test_role_play_pack_hides_future_values_and_marks_review_pending(self) -> None:
        root = self.fixture("valid-traceable-subscription")
        script = SKILL_DIR / "scripts" / "generate_role_play_pack.py"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "pack"
            result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    str(root),
                    "scenario.successful-payment",
                    "--output",
                    str(output),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(0, result.returncode, result.stderr)
            second_output = Path(directory) / "pack-second"
            second_result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    str(root),
                    "scenario.successful-payment",
                    "--output",
                    str(second_output),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(0, second_result.returncode, second_result.stderr)
            blank_confirmation = (
                output / "blank-documents" / "instance--payment-confirmation.md"
            ).read_text(encoding="utf-8")
            source_contract = (
                output / "source-documents" / "instance--subscription-contract.md"
            ).read_text(encoding="utf-8")
            platform_sheet = (output / "role--platform-subscription.md").read_text(
                encoding="utf-8"
            )
            subscriber_sheet = (output / "role--subscriber.md").read_text(
                encoding="utf-8"
            )
            manifest = json.loads(
                (output / "manifest.json").read_text(encoding="utf-8")
            )
            self.assertNotIn("19900", blank_confirmation)
            self.assertIn("19900", source_contract)
            self.assertIn("rule.payment-deadline", platform_sheet)
            self.assertIn("rule.payment-matches-request", subscriber_sheet)
            self.assertNotIn("19900", platform_sheet + subscriber_sheet)
            self.assertEqual("2026-09-01T09:15:00Z", manifest["asOf"])
            self.assertTrue(manifest["machineValidated"])
            self.assertTrue(manifest["simulationPassed"])
            self.assertEqual("pending", manifest["stakeholderReview"]["status"])
            self.assertTrue((output / "role--subscriber.md").is_file())
            first_files = {
                path.relative_to(output): path.read_bytes()
                for path in output.rglob("*")
                if path.is_file()
            }
            second_files = {
                path.relative_to(second_output): path.read_bytes()
                for path in second_output.rglob("*")
                if path.is_file()
            }
            self.assertEqual(first_files, second_files)


if __name__ == "__main__":
    unittest.main()
