from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from context_samples import attribute, entity, write_document, write_model
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    load_model,
    validate_model,
)
from fm_simulation import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    load_validation_suite,
    simulate_validation_suite,
)


def shared_confirmation_documents() -> list[dict]:
    contract_context = "context.performance"
    shared_confirmation = "confirmation.income"
    documents = [
        entity(
            contract_context,
            "context",
            "contract",
            "绩效协议上下文",
            rootRefs=["contract.performance"],
        ),
        entity(
            "role.manager",
            "role",
            "party",
            "管理方",
            contextRef=contract_context,
        ),
        entity(
            "role.employee",
            "role",
            "party",
            "执行方",
            contextRef=contract_context,
        ),
        entity(
            "contract.performance",
            "evidence",
            "contract",
            "绩效协议",
            contextRef=contract_context,
            roleRefs=["role.manager", "role.employee"],
            attributes=[
                attribute("signed_at", "timestamp", "绩效协议签署时间", keyData=True)
            ],
        ),
        entity(
            shared_confirmation,
            "evidence",
            "fulfillment_confirmation",
            "收入确认",
            contextRef=contract_context,
            responsibleRoleRef="role.employee",
            attributes=[
                attribute(
                    "confirmed_at", "timestamp", "收入确认形成时间", keyData=True
                ),
                attribute("income_minor_units", "int", "确认收入金额", keyData=True),
            ],
        ),
    ]

    for period, label in (("quarterly", "季度指标"), ("annual", "年度指标")):
        fulfillment = f"fulfillment.{period}-target"
        request = f"request.{period}-target"
        documents.extend(
            [
                entity(
                    fulfillment,
                    "context",
                    "fulfillment",
                    label,
                    parentContextRef=contract_context,
                ),
                entity(
                    request,
                    "evidence",
                    "fulfillment_request",
                    label + "请求",
                    contextRef=fulfillment,
                    responsibleRoleRef="role.manager",
                    attributes=[
                        attribute(
                            "started_at", "timestamp", label + "开始时间", keyData=True
                        ),
                        attribute(
                            "expired_at", "timestamp", label + "截止时间", keyData=True
                        ),
                    ],
                ),
                {
                    "type": "relationship",
                    "id": f"relation.{period}-request-to-income-confirmation",
                    "kind": "precedes",
                    "sourceRef": request,
                    "targetRef": shared_confirmation,
                    "label": label + "请求关联共同收入确认",
                    "sourceCardinality": {"min": 1, "max": 1},
                    "targetCardinality": {"min": 1, "max": "many"},
                },
                {
                    "type": "rule",
                    "id": f"rule.{period}-target-completed",
                    "kind": "completion",
                    "label": label + "完成",
                    "description": (
                        f"收入确认（{shared_confirmation}）在{label}请求（{request}）"
                        "有效期内形成时，该指标履约完成。"
                    ),
                    "contextRef": fulfillment,
                    "bindings": {
                        "request": {"ref": request},
                        "confirmations": {
                            "ref": shared_confirmation,
                            "cardinality": "many",
                        },
                    },
                    "expression": (
                        "confirmations.exists(c, c.confirmed_at >= request.started_at && "
                        "c.confirmed_at <= request.expired_at)"
                    ),
                    "resultType": "bool",
                },
            ]
        )
    return documents


class SharedConfirmationTests(unittest.TestCase):
    def test_pdf_page_39_shared_confirmation_validates_and_completes_both_requests(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory), shared_confirmation_documents(), "context.performance"
            )
            instances = [
                {
                    "type": "evidence_instance",
                    "id": "instance.performance-contract",
                    "entityRef": "contract.performance",
                    "values": {"signed_at": "2026-01-01T00:00:00Z"},
                },
                {
                    "type": "evidence_instance",
                    "id": "instance.quarterly-request",
                    "entityRef": "request.quarterly-target",
                    "values": {
                        "started_at": "2026-01-01T00:00:00Z",
                        "expired_at": "2026-12-31T23:59:59Z",
                    },
                    "basedOn": ["instance.performance-contract"],
                },
                {
                    "type": "evidence_instance",
                    "id": "instance.annual-request",
                    "entityRef": "request.annual-target",
                    "values": {
                        "started_at": "2026-01-01T00:00:00Z",
                        "expired_at": "2026-12-31T23:59:59Z",
                    },
                    "basedOn": ["instance.performance-contract"],
                },
                {
                    "type": "evidence_instance",
                    "id": "instance.income-confirmation",
                    "entityRef": "confirmation.income",
                    "values": {
                        "confirmed_at": "2026-12-20T00:00:00Z",
                        "income_minor_units": 100000,
                    },
                    "basedOn": [
                        "instance.quarterly-request",
                        "instance.annual-request",
                    ],
                },
            ]
            for instance in instances:
                write_document(
                    root
                    / "validation"
                    / "instances"
                    / f"{instance['id'].replace('.', '--')}.yaml",
                    instance,
                )
            write_document(
                root / "validation/scenarios/scenario--shared-income.yaml",
                {
                    "type": "fm_scenario",
                    "id": "scenario.shared-income",
                    "label": "季度与年度指标共同使用收入确认",
                    "asOf": "2026-12-31T23:59:59Z",
                    "givenInstanceRefs": ["instance.performance-contract"],
                    "steps": [
                        {
                            "sequence": 1,
                            "actingRoleRef": "role.manager",
                            "issueInstanceRef": "instance.quarterly-request",
                        },
                        {
                            "sequence": 2,
                            "actingRoleRef": "role.manager",
                            "issueInstanceRef": "instance.annual-request",
                        },
                        {
                            "sequence": 3,
                            "actingRoleRef": "role.employee",
                            "issueInstanceRef": "instance.income-confirmation",
                        },
                    ],
                    "evaluations": [
                        {
                            "ruleRef": "rule.quarterly-target-completed",
                            "bindings": {
                                "request": {
                                    "instanceRef": "instance.quarterly-request"
                                },
                                "confirmations": {
                                    "instanceRefs": ["instance.income-confirmation"]
                                },
                            },
                            "expectedResult": True,
                        },
                        {
                            "ruleRef": "rule.annual-target-completed",
                            "bindings": {
                                "request": {"instanceRef": "instance.annual-request"},
                                "confirmations": {
                                    "instanceRefs": ["instance.income-confirmation"]
                                },
                            },
                            "expectedResult": True,
                        },
                    ],
                    "expectations": {
                        "fulfillmentStatuses": [
                            {
                                "fulfillmentRef": "fulfillment.quarterly-target",
                                "requestInstanceRef": "instance.quarterly-request",
                                "status": "completed",
                            },
                            {
                                "fulfillmentRef": "fulfillment.annual-target",
                                "requestInstanceRef": "instance.annual-request",
                                "status": "completed",
                            },
                        ]
                    },
                },
            )

            model = load_model(root)
            self.assertEqual([], validate_model(model))
            report, errors = simulate_validation_suite(
                model, load_validation_suite(root)
            )
            self.assertEqual([], errors)
            self.assertTrue(report["simulationPassed"])
            statuses = report["scenarioResults"][0]["fulfillmentStatuses"]
            self.assertEqual(
                ["completed", "completed"], [s["status"] for s in statuses]
            )

    def test_shared_confirmation_cannot_cross_contract_responsibility_boundaries(
        self,
    ) -> None:
        documents = shared_confirmation_documents()
        foreign_context = entity(
            "context.foreign",
            "context",
            "contract",
            "外部合同上下文",
            rootRefs=["contract.foreign"],
        )
        foreign_role_a = entity(
            "role.foreign-a", "role", "party", "外部甲方", contextRef="context.foreign"
        )
        foreign_role_b = entity(
            "role.foreign-b", "role", "party", "外部乙方", contextRef="context.foreign"
        )
        foreign_contract = entity(
            "contract.foreign",
            "evidence",
            "contract",
            "外部合同",
            contextRef="context.foreign",
            roleRefs=["role.foreign-a", "role.foreign-b"],
            attributes=[
                attribute("signed_at", "timestamp", "外部合同签署时间", keyData=True)
            ],
        )
        changed = copy.deepcopy(documents)
        confirmation = next(
            item for item in changed if item["id"] == "confirmation.income"
        )
        confirmation["contextRef"] = "context.foreign"
        confirmation["responsibleRoleRef"] = "role.foreign-a"
        changed.extend(
            [foreign_context, foreign_role_a, foreign_role_b, foreign_contract]
        )

        with tempfile.TemporaryDirectory() as directory:
            model = load_model(
                write_model(Path(directory), changed, "context.performance")
            )
            errors = validate_model(model)
            self.assertTrue(
                any("unsupported cross-context precedes" in error for error in errors),
                errors,
            )


if __name__ == "__main__":
    unittest.main()
