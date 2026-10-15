from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from context_samples import attribute, domain_documents, entity, write_model
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    fulfillment_members,
    load_model,
    validate_model,
)


def documents():
    context = "context.agreement"
    result = [
        entity(context, "context", "contract", "服务协议", rootRefs=["contract.agreement"]),
        entity("role.customer", "role", "party", "客户", contextRef=context),
        entity("role.provider", "role", "party", "服务方", contextRef=context),
        entity("contract.agreement", "evidence", "contract", "服务合同", contextRef=context,
               roleRefs=["role.customer", "role.provider"],
               attributes=[attribute("signed_at", "timestamp", "签约时间", keyData=True)]),
    ]
    for name in ("delivery", "acceptance"):
        fulfillment = f"fulfillment.{name}"
        result.extend([
            {"type": "entity", "id": fulfillment, "category": "fulfillment", "label": name, "contextRef": context},
            entity(f"request.{name}", "evidence", "fulfillment_request", f"{name}请求",
                   contextRef=context, fulfillmentRef=fulfillment, responsibleRoleRef="role.customer",
                   attributes=[attribute("started_at", "timestamp", "开始时间", keyData=True),
                               attribute("expired_at", "timestamp", "截止时间", keyData=True)]),
            entity(f"confirmation.{name}", "evidence", "fulfillment_confirmation", f"{name}结果",
                   contextRef=context, fulfillmentRef=fulfillment, responsibleRoleRef="role.provider",
                   attributes=[attribute("confirmed_at", "timestamp", "确认时间", keyData=True)]),
            {"type": "rule", "id": f"rule.{name}", "kind": "completion", "label": "完成", "description": "确认形成即完成",
             "contextRef": context, "fulfillmentRef": fulfillment,
             "bindings": {"confirmation": {"ref": f"confirmation.{name}"}},
             "expression": "confirmation.confirmed_at != null", "resultType": "bool"},
        ])
    result.append({"type": "relationship", "id": "relation.delivery-acceptance", "kind": "references",
                   "sourceRef": "request.acceptance", "targetRef": "confirmation.delivery", "label": "验收依据交付结果"})
    return result


class FulfillmentStructureTests(unittest.TestCase):
    def errors(self, values, *, complete=False):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            return validate_model(load_model(root), complete=complete)

    def test_same_contract_fulfillments_reference_evidence_directly(self):
        self.assertEqual([], self.errors(documents()))

    def test_shared_contract_proof_role_is_resolved_from_explicit_reference(self):
        values = documents()
        values.append(entity("role.external-result", "role", "evidence", "外部结果", contextRef="context.agreement"))
        relationships = [
            {"kind": "references", "sourceRef": f"request.{name}", "targetRef": "role.external-result"}
            for name in ("delivery", "acceptance")
        ]
        index = {v["id"]: v for v in values if v.get("type") == "entity"}
        for name in ("delivery", "acceptance"):
            requests, confirmations, roles = fulfillment_members(f"fulfillment.{name}", index, iter(relationships))
            self.assertEqual([f"request.{name}"], [v["id"] for v in requests])
            self.assertEqual([f"confirmation.{name}"], [v["id"] for v in confirmations])
            self.assertEqual(["role.external-result"], [v["id"] for v in roles])

    def test_business_reference_does_not_adopt_another_fulfillments_confirmation(self):
        values = documents()
        values[-1]["kind"] = "references"
        index = {v["id"]: v for v in values if v.get("type") == "entity"}
        _, confirmations, _ = fulfillment_members("fulfillment.acceptance", index, [values[-1]])
        self.assertEqual(["confirmation.acceptance"], [v["id"] for v in confirmations])

    def test_fulfillment_is_not_an_entry_context(self):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), documents(), "fulfillment.delivery")
            self.assertTrue(any("non-Context" in error for error in validate_model(load_model(root))))

    def test_membership_must_share_the_contract_context(self):
        values = documents()
        values.extend(domain_documents())
        request = next(v for v in values if v["id"] == "request.acceptance")
        request["contextRef"] = "context.customer-information"
        self.assertTrue(any("fulfillmentRef" in error for error in self.errors(values)))

    def test_membership_can_be_unknown_but_is_required_for_scope_completion(self):
        values = documents()
        next(v for v in values if v["id"] == "request.delivery").pop("fulfillmentRef")
        self.assertEqual([], self.errors(values))
        self.assertTrue(any("fulfillmentRef" in error for error in self.errors(values, complete=True)))

    def test_role_player_in_same_contract_is_rejected(self):
        values = documents()
        values.extend([
            entity("role.result", "role", "evidence", "外部结果", contextRef="context.agreement", fulfillmentRef="fulfillment.acceptance"),
            {"type": "relationship", "id": "relation.result-player", "kind": "plays_role",
             "sourceRef": "confirmation.delivery", "targetRef": "role.result", "label": "结果扮演"},
        ])
        self.assertTrue(any("another Context" in error for error in self.errors(values)))

    def test_fulfillment_context_kind_is_rejected(self):
        values = documents()
        item = next(v for v in values if v["id"] == "fulfillment.delivery")
        item.update(category="context", kind="fulfillment", parentContextRef=item.pop("contextRef"))
        self.assertTrue(self.errors(values))

    def test_completion_rule_requires_matching_fulfillment(self):
        values = documents()
        rule = next(v for v in values if v["id"] == "rule.delivery")
        rule.pop("fulfillmentRef")
        self.assertTrue(any("fulfillmentRef" in error for error in self.errors(values)))

    def test_cross_contract_moment_reference_is_valid_but_contract_reference_is_not(self):
        values = documents()
        other = copy.deepcopy(values[0])
        other.update(id="context.other", rootRefs=["contract.other"])
        values.extend([other,
            entity("role.other-a", "role", "party", "甲方", contextRef="context.other"),
            entity("role.other-b", "role", "party", "乙方", contextRef="context.other"),
            entity("contract.other", "evidence", "contract", "其他合同", contextRef="context.other",
                   roleRefs=["role.other-a", "role.other-b"],
                   attributes=[attribute("signed_at", "timestamp", "签约时间", keyData=True)]),
            entity("evidence.other", "evidence", "other_evidence", "外部记录", contextRef="context.other",
                   responsibleRoleRef="role.other-a",
                   attributes=[attribute("created_at", "timestamp", "形成时间", keyData=True)]),
            {"type": "relationship", "id": "relation.cross", "kind": "references",
             "sourceRef": "request.acceptance", "targetRef": "evidence.other", "label": "跨边界读取"},
        ])
        self.assertEqual([], self.errors(values))
        values[-1]["targetRef"] = "contract.other"
        self.assertTrue(any("unsupported cross-context" in error for error in self.errors(values)))
