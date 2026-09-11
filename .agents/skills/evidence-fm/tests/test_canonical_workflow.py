from __future__ import annotations

import json
import unittest
from pathlib import Path

import yaml

REPOSITORY = Path(__file__).resolve().parents[4]
SKILL = REPOSITORY / ".agents/skills/evidence-fm"
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


class CanonicalWorkflowGateTests(unittest.TestCase):
    def yaml_documents(self):
        for root in MODEL_ROOTS:
            for path in root.rglob("*.yaml"):
                value = yaml.safe_load(path.read_text(encoding="utf-8"))
                if isinstance(value, dict):
                    yield path, value

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
            REPOSITORY / ".agents/skills/fm-modeling/SKILL.md",
            REPOSITORY / ".agents/skills/fm-modeling/references/workflow.md",
            REPOSITORY / ".agents/skills/fm-modeling/evals/evals.json",
            REPOSITORY / "docs/fm-modeling.md",
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

    def test_extension_registers_one_command_without_evidence_dependency(self) -> None:
        extension = REPOSITORY / ".pi/extensions/fm-modeling"
        commands = (extension / "commands.ts").read_text(encoding="utf-8")
        sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in extension.glob("*.ts")
            if not path.name.endswith(".spec.ts")
        )
        self.assertEqual(1, commands.count("registerCommand("))
        self.assertIn("registerCommand('fm-model'", commands)
        self.assertNotIn("evidence-model", sources)
        self.assertNotIn("/evidence/", sources)
        self.assertNotIn(".evidence/state", sources)

    def test_package_verification_covers_portable_fm_tests(self) -> None:
        package = json.loads((REPOSITORY / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        self.assertIn("fm-modeling:verify", scripts)
        self.assertIn("/opt/miniconda3/bin/python3.12", scripts["skills:test:fm"])
        self.assertIn("schemas/*.json", scripts["fm-modeling:format:check"])


if __name__ == "__main__":
    unittest.main()
