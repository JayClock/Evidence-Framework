"""A Fulfillment wraps a known request/result pair, never an empty obligation."""
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

    def unwrap_delivery(self):
        values = [v for v in documents() if v["id"] not in {
            "fulfillment.delivery", "rule.delivery",
        }]
        for item in values:
            if item.get("fulfillmentRef") == "fulfillment.delivery":
                item.pop("fulfillmentRef")
        return values

    def test_empty_wrapper_is_an_error_even_before_scope_completion(self):
        values = documents() + [{
            "type": "entity", "id": "fulfillment.refund", "category": "fulfillment",
            "label": "退款（Refund）", "contextRef": "context.agreement",
        }]
        errors = self.errors(values)
        self.assertTrue(any("fulfillment.refund" in e and "Request" in e for e in errors), errors)
        self.assertTrue(any("fulfillment.refund" in e and "Confirmation" in e for e in errors), errors)

    def test_each_missing_endpoint_invalidates_an_existing_wrapper(self):
        for missing in ("request.delivery", "confirmation.delivery"):
            with self.subTest(missing=missing):
                values = [v for v in documents() if v["id"] not in {
                    missing, "rule.delivery", "relation.delivery-acceptance",
                }]
                self.assertTrue(any("fulfillment.delivery" in e for e in self.errors(values)))

    def test_contract_bound_request_can_be_saved_before_confirmation_is_known(self):
        values = [v for v in self.unwrap_delivery() if v["id"] != "confirmation.delivery"
                  and v.get("targetRef") != "confirmation.delivery"]
        self.assertIn("relation.delivery-contract", {v["id"] for v in values})
        self.assertNotIn("fulfillment.delivery", {v["id"] for v in values})
        self.assertEqual([], self.errors(values))

    def test_confirmation_can_be_saved_without_inventing_a_request(self):
        values = [v for v in self.unwrap_delivery() if v["id"] != "request.delivery"
                  and v.get("sourceRef") != "request.delivery"
                  and v.get("targetRef") != "request.delivery"]
        self.assertEqual([], self.errors(values))

    def test_unwrapped_sibling_endpoints_block_the_whole_contract_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), self.unwrap_delivery(), "context.agreement")
            report = check_fm.check_model(root, scope_refs=["context.agreement"])
            self.assertTrue(report["consistent"], report)
            self.assertFalse(report["complete"])
            for endpoint in ("request.delivery", "confirmation.delivery"):
                self.assertTrue(any(endpoint in gap for gap in report["gaps"]), report)

    def test_pair_can_be_wrapped_before_its_completion_rule_is_known(self):
        values = [v for v in documents() if v["id"] != "rule.delivery"]
        self.assertEqual([], self.errors(values))
        self.assertTrue(any("rule" in e.lower() and "fulfillment.delivery" in e
                            for e in self.errors(values, complete=True)))

    def test_supporting_proof_role_is_not_a_confirmation_endpoint(self):
        values = [v for v in documents() if v["id"] not in {
            "confirmation.delivery", "rule.delivery", "relation.delivery-acceptance",
        }]
        values += [
            entity("role.support", "role", "evidence", "支撑证明（Supporting Proof）",
                   contextRef="context.agreement"),
            {"type": "relationship", "id": "relation.support", "kind": "references",
             "sourceRef": "request.delivery", "targetRef": "role.support", "label": "请求依据"},
        ]
        errors = self.errors(values)
        self.assertTrue(any("fulfillment.delivery" in e and "Confirmation" in e for e in errors), errors)

    def test_explicit_confirmation_role_can_wrap_without_inventing_a_player(self):
        values = [v for v in documents() if v["id"] not in {"confirmation.delivery", "rule.delivery", "relation.delivery-acceptance"}]
        values.append(entity("role.result", "role", "evidence", "交付结果（Delivery Result）",
                             contextRef="context.agreement", fulfillmentRef="fulfillment.delivery"))
        self.assertEqual([], self.errors(values))
        self.assertFalse(any(v.get("kind") == "plays_role" for v in values))

    def test_multiple_confirmation_types_do_not_require_multiple_wrappers(self):
        values = documents()
        second = copy.deepcopy(next(v for v in values if v["id"] == "confirmation.delivery"))
        second.update(id="confirmation.delivery-quality", label="质量结果（Quality Result）")
        self.assertEqual([], self.errors(values + [second]))

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
        root = Path(__file__).resolve().parents[1] / "examples/domain"
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
