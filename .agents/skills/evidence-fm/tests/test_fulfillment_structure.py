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
        result.extend([
            entity(f"request.{name}", "evidence", "fulfillment_request", f"{name}请求",
                   contextRef=context, responsibleRoleRef="role.customer",
                   attributes=[attribute("started_at", "timestamp", "开始时间", keyData=True),
                               attribute("expired_at", "timestamp", "截止时间", keyData=True)]),
            {"type": "relationship", "id": f"relation.{name}-contract", "kind": "references",
             "sourceRef": f"request.{name}", "targetRef": "contract.agreement", "label": "请求依据服务合同"},
            entity(f"confirmation.{name}", "evidence", "fulfillment_confirmation", f"{name}结果",
                   contextRef=context, responsibleRoleRef="role.provider",
                   attributes=[attribute("confirmed_at", "timestamp", "确认时间", keyData=True)]),
            {"type": "relationship", "id": f"relation.{name}-confirmation", "kind": "references",
             "sourceRef": f"confirmation.{name}", "targetRef": f"request.{name}", "label": "确认关联请求"},
            {"type": "rule", "id": f"rule.{name}", "kind": "completion", "label": "完成", "description": "确认形成即完成",
             "contextRef": context,
             "bindings": {"request": {"ref": f"request.{name}"}, "confirmation": {"ref": f"confirmation.{name}"}},
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

    def test_supporting_proof_reference_does_not_become_a_result_endpoint(self):
        values = documents()
        values.append(entity("role.external-result", "role", "evidence", "外部结果", contextRef="context.agreement"))
        relationships = [v for v in values if v.get("type") == "relationship"] + [
            {"kind": "references", "sourceRef": f"request.{name}", "targetRef": "role.external-result"}
            for name in ("delivery", "acceptance")
        ]
        index = {v["id"]: v for v in values if v.get("type") == "entity"}
        for name in ("delivery", "acceptance"):
            requests, confirmations, roles = fulfillment_members(f"request.{name}", index, iter(relationships))
            self.assertEqual([f"request.{name}"], [v["id"] for v in requests])
            self.assertEqual([f"confirmation.{name}"], [v["id"] for v in confirmations])
            self.assertEqual([], roles)

    def test_business_reference_does_not_adopt_another_fulfillments_confirmation(self):
        values = documents()
        index = {v["id"]: v for v in values if v.get("type") == "entity"}
        rels = [v for v in values if v.get("type") == "relationship"]
        _, confirmations, _ = fulfillment_members("request.acceptance", index, rels)
        self.assertEqual(["confirmation.acceptance"], [v["id"] for v in confirmations])

    def test_fulfillment_is_not_an_entry_context(self):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), documents(), "request.delivery")
            self.assertTrue(any("non-Context" in error for error in validate_model(load_model(root))))

    def test_membership_must_share_the_contract_context(self):
        values = documents()
        values.extend(domain_documents())
        request = next(v for v in values if v["id"] == "request.acceptance")
        request["contextRef"] = "context.customer-information"
        self.assertTrue(any("Contract Context" in error for error in self.errors(values)))

    def test_confirmation_must_be_associated_with_request(self):
        values = documents()
        values = [v for v in values if v.get("id") not in {"relation.delivery-confirmation", "rule.delivery"}]
        self.assertTrue(any("confirmation.delivery" in error for error in self.errors(values, complete=True)))

    def test_role_player_in_same_contract_is_rejected(self):
        values = documents()
        values.extend([
            entity("role.result", "role", "evidence", "外部结果", contextRef="context.agreement"),
            {"type": "relationship", "id": "relation.result-player", "kind": "plays_role",
             "sourceRef": "confirmation.delivery", "targetRef": "role.result", "label": "结果扮演"},
        ])
        self.assertTrue(any("another Context" in error for error in self.errors(values)))

    def test_fulfillment_category_is_rejected(self):
        values = documents()
        values.append({"type": "entity", "id": "fulfillment.test", "category": "fulfillment", "label": "非法履约实体", "contextRef": "context.agreement"})
        self.assertTrue(self.errors(values))

    def test_completion_rule_requires_request_binding(self):
        values = documents()
        rule = next(v for v in values if v["id"] == "rule.delivery")
        rule["bindings"] = {"confirmation": {"ref": "confirmation.delivery"}}
        self.assertTrue(any("fulfillment_request" in error for error in self.errors(values)))

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
