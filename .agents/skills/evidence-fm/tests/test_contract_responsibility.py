from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
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
            ("fulfillment", "other_evidence"),
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
