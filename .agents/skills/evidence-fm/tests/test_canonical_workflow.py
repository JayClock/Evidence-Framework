from __future__ import annotations

import unittest
from pathlib import Path

import yaml

SKILL = Path(__file__).resolve().parents[1]
MODEL_ROOTS = [
    SKILL / "assets/examples",
    SKILL / "tests/fixtures",
    SKILL / "evals/fixtures",
]
LEGACY_TERMS = {
    "contractRef",
    "requestRef",
    "requestInterval",
    "confirmationRefs",
    "subjectRefs",
    "completionPolicy",
    "requestTrigger",
    "confirmationTriggers",
    "cross_context_reference",
}


class CanonicalModelTests(unittest.TestCase):
    def yaml_documents(self):
        for root in MODEL_ROOTS:
            for path in root.rglob("*.yaml"):
                value = yaml.safe_load(path.read_text(encoding="utf-8"))
                if isinstance(value, dict):
                    yield path, value

    def test_entity_filenames_start_with_category_and_kind(self) -> None:
        for path, entity in self.yaml_documents():
            if entity.get("type") != "entity":
                continue
            category = entity["category"].replace("_", "-")
            kind = entity["kind"].replace("_", "-")
            object_suffix = entity["id"].split(".", 1)[-1].replace(".", "--")
            self.assertEqual(
                f"{category}-{kind}--{object_suffix}.yaml",
                path.name,
                path,
            )

    def test_fulfillment_is_only_a_context_boundary(self) -> None:
        allowed = {
            "type",
            "id",
            "category",
            "kind",
            "label",
            "aliases",
            "notes",
            "parentContextRef",
        }
        fulfillments = [
            (path, value)
            for path, value in self.yaml_documents()
            if (value.get("category"), value.get("kind")) == ("context", "fulfillment")
        ]
        self.assertTrue(fulfillments)
        for path, fulfillment in fulfillments:
            self.assertEqual(set(), set(fulfillment) - allowed, path)
            self.assertIn("parentContextRef", fulfillment, path)

    def test_source_schema_prompts_and_docs_have_no_legacy_model(self) -> None:
        paths = [
            SKILL / "schemas/entity.schema.json",
            SKILL / "schemas/relationship.schema.json",
            SKILL / "scripts/fm_model.py",
            SKILL / "scripts/fm_simulation.py",
            SKILL / "SKILL.md",
            *sorted((SKILL / "references").glob("*.md")),
            *sorted((SKILL / "evals").glob("*.json")),
        ]
        text = "\n".join(path.read_text(encoding="utf-8") for path in paths)
        for term in LEGACY_TERMS:
            self.assertNotIn(term, text, term)

    def test_evidence_relationships_use_canonical_directions(self) -> None:
        documents = [value for _, value in self.yaml_documents()]
        entities = {
            value["id"]: value for value in documents if value.get("type") == "entity"
        }
        for relation in [d for d in documents if d.get("type") == "relationship"]:
            source = entities.get(relation.get("sourceRef"), {})
            target = entities.get(relation.get("targetRef"), {})
            kind = relation.get("kind")
            self.assertNotEqual("fulfillment", source.get("kind"), relation)
            self.assertNotEqual("fulfillment", target.get("kind"), relation)
            if kind == "precedes":
                self.assertEqual("evidence", source.get("category"), relation)
                self.assertEqual("evidence", target.get("category"), relation)
            elif kind == "evidences":
                self.assertEqual("other_evidence", source.get("kind"), relation)
                self.assertEqual("evidence", target.get("category"), relation)
            elif kind == "references" and source.get("category") == "evidence":
                self.assertEqual("thing", target.get("kind"), relation)


if __name__ == "__main__":
    unittest.main()
