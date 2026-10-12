"""Context kinds describe business boundaries, not whether a dependency is external."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from context_samples import (
    domain_documents,
    entity,
    performance_documents,
    precontract_documents,
    write_model,
)
from jsonschema import Draft202012Validator
from test_fulfillment_structure import documents

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    compiled_document,
    load_model,
    validate_entities,
    validate_model,
    validate_relationships,
)


class ContextKindTests(unittest.TestCase):
    def setUp(self):
        self.schema = Draft202012Validator(
            json.loads((SKILL / "schemas/entity.schema.json").read_text())
        )

    def errors(self, values):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            return validate_model(load_model(root))

    def test_schema_accepts_only_three_business_context_kinds(self):
        for kind in ("contract", "pre_contract", "domain"):
            with self.subTest(kind=kind):
                value = entity("context.example", "context", kind, "业务边界")
                self.assertEqual([], list(self.schema.iter_errors(value)))
        for kind in ("external", "fulfillment", "unknown"):
            with self.subTest(kind=kind):
                value = entity("context.example", "context", kind, "错误边界")
                self.assertTrue(list(self.schema.iter_errors(value)))

    def test_semantics_reject_external_without_relying_on_schema(self):
        value = entity("context.example", "context", "external", "错误边界")
        errors = []
        validate_entities([value], {value["id"]: value}, {}, errors)
        self.assertIn("context.example: invalid Context kind 'external'", errors)

    def test_concrete_context_players_preserve_their_business_kind(self):
        cases = (
            (performance_documents(False), "context.performance", "contract"),
            (precontract_documents(), "context.sales-inquiry", "pre_contract"),
            (domain_documents(), "context.customer-information", "domain"),
        )
        for support, context_id, kind in cases:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                role = entity(
                    "role.support-context", "role", "context", "协作边界",
                    contextRef="context.agreement",
                )
                relation = {
                    "type": "relationship", "id": "relation.support-context",
                    "kind": "plays_role", "sourceRef": context_id,
                    "targetRef": role["id"], "label": "实际上下文扮演协作边界",
                }
                values = documents() + support + [role, relation]
                root = write_model(Path(directory), values, "context.agreement")
                model = load_model(root)
                self.assertEqual([], validate_model(model))
                compiled = compiled_document(model)
                context = next(v for v in compiled["entities"] if v["id"] == context_id)
                self.assertEqual(kind, context["kind"])
                self.assertEqual(role, model.entities_by_id[role["id"]])

    def test_unexpanded_dependencies_need_no_placeholder_context_or_player(self):
        roles = [
            entity(f"role.support-{kind.replace('_', '-')}", "role", kind, "协作角色",
                   contextRef="context.agreement")
            for kind in ("context", "third_party", "domain", "evidence")
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), documents() + roles, "context.agreement")
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            self.assertEqual(
                ["context.agreement"],
                [v["id"] for v in model.entities if v["category"] == "context"],
            )
            self.assertFalse(any(v["kind"] == "plays_role" for v in model.relationships))

    def test_context_cannot_play_third_party_role(self):
        target = entity("role.provider", "role", "third_party", "外部协作者",
                        contextRef="context.consumer")
        for kind in ("contract", "pre_contract", "domain", "external"):
            with self.subTest(kind=kind):
                source = entity("context.provider", "context", kind, "协作边界")
                relation = {
                    "id": "relation.provider", "kind": "plays_role",
                    "sourceRef": source["id"], "targetRef": target["id"],
                }
                errors = []
                validate_relationships(
                    [relation], {v["id"]: v for v in (source, target)}, {}, errors
                )
                self.assertIn(
                    "relation.provider: invalid plays_role direction or endpoint types",
                    errors,
                )

    def test_party_can_still_play_third_party_role(self):
        values = documents() + [
            entity("party.provider", "participant", "party", "外部协作方"),
            entity("role.collaborator", "role", "third_party", "外部协作者",
                   contextRef="context.agreement"),
            {"type": "relationship", "id": "relation.collaborator", "kind": "plays_role",
             "sourceRef": "party.provider", "targetRef": "role.collaborator",
             "label": "实际主体扮演外部协作者"},
        ]
        self.assertEqual([], self.errors(values))

    def test_removed_context_kind_is_rejected_without_rewriting_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory),
                [entity("context.dependency", "context", "external", "未展开边界")],
                "context.dependency",
            )
            before = {p: p.read_bytes() for p in root.rglob("*.json")}
            output = root / "generated/model.json"
            result = subprocess.run(
                [sys.executable, str(SKILL / "scripts/compile_fm_model.py"),
                 str(root), "--output", str(output)],
                capture_output=True, text=True, timeout=30,
            )
            self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertIn("external", result.stdout + result.stderr)
            self.assertFalse(output.exists())
            self.assertEqual(before, {p: p.read_bytes() for p in root.rglob("*.json")})


if __name__ == "__main__":
    unittest.main()
