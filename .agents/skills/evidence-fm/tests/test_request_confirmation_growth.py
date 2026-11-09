"""Pure graph requests and confirmations grow incrementally without a fulfillment container."""
from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import check_fm  # pyright: ignore[reportMissingImports]  # noqa: E402
from context_samples import entity, write_model
from fm_model import load_model, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_scope import ready_scope  # pyright: ignore[reportMissingImports]  # noqa: E402
from test_fulfillment_structure import documents


class RequestConfirmationGrowthTests(unittest.TestCase):
    def errors(self, values, *, complete=False):
        with tempfile.TemporaryDirectory() as directory:
            model = load_model(write_model(Path(directory), values, "context.agreement"))
            return validate_model(model, complete=complete)

    def test_fulfillment_category_is_rejected(self):
        values = documents() + [{
            "type": "entity", "id": "fulfillment.refund", "category": "fulfillment",
            "label": "退款（Refund）", "contextRef": "context.agreement",
        }]
        errors = self.errors(values)
        self.assertTrue(errors)

    def test_missing_confirmation_fails_completeness(self):
        values = [v for v in documents() if v["id"] not in {
            "confirmation.delivery", "relation.delivery-confirmation", "rule.delivery", "relation.delivery-acceptance",
        }]
        self.assertEqual([], self.errors(values, complete=False))
        self.assertTrue(any("confirmation" in e.lower() or "request.delivery" in e for e in self.errors(values, complete=True)))

    def test_contract_bound_request_can_be_saved_before_confirmation_is_known(self):
        values = [v for v in documents() if v["id"] not in {
            "confirmation.delivery", "relation.delivery-confirmation", "rule.delivery", "relation.delivery-acceptance",
        }]
        self.assertIn("relation.delivery-contract", {v["id"] for v in values})
        self.assertEqual([], self.errors(values))

    def test_confirmation_can_be_saved_without_inventing_a_request(self):
        values = [v for v in documents() if v["id"] not in {
            "request.delivery", "relation.delivery-contract", "relation.delivery-confirmation", "rule.delivery", "relation.delivery-acceptance",
        }]
        self.assertEqual([], self.errors(values))

    def test_unpaired_request_reports_completeness_gap(self):
        values = [v for v in documents() if v["id"] not in {
            "confirmation.delivery", "relation.delivery-confirmation", "rule.delivery", "relation.delivery-acceptance",
        }]
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            report = check_fm.check_model(root, scope_refs=["context.agreement"])
            self.assertTrue(report["consistent"], report)
            self.assertFalse(report["complete"])
            self.assertTrue(any("request.delivery" in gap or "confirmation" in gap.lower() for gap in report["gaps"]), report)

    def test_pair_can_exist_before_its_completion_rule_is_known(self):
        values = [v for v in documents() if v["id"] != "rule.delivery"]
        self.assertEqual([], self.errors(values, complete=False))
        self.assertEqual([], self.errors(values, complete=True))

    def test_explicit_confirmation_role_can_satisfy_result_without_inventing_a_player(self):
        values = [v for v in documents() if v["id"] not in {"confirmation.delivery", "relation.delivery-confirmation", "rule.delivery", "relation.delivery-acceptance"}]
        values.extend([
            entity("role.result", "role", "evidence", "交付结果（Delivery Result）", contextRef="context.agreement"),
            {"type": "relationship", "id": "relation.delivery-result", "kind": "references",
             "sourceRef": "request.delivery", "targetRef": "role.result", "label": "请求采信结果"},
        ])
        self.assertEqual([], self.errors(values))
        self.assertFalse(any(v.get("kind") == "plays_role" for v in values))

    def test_multiple_confirmation_types_are_supported(self):
        values = documents()
        second = copy.deepcopy(next(v for v in values if v["id"] == "confirmation.delivery"))
        second.update(id="confirmation.delivery-quality", label="质量结果（Quality Result）")
        second_rel = {"type": "relationship", "id": "relation.delivery-quality-rel", "kind": "references",
                      "sourceRef": "confirmation.delivery-quality", "targetRef": "request.delivery", "label": "质量确认依据交付请求"}
        self.assertEqual([], self.errors(values + [second, second_rel]))

    def test_previous_schema_is_rejected_instead_of_implicitly_migrated(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), documents(), "context.agreement")
            manifest = root / "model.json"
            value = json.loads(manifest.read_text())
            value["schemaVersion"] = "4.0"
            manifest.write_text(json.dumps(value), encoding="utf-8")
            before = manifest.read_bytes()
            self.assertTrue(validate_model(load_model(root)))
            self.assertEqual(before, manifest.read_bytes())

    def test_scope_report_requires_current_contract_binding_check(self):
        root = Path(__file__).resolve().parents[1] / "tests/fixtures/models/domain"
        model = load_model(root)
        scopes = [item["id"] for item in model.entities
                  if item.get("category") == "context" and not item.get("parentContextRef")]
        report = check_fm.check_model(root, scope_refs=scopes)
        self.assertEqual(5, report["checkVersion"])
        self.assertTrue(report["complete"], report)
        for previous in (2, 3, 4):
            with self.subTest(checkVersion=previous), self.assertRaises(ValueError):
                ready_scope(model, dict(report, checkVersion=previous))


if __name__ == "__main__":
    unittest.main()
