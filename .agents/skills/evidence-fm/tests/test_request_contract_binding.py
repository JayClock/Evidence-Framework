"""Requests explicitly cite their owning root Contract from the first save."""
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from context_samples import entity, write_model
from test_fulfillment_structure import documents

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import check_fm  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import load_model, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402


class RequestContractBindingTests(unittest.TestCase):
    def errors(self, values, *, complete=False):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            return validate_model(load_model(root), complete=complete)

    def without_binding(self, values):
        return [v for v in values if v["id"] != "relation.delivery-contract"]

    def assert_missing_binding(self, values, *, complete=False):
        errors = self.errors(values, complete=complete)
        self.assertTrue(any("request.delivery" in e and "root Contract" in e for e in errors), errors)

    def test_wrapped_and_unwrapped_requests_require_the_contract_in_both_check_modes(self):
        unwrapped = [v for v in documents() if v["id"] not in {"fulfillment.delivery", "rule.delivery"}]
        for item in unwrapped:
            if item.get("fulfillmentRef") == "fulfillment.delivery":
                item.pop("fulfillmentRef")
        for values in (documents(), unwrapped):
            for complete in (False, True):
                with self.subTest(wrapped=values is not unwrapped, complete=complete):
                    self.assert_missing_binding(self.without_binding(values), complete=complete)

    def test_only_a_direct_outgoing_references_edge_binds_the_request(self):
        for change in (
            {"sourceRef": "contract.agreement", "targetRef": "request.delivery"},
            {"kind": "plays_role"},
            {"targetRef": "confirmation.acceptance"},
            {"targetRef": "contract.unknown"},
        ):
            with self.subTest(change=change):
                values = documents()
                next(v for v in values if v["id"] == "relation.delivery-contract").update(change)
                self.assert_missing_binding(values)

    def test_an_indirect_proof_chain_does_not_replace_the_contract_binding(self):
        values = self.without_binding(documents()) + [
            {"type": "relationship", "id": "relation.delivery-proof", "kind": "references",
             "sourceRef": "request.delivery", "targetRef": "confirmation.acceptance", "label": "请求另有依据"},
            {"type": "relationship", "id": "relation.proof-contract", "kind": "references",
             "sourceRef": "confirmation.acceptance", "targetRef": "contract.agreement", "label": "证明引用合同"},
        ]
        self.assert_missing_binding(values)

    def test_another_contract_cannot_replace_the_owning_root(self):
        values = self.without_binding(documents())
        values += [
            entity("contract.other", "evidence", "contract", "另一合同（Other Contract）",
                   contextRef="context.agreement", roleRefs=["role.customer", "role.provider"]),
            {"type": "relationship", "id": "relation.wrong-contract", "kind": "references",
             "sourceRef": "request.delivery", "targetRef": "contract.other", "label": "错误的合同依据"},
        ]
        self.assert_missing_binding(values)

    def test_owning_contract_and_additional_proof_references_are_valid(self):
        # request.acceptance cites both its contract and the preceding delivery result.
        self.assertEqual([], self.errors(documents(), complete=True))

    def test_new_sibling_request_cannot_inherit_its_siblings_binding(self):
        values = documents()
        request = copy.deepcopy(next(v for v in values if v["id"] == "request.delivery"))
        request.update(id="request.refund", label="退款请求（Refund Request）")
        request.pop("fulfillmentRef")
        errors = self.errors(values + [request])
        self.assertTrue(any("request.refund" in e and "root Contract" in e for e in errors), errors)

    def test_missing_contract_binding_is_an_error_not_a_completeness_gap_and_is_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), self.without_binding(documents()), "context.agreement")
            before = {p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            for scope in (None, ["context.agreement"]):
                report = check_fm.check_model(root, scope_refs=scope)
                self.assertFalse(report["consistent"], report)
                self.assertFalse(report["valid"], report)
                self.assertTrue(any("request.delivery" in e and "root Contract" in e for e in report["errors"]), report)
                self.assertFalse(any("root Contract" in gap for gap in report["gaps"]), report)
            script = Path(__file__).resolve().parents[1] / "scripts/check_fm.py"
            result = subprocess.run([sys.executable, "-B", str(script), str(root)], capture_output=True, text=True)
            self.assertEqual(1, result.returncode, result.stderr)
            self.assertFalse(json.loads(result.stdout)["consistent"])
            self.assertEqual(before, {p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()})


if __name__ == "__main__":
    unittest.main()
