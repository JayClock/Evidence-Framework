from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

from fm_model import (  # noqa: E402  # pyright: ignore[reportMissingImports]
    LoadedModel,
    validate_entities,
)
from fm_simulation import (  # noqa: E402  # pyright: ignore[reportMissingImports]
    validate_instance_binding,
)


class EvidenceRoleBindingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.role = {
            "type": "entity",
            "id": "role.proof",
            "label": "支付凭证",
            "category": "role",
            "kind": "evidence",
            "contextRef": "context.core",
        }
        self.context = {
            "id": "context.core",
            "category": "context",
            "kind": "external",
        }
        self.model = LoadedModel(
            root=Path("."),
            entities=[self.role, self.context],
            relationships=[
                {
                    "kind": "plays_role",
                    "sourceRef": "confirmation.external",
                    "targetRef": "role.proof",
                }
            ],
        )
        self.instances = {
            "instance.result": {"entityRef": "confirmation.external"},
            "instance.unrelated": {"entityRef": "confirmation.unrelated"},
            "instance.role": {"entityRef": "role.proof"},
        }
        self.schema = Draft202012Validator(
            json.loads((SKILL / "schemas/entity.schema.json").read_text())
        )

    def binding_errors(
        self, refs, target="role.proof", cardinality="many", issued=None
    ):
        errors = []
        validate_instance_binding(
            "scenario.payment",
            0,
            "proofs",
            refs,
            cardinality,
            {"ref": target, "cardinality": "many"},
            self.instances,
            set(self.instances) if issued is None else issued,
            errors,
            self.model,
        )
        return errors

    def test_role_has_no_required_evidence_time_or_responsible_role(self):
        self.assertEqual(list(self.schema.iter_errors(self.role)), [])
        errors = []
        validate_entities([self.role], self.model.entities_by_id, {}, errors)
        self.assertEqual(errors, [])

    def test_schema_and_semantics_reject_responsibility_fields_on_role(self):
        for key, value in (
            ("responsibleRoleRef", "role.customer"),
            ("roleRefs", ["role.customer", "role.supplier"]),
        ):
            with self.subTest(field=key):
                role = {**self.role, key: value}
                self.assertTrue(list(self.schema.iter_errors(role)))
                errors = []
                validate_entities([role], self.model.entities_by_id, {}, errors)
                self.assertTrue(any("Role must not declare" in e for e in errors))

    def test_explicit_external_player_matches_role_binding(self):
        self.assertEqual(self.binding_errors(["instance.result"]), [])

    def test_role_is_not_an_instantiable_player(self):
        self.assertTrue(self.binding_errors(["instance.role"]))

    def test_unregistered_evidence_cannot_satisfy_role(self):
        self.assertTrue(self.binding_errors(["instance.unrelated"]))

    def test_withdrawn_registration_cannot_satisfy_role(self):
        self.model.relationships = []
        self.assertTrue(self.binding_errors(["instance.result"]))

    def test_empty_open_role_binding_is_valid_input_not_completion(self):
        self.model.relationships = []
        self.assertEqual(self.binding_errors([]), [])

    def test_unissued_player_is_rejected(self):
        self.assertTrue(self.binding_errors(["instance.result"], issued=set()))

    def test_cardinality_is_still_enforced(self):
        self.assertTrue(self.binding_errors(["instance.result"], cardinality="one"))

    def test_direct_evidence_binding_still_requires_exact_type(self):
        self.assertEqual(
            self.binding_errors(["instance.result"], "confirmation.external"), []
        )
        self.assertTrue(
            self.binding_errors(["instance.result"], "confirmation.unrelated")
        )


if __name__ == "__main__":
    unittest.main()
