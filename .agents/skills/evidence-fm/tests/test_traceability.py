from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import yaml

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from fm_model import (  # type: ignore[import-not-found]  # noqa: E402
    compiled_document,
    load_model,
    validate_against_schema,
    validate_model,
)
from fm_traceability import (  # type: ignore[import-not-found]  # noqa: E402
    analyze_traceability,
    extract_rule_attribute_accesses,
)


class TraceabilityTests(unittest.TestCase):
    def fixture(self, name: str) -> Path:
        return Path(__file__).parent / "fixtures" / name

    def copied_fixture(self, directory: str) -> Path:
        target = Path(directory) / "model"
        shutil.copytree(self.fixture("valid-traceable-subscription"), target)
        return target

    def read_yaml(self, path: Path) -> dict[str, Any]:
        return yaml.safe_load(path.read_text(encoding="utf-8"))

    def write_yaml(self, path: Path, document: dict[str, Any]) -> None:
        path.write_text(
            yaml.safe_dump(document, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def test_compiled_core_excludes_validation_instances_and_scenarios(self) -> None:
        model = load_model(self.fixture("valid-traceable-subscription"))
        compiled = compiled_document(model)
        self.assertNotIn("validation", compiled)
        compiled_text = str(compiled)
        self.assertNotIn("instance.payment-confirmation", compiled_text)
        self.assertNotIn("scenario.successful-payment", compiled_text)

    def test_key_derivation_rejects_unmodeled_scalar_business_input(self) -> None:
        model = load_model(self.fixture("valid-traceable-subscription"))
        rule = model.rules_by_id["rule.payment-request-amount"]
        rule["bindings"]["adjustment"] = {"type": "int"}
        rule["expression"] = "contract.price_minor_units + adjustment"
        _, errors = analyze_traceability(model)
        self.assertTrue(any("scalar inputs" in error for error in errors), errors)

    def test_lineage_extracts_attribute_edges_and_constraints(self) -> None:
        model = load_model(self.fixture("valid-traceable-subscription"))
        self.assertEqual([], validate_model(model))
        report, errors = analyze_traceability(model)
        self.assertEqual([], errors)
        schema_errors: list[str] = []
        validate_against_schema(
            report,
            "traceability.schema.json",
            "generated/traceability.json",
            schema_errors,
        )
        self.assertEqual([], schema_errors)
        edges = {
            (edge["source"], edge["target"], edge["ruleRef"])
            for edge in report["edges"]
        }
        self.assertIn(
            (
                "contract.content-subscription#price_minor_units",
                "request.content-payment#requested_minor_units",
                "rule.payment-request-amount",
            ),
            edges,
        )
        self.assertIn(
            (
                "request.content-payment#started_at",
                "request.content-payment#expired_at",
                "rule.payment-deadline",
            ),
            edges,
        )
        payment_constraint = next(
            item
            for item in report["constraints"]
            if item["ruleRef"] == "rule.payment-matches-request"
        )
        self.assertEqual(4, len(payment_constraint["attributeRefs"]))

    def test_static_index_syntax_is_included_in_lineage(self) -> None:
        model = load_model(self.fixture("valid-traceable-subscription"))
        rule = model.rules_by_id["rule.payment-request-amount"]
        rule["expression"] = 'contract["price_minor_units"]'
        report, errors = analyze_traceability(model)
        self.assertEqual([], errors)
        self.assertIn(
            {
                "source": "contract.content-subscription#price_minor_units",
                "target": "request.content-payment#requested_minor_units",
                "ruleRef": "rule.payment-request-amount",
            },
            report["edges"],
        )

    def test_unknown_or_legacy_cel_attribute_is_rejected(self) -> None:
        for name in ("missing_price", "priceMinorUnits"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = self.copied_fixture(directory)
                path = root / "rules" / "rule--payment-request-amount.yaml"
                rule = self.read_yaml(path)
                rule["expression"] = f"contract.{name}"
                self.write_yaml(path, rule)
                errors = validate_model(load_model(root))
                self.assertTrue(
                    any("reads unknown attribute" in error for error in errors), errors
                )

    def test_chained_filter_macro_preserves_collection_entity_source(self) -> None:
        rule = {
            "id": "rule.confirmation-filter",
            "expression": (
                'payments.filter(p, p.paid_minor_units > 0).all(p, p.currency == "CNY")'
            ),
            "bindings": {
                "payments": {
                    "ref": "confirmation.content-payment",
                    "cardinality": "many",
                }
            },
        }
        accesses, errors = extract_rule_attribute_accesses(rule)
        self.assertEqual([], errors)
        self.assertEqual(
            {"paid_minor_units", "currency"},
            {access.attribute for access in accesses},
        )

    def test_key_derivation_requires_modeled_attribute_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture(directory)
            path = root / "rules" / "rule--payment-request-amount.yaml"
            rule = self.read_yaml(path)
            rule["expression"] = "19900"
            self.write_yaml(path, rule)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("key derived attribute must trace" in error for error in errors),
                errors,
            )

    def test_attribute_lineage_cycle_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture(directory)
            request_path = (
                root / "entities" / "evidence-fulfillment-request--content-payment.yaml"
            )
            request = self.read_yaml(request_path)
            started_at = next(
                attribute
                for attribute in request["attributes"]
                if attribute["name"] == "started_at"
            )
            started_at["derivedByRuleRef"] = "rule.payment-start"
            self.write_yaml(request_path, request)
            self.write_yaml(
                root / "rules" / "rule--payment-start.yaml",
                {
                    "type": "rule",
                    "id": "rule.payment-start",
                    "kind": "derivation",
                    "label": "从截止时间反推开始时间",
                    "contextRef": "context.content-subscription",
                    "bindings": {"request": {"ref": "request.content-payment"}},
                    "expression": 'request.expired_at - duration("30m")',
                    "resultType": "timestamp",
                    "target": {
                        "entityRef": "request.content-payment",
                        "attribute": "started_at",
                    },
                },
            )
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("attribute lineage cycle" in error for error in errors), errors
            )

    def test_collection_macro_maps_local_attribute_to_many_binding(self) -> None:
        accesses, errors = extract_rule_attribute_accesses(
            {
                "id": "rule.total-paid",
                "bindings": {
                    "payments": {
                        "ref": "confirmation.content-payment",
                        "cardinality": "many",
                    }
                },
                "expression": "payments.all(payment, payment.paid_minor_units > 0)",
            }
        )
        self.assertEqual([], errors)
        self.assertEqual(
            [("confirmation.content-payment", "paid_minor_units")],
            [(access.entity_ref, access.attribute) for access in accesses],
        )


if __name__ == "__main__":
    unittest.main()
