from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    validate_entities,
    validate_evidence_responsibility,
    validate_party_role_owner,
    validate_relationships,
)


class ContractResponsibilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.owner = {
            "id": "context.purchase",
            "category": "context",
            "kind": "contract",
            "rootRefs": ["contract.purchase"],
        }
        self.entities = {
            "context.purchase": self.owner,
            "contract.purchase": {
                "id": "contract.purchase",
                "category": "evidence",
                "kind": "contract",
                "contextRef": "context.purchase",
                "roleRefs": ["role.customer", "role.supplier"],
            },
        }
        for name in ("customer", "supplier", "unbound"):
            self.entities[f"role.{name}"] = {
                "id": f"role.{name}",
                "category": "role",
                "kind": "party",
                "contextRef": "context.purchase",
            }

    def errors(self, context, role="role.customer", kind="other_evidence"):
        errors = []
        evidence = {
            "id": "evidence.result",
            "category": "evidence",
            "kind": kind,
            "contextRef": context["id"],
            "responsibleRoleRef": role,
        }
        validate_evidence_responsibility(evidence, context, self.entities, errors)
        return errors

    def test_bound_evidence_uses_contract_roles_in_all_stages(self) -> None:
        for context_kind, evidence_kind in (
            ("pre_contract", "rfp"),
            ("pre_contract", "proposal"),
            ("fulfillment", "fulfillment_request"),
            ("fulfillment", "fulfillment_confirmation"),
            ("pre_contract", "other_evidence"),
        ):
            with self.subTest(context=context_kind, evidence=evidence_kind):
                context = {
                    "id": "context.stage",
                    "category": "context",
                    "kind": context_kind,
                    "parentContextRef": "context.purchase",
                }
                for role in ("role.customer", "role.supplier"):
                    self.assertEqual([], self.errors(context, role, evidence_kind))
                errors = self.errors(context, "role.unbound", evidence_kind)
                self.assertTrue(any("bound by Contract" in e for e in errors), errors)

    def test_contract_context_other_evidence_requires_bound_role(self) -> None:
        self.assertEqual([], self.errors(self.owner))
        self.assertTrue(self.errors(self.owner, "role.unbound"))

    def test_other_evidence_cannot_belong_to_fulfillment(self) -> None:
        fulfillment = {
            "id": "fulfillment.purchase",
            "category": "context",
            "kind": "fulfillment",
            "parentContextRef": "context.purchase",
        }
        evidence = {
            "id": "evidence.purchase-note",
            "category": "evidence",
            "kind": "other_evidence",
            "contextRef": "fulfillment.purchase",
            "responsibleRoleRef": "role.customer",
            "attributes": [
                {
                    "name": "created_at",
                    "label": "形成时间",
                    "valueType": "timestamp",
                    "required": True,
                    "keyData": True,
                    "meaning": "补充凭证形成时间",
                }
            ],
        }
        self.entities.update({fulfillment["id"]: fulfillment, evidence["id"]: evidence})
        errors: list[str] = []
        validate_entities(list(self.entities.values()), self.entities, {}, errors)
        self.assertTrue(
            any(
                "other_evidence must belong to its owning Contract" in e for e in errors
            ),
            errors,
        )

    def test_contract_evidence_can_link_to_direct_child_fulfillment(self) -> None:
        fulfillment = {
            "id": "fulfillment.purchase",
            "type": "entity",
            "category": "context",
            "kind": "fulfillment",
            "parentContextRef": "context.purchase",
        }
        note = {
            "id": "evidence.purchase-note",
            "type": "entity",
            "category": "evidence",
            "kind": "other_evidence",
            "contextRef": "context.purchase",
        }
        request = {
            "id": "request.purchase",
            "type": "entity",
            "category": "evidence",
            "kind": "fulfillment_request",
            "contextRef": "fulfillment.purchase",
        }
        self.entities.update(
            {fulfillment["id"]: fulfillment, note["id"]: note, request["id"]: request}
        )
        for entity in self.entities.values():
            entity["type"] = "entity"

        for kind, source_ref, target_ref in (
            ("evidences", "evidence.purchase-note", "request.purchase"),
            ("precedes", "evidence.purchase-note", "request.purchase"),
            ("precedes", "request.purchase", "evidence.purchase-note"),
        ):
            with self.subTest(kind=kind, source=source_ref, target=target_ref):
                errors: list[str] = []
                validate_relationships(
                    [
                        {
                            "id": f"relation.{kind}-{source_ref}-{target_ref}",
                            "kind": kind,
                            "sourceRef": source_ref,
                            "targetRef": target_ref,
                        }
                    ],
                    self.entities,
                    {},
                    errors,
                )
                self.assertEqual([], errors)

    def test_contract_evidence_cannot_link_to_another_contract_fulfillment(
        self,
    ) -> None:
        other_contract = {
            "id": "context.other",
            "type": "entity",
            "category": "context",
            "kind": "contract",
        }
        fulfillment = {
            "id": "fulfillment.other",
            "type": "entity",
            "category": "context",
            "kind": "fulfillment",
            "parentContextRef": "context.other",
        }
        note = {
            "id": "evidence.purchase-note",
            "type": "entity",
            "category": "evidence",
            "kind": "other_evidence",
            "contextRef": "context.purchase",
        }
        request = {
            "id": "request.other",
            "type": "entity",
            "category": "evidence",
            "kind": "fulfillment_request",
            "contextRef": "fulfillment.other",
        }
        self.entities.update(
            {
                other_contract["id"]: other_contract,
                fulfillment["id"]: fulfillment,
                note["id"]: note,
                request["id"]: request,
            }
        )
        for entity in self.entities.values():
            entity["type"] = "entity"
        errors: list[str] = []
        validate_relationships(
            [
                {
                    "id": "relation.invalid-contract-bridge",
                    "kind": "evidences",
                    "sourceRef": "evidence.purchase-note",
                    "targetRef": "request.other",
                }
            ],
            self.entities,
            {},
            errors,
        )
        self.assertTrue(any("unsupported cross-context" in e for e in errors), errors)

    def test_cross_context_role_requires_explicit_responsibility_owner(self) -> None:
        context = {
            "id": "context.inquiry",
            "category": "context",
            "kind": "pre_contract",
        }
        self.assertTrue(self.errors(context, kind="rfp"))

    def test_standalone_precontract_does_not_require_a_contract(self) -> None:
        context = {
            "id": "context.inquiry",
            "category": "context",
            "kind": "pre_contract",
        }
        self.entities["role.inquirer"] = {
            "id": "role.inquirer",
            "category": "role",
            "kind": "party",
            "contextRef": "context.inquiry",
        }
        self.assertEqual([], self.errors(context, "role.inquirer", "rfp"))

    def test_bound_precontract_cannot_use_local_unbound_role(self) -> None:
        context = {
            "id": "context.inquiry",
            "category": "context",
            "kind": "pre_contract",
            "parentContextRef": "context.purchase",
        }
        self.entities["role.inquirer"] = {
            "id": "role.inquirer",
            "category": "role",
            "kind": "party",
            "contextRef": "context.inquiry",
        }
        self.assertTrue(self.errors(context, "role.inquirer", "rfp"))

    def test_responsibility_owner_requires_exactly_one_root_contract(self) -> None:
        self.owner["rootRefs"] = []
        self.assertTrue(
            any("exactly one root Contract" in e for e in self.errors(self.owner))
        )

    def test_stage_cannot_define_an_additional_party_role(self) -> None:
        context = {
            "id": "context.stage",
            "category": "context",
            "kind": "pre_contract",
            "parentContextRef": "context.purchase",
        }
        errors = []
        validate_party_role_owner(
            {"id": "role.stage", "contextRef": "context.stage"},
            context,
            self.entities,
            errors,
        )
        self.assertTrue(
            any("cannot define additional Party Roles" in e for e in errors)
        )

    def test_unused_contract_role_must_still_be_bound(self) -> None:
        errors = []
        validate_party_role_owner(
            self.entities["role.unbound"], self.owner, self.entities, errors
        )
        self.assertTrue(any("must be bound by the root Contract" in e for e in errors))

    def test_proposal_contract_link_requires_explicit_owner(self) -> None:
        precontract = {
            "id": "context.precontract",
            "category": "context",
            "kind": "pre_contract",
        }
        proposal = {
            "id": "proposal.offer",
            "category": "evidence",
            "kind": "proposal",
            "contextRef": "context.precontract",
        }
        self.entities.update({precontract["id"]: precontract, proposal["id"]: proposal})
        for entity in self.entities.values():
            entity["type"] = "entity"
        relationship = {
            "id": "relation.offer-contract",
            "kind": "precedes",
            "sourceRef": "proposal.offer",
            "targetRef": "contract.purchase",
        }
        errors = []
        validate_relationships([relationship], self.entities, {}, errors)
        self.assertTrue(any("Proposal Context must bind" in e for e in errors), errors)
        precontract["parentContextRef"] = "context.purchase"
        errors = []
        validate_relationships([relationship], self.entities, {}, errors)
        self.assertEqual([], errors)

    def test_non_party_role_is_rejected(self) -> None:
        self.assertTrue(
            any(
                "must reference a Party Role" in e
                for e in self.errors(self.owner, "role.missing")
            )
        )


if __name__ == "__main__":
    unittest.main()
