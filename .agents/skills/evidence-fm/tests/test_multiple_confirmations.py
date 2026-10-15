"""Synthetic partial delivery and distinct confirmation types for one request."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from context_samples import attribute, entity, write_document, write_model
from fm_model import load_model, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_simulation import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    load_validation_suite,
    simulate_validation_suite,
)


def documents():
    context = "context.delivery"
    fulfillment = "fulfillment.delivery"
    result = [
        entity(context, "context", "contract", "交付合同上下文（Delivery Contract Context）",
               rootRefs=["contract.delivery"]),
        entity("role.buyer", "role", "party", "买方（Buyer）", contextRef=context),
        entity("role.seller", "role", "party", "卖方（Seller）", contextRef=context),
        entity("contract.delivery", "evidence", "contract", "交付合同（Delivery Contract）",
               contextRef=context, roleRefs=["role.buyer", "role.seller"],
               attributes=[attribute("signed_at", "timestamp", "签约时间（Signing Time）", keyData=True)]),
        {"type": "entity", "id": fulfillment, "category": "fulfillment",
         "label": "交付（Delivery）", "contextRef": context},
        entity("request.delivery", "evidence", "fulfillment_request", "交付请求（Delivery Request）",
               contextRef=context, fulfillmentRef=fulfillment, responsibleRoleRef="role.buyer",
               attributes=[attribute("started_at", "timestamp", "开始时间（Start Time）", keyData=True),
                           attribute("expired_at", "timestamp", "截止时间（Deadline）", keyData=True),
                           attribute("requested_units", "int", "请求数量（Requested Quantity）", keyData=True)]),
        {"type": "relationship", "id": "relation.delivery-contract", "kind": "references",
         "sourceRef": "request.delivery", "targetRef": "contract.delivery", "label": "交付请求依据交付合同"},
    ]
    for name, label, responsible, extra in (
        ("delivery", "交付确认（Delivery Confirmation）", "role.seller",
         attribute("cumulative_delivered_units", "int", "累计交付数量（Cumulative Delivered Quantity）", keyData=True)),
        ("quality", "质量验收确认（Quality Acceptance Confirmation）", "role.buyer",
         attribute("accepted", "bool", "验收合格（Accepted）", keyData=True)),
    ):
        result.extend([
            entity(f"confirmation.{name}", "evidence", "fulfillment_confirmation", label,
                   contextRef=context, fulfillmentRef=fulfillment, responsibleRoleRef=responsible,
                   attributes=[attribute("confirmed_at", "timestamp", "确认时间（Confirmation Time）", keyData=True), extra]),
            {"type": "relationship", "id": f"relation.{name}-request", "kind": "references",
             "sourceRef": f"confirmation.{name}", "targetRef": "request.delivery",
             "label": f"{label}对应交付请求（Delivery Request）"},
        ])
    result.append({
        "type": "rule", "id": "rule.delivery-completed", "kind": "completion",
        "label": "交付完成（Delivery Completed）",
        "description": "交付确认（Delivery Confirmation）[confirmation.delivery]累计数量满足交付请求（Delivery Request）[request.delivery]，且质量验收确认（Quality Acceptance Confirmation）[confirmation.quality]合格时，交付完成。所有结果必须位于请求区间内。",
        "contextRef": context, "fulfillmentRef": fulfillment,
        "bindings": {"request": {"ref": "request.delivery"},
                     "deliveries": {"ref": "confirmation.delivery", "cardinality": "many"},
                     "qualities": {"ref": "confirmation.quality", "cardinality": "many"}},
        "expression": "deliveries.exists(d, d.cumulative_delivered_units >= request.requested_units) && deliveries.all(d, d.confirmed_at >= request.started_at && d.confirmed_at <= request.expired_at) && qualities.exists(q, q.accepted && q.confirmed_at >= request.started_at && q.confirmed_at <= request.expired_at)",
        "resultType": "bool",
    })
    return result


class MultipleConfirmationTests(unittest.TestCase):
    def simulate(self, quantities, quality, expected_status):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), documents(), "context.delivery")
            instances = [
                {"type": "evidence_instance", "id": "instance.contract", "entityRef": "contract.delivery",
                 "values": {"signed_at": "2026-09-01T00:00:00Z"}},
                {"type": "evidence_instance", "id": "instance.request", "entityRef": "request.delivery",
                 "values": {"started_at": "2026-09-02T00:00:00Z", "expired_at": "2026-09-30T00:00:00Z", "requested_units": 100},
                 "basedOn": ["instance.contract"]},
            ]
            steps = [{"sequence": 1, "actingRoleRef": "role.buyer", "issueInstanceRef": "instance.request"}]
            delivery_refs = []
            # The synthetic source records a running total in each confirmation.
            cumulative_quantity = 0
            for index, quantity in enumerate(quantities, 1):
                cumulative_quantity += quantity
                ref = f"instance.delivery-{index}"
                delivery_refs.append(ref)
                instances.append({"type": "evidence_instance", "id": ref, "entityRef": "confirmation.delivery",
                                  "values": {"confirmed_at": f"2026-09-{index + 2:02d}T00:00:00Z", "cumulative_delivered_units": cumulative_quantity},
                                  "basedOn": ["instance.request"]})
                steps.append({"sequence": len(steps) + 1, "actingRoleRef": "role.seller", "issueInstanceRef": ref})
            quality_refs = []
            if quality is not None:
                quality_refs.append("instance.quality")
                instances.append({"type": "evidence_instance", "id": "instance.quality", "entityRef": "confirmation.quality",
                                  "values": {"confirmed_at": "2026-09-10T00:00:00Z", "accepted": quality},
                                  "basedOn": ["instance.request", *delivery_refs]})
                steps.append({"sequence": len(steps) + 1, "actingRoleRef": "role.buyer", "issueInstanceRef": "instance.quality"})
            for instance in instances:
                write_document(root / "validation/instances" / f"{instance['id'].replace('.', '--')}.json", instance)
            write_document(root / "validation/scenarios/scenario--delivery.json", {
                "type": "fm_scenario", "id": "scenario.delivery", "label": "合成的分批交付与质量确认",
                "asOf": "2026-09-15T00:00:00Z", "givenInstanceRefs": ["instance.contract"], "steps": steps,
                "evaluations": [{"ruleRef": "rule.delivery-completed",
                                 "bindings": {"request": {"instanceRef": "instance.request"},
                                              "deliveries": {"instanceRefs": delivery_refs},
                                              "qualities": {"instanceRefs": quality_refs}},
                                 "expectedResult": expected_status == "completed"}],
                "expectations": {"fulfillmentStatuses": [{"fulfillmentRef": "fulfillment.delivery",
                                                         "requestInstanceRef": "instance.request", "status": expected_status}]},
            })
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            report, errors = simulate_validation_suite(model, load_validation_suite(root))
            self.assertEqual([], errors)
            self.assertTrue(report["simulationPassed"])
            status = report["scenarioResults"][0]["fulfillmentStatuses"][0]["status"]
            self.assertEqual(expected_status, status)

    def test_partial_confirmation_is_valid_but_request_remains_pending(self):
        self.simulate([40], None, "pending")

    def test_full_quantity_without_the_distinct_quality_confirmation_is_pending(self):
        self.simulate([40, 60], None, "pending")

    def test_repeated_deliveries_and_distinct_quality_confirmation_complete_one_request(self):
        self.simulate([40, 60], True, "completed")

    def test_a_quality_confirmation_that_fails_the_rule_does_not_complete_the_request(self):
        self.simulate([40, 60], False, "pending")


if __name__ == "__main__":
    unittest.main()
