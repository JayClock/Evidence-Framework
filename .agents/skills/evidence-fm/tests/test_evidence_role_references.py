"""Evidence references its local proof role; external results play that role."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from fm_model import validate_against_schema, validate_relationships  # pyright: ignore[reportMissingImports]  # noqa: E402


def entity(identity, category, kind, context="context.local"):
    return {"type": "entity", "id": identity, "category": category,
            "kind": kind, "contextRef": context}


class EvidenceRoleReferenceTests(unittest.TestCase):
    def errors(self, source, target, kind="references"):
        relation = {"type": "relationship", "id": "relation.proof", "kind": kind,
                    "sourceRef": source["id"], "targetRef": target["id"], "label": "证明引用"}
        errors = []
        validate_against_schema(relation, "relationship.schema.json", "relation.json", errors)
        validate_relationships([relation], {v["id"]: v for v in (source, target)}, {}, errors)
        return errors

    def test_all_evidence_kinds_can_reference_local_evidence_as_role(self):
        for kind in ("rfp", "proposal", "contract", "fulfillment_request",
                     "fulfillment_confirmation", "other_evidence"):
            with self.subTest(kind=kind):
                self.assertEqual([], self.errors(
                    entity("evidence.consumer", "evidence", kind),
                    entity("role.proof", "role", "evidence")))

    def test_evidence_cannot_reference_other_role_kinds(self):
        for kind in ("party", "domain", "third_party", "context"):
            with self.subTest(kind=kind):
                self.assertTrue(any("Evidence references must target" in error for error in self.errors(
                    entity("evidence.consumer", "evidence", "fulfillment_confirmation"),
                    entity("role.other", "role", kind))))

    def test_proof_role_must_belong_to_consuming_context(self):
        errors = self.errors(
            entity("evidence.consumer", "evidence", "fulfillment_confirmation"),
            entity("role.proof", "role", "evidence", "context.external"))
        self.assertTrue(any("unsupported cross-context references" in e for e in errors))

    def test_external_concrete_moment_can_be_referenced_without_role_abstraction(self):
        for kind in ("fulfillment_confirmation", "other_evidence"):
            self.assertEqual([], self.errors(
                entity("evidence.consumer", "evidence", "fulfillment_confirmation"),
                entity("evidence.external", "evidence", kind, "context.external")))
        for kind in ("fulfillment_request", "rfp", "proposal", "contract"):
            self.assertTrue(self.errors(
                entity("evidence.consumer", "evidence", "fulfillment_confirmation"),
                entity("evidence.external", "evidence", kind, "context.external")))

    def test_external_result_plays_role_instead_of_referencing_it(self):
        source = entity("evidence.external", "evidence", "fulfillment_confirmation", "context.external")
        target = entity("role.proof", "role", "evidence")
        self.assertEqual([], self.errors(source, target, "plays_role"))
        self.assertTrue(self.errors(source, target))
        source["contextRef"] = "context.local"
        self.assertTrue(any("another Context" in e for e in self.errors(source, target, "plays_role")))

    def test_existing_local_evidence_and_cross_context_thing_references_remain_valid(self):
        source = entity("evidence.consumer", "evidence", "fulfillment_request")
        for target in (
            entity("evidence.result", "evidence", "fulfillment_confirmation"),
            entity("thing.product", "participant", "thing", "context.catalog"),
        ):
            with self.subTest(target=target["id"]):
                self.assertEqual([], self.errors(source, target))

    def test_domain_object_can_reference_local_roles_without_a_separate_relation_kind(self):
        source = entity("thing.profile", "participant", "thing", "context.domain")
        for kind in ("party", "domain", "third_party", "context", "evidence"):
            with self.subTest(kind=kind):
                target = entity("role.local", "role", kind, "context.domain")
                self.assertEqual([], self.errors(source, target))
                target["contextRef"] = "context.external"
                self.assertTrue(self.errors(source, target))

    def test_removed_relation_kind_is_rejected_not_aliased(self):
        errors = self.errors(
            entity("evidence.consumer", "evidence", "fulfillment_request"),
            entity("role.proof", "role", "evidence"), "uses_role")
        self.assertTrue(any("not one of" in e for e in errors), errors)

    def test_self_reference_and_fulfillment_endpoints_remain_invalid(self):
        proof = entity("role.proof", "role", "evidence")
        self.assertTrue(any("self relationships" in e for e in self.errors(proof, proof)))
        fulfillment = {"type": "entity", "id": "fulfillment.pay", "category": "fulfillment", "contextRef": "context.local"}
        for source, target in ((proof, fulfillment), (fulfillment, proof)):
            self.assertTrue(any("Fulfillment must not" in e for e in self.errors(source, target)))


if __name__ == "__main__":
    unittest.main()
