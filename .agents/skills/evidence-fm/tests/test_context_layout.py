"""Source paths organize business knowledge; type and stable IDs define semantics."""

from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

from check_fm import check_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    compiled_document,
    load_model,
    validate_model,
)


class ContextLayoutTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "model"
        shutil.copytree(
            SKILL / "tests/fixtures/valid-traceable-subscription", self.root
        )
        self.before = compiled_document(load_model(self.root))
        self.before_check = check_model(self.root)
        self.paths = {}
        # Deliberately remove type-based roots and use short, repeated local names.
        for folder in ("entities", "relationships", "rules", "business-patterns"):
            directory = self.root / folder
            if not directory.exists():
                continue
            for source in directory.glob("*.yaml"):
                doc = yaml.safe_load(source.read_text())
                target = self.root / "contexts" / doc["id"] / "definition.yaml"
                if doc.get("category") == "participant" and doc.get("kind") == "party":
                    target = self.root / "participants" / (doc["id"] + ".yaml")
                target.parent.mkdir(parents=True, exist_ok=True)
                source.rename(target)
                self.paths[doc["id"]] = target
            directory.rmdir()

    def test_recursive_layout_preserves_compilation_and_scenarios(self):
        model = load_model(self.root)
        self.assertEqual([], validate_model(model))
        self.assertEqual(self.before, compiled_document(model))
        after = check_model(self.root)
        self.assertTrue(after["valid"], after["errors"])
        self.assertGreater(after["executedScenarioCount"], 0)
        self.assertTrue(after["simulationPassed"])
        for key in (
            "scenarioCount",
            "executedScenarioCount",
            "simulationPassed",
            "timelineSummary",
        ):
            self.assertEqual(self.before_check[key], after[key], key)
        self.assertNotEqual(self.before_check["modelDigest"], after["modelDigest"])
        self.assertEqual(self.paths, model.files_by_id)

    def test_duplicate_ids_across_contexts_are_rejected(self):
        source = next(iter(self.paths.values()))
        target = self.root / "contexts/another/duplicate.yaml"
        target.parent.mkdir(parents=True)
        shutil.copyfile(source, target)
        self.assertTrue(any("duplicate id" in e for e in load_model(self.root).errors))

    def test_unknown_document_type_is_not_silently_ignored(self):
        (self.root / "contexts/invalid.yaml").write_text(
            "type: unknown\nid: invalid.object\n"
        )
        self.assertTrue(
            any("unsupported document type" in e for e in load_model(self.root).errors)
        )

    def test_malformed_yaml_is_reported_with_nested_path(self):
        (self.root / "contexts/broken.yaml").write_text("type: [\n")
        self.assertTrue(
            any(
                "broken.yaml" in e and "invalid YAML" in e
                for e in load_model(self.root).errors
            )
        )

    def test_business_validation_still_rejects_missing_confirmation(self):
        self.paths["confirmation.content-payment"].unlink()
        self.assertTrue(
            any(
                "must contain a Fulfillment Confirmation" in e
                for e in validate_model(load_model(self.root))
            )
        )

    def test_reserved_trees_and_markdown_are_not_model_sources(self):
        for folder in ("generated", "discovery", ".cache"):
            path = self.root / folder / "not-a-source.yaml"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("type: unknown\n")
        (self.root / "contexts/README.md").write_text("# Context notes\n")
        self.assertEqual([], validate_model(load_model(self.root)))

    def test_invalid_entity_schema_remains_an_error(self):
        path = self.paths["request.content-payment"]
        doc = yaml.safe_load(path.read_text())
        doc["kind"] = "invented_kind"
        path.write_text(yaml.safe_dump(doc))
        self.assertTrue(any("invented_kind" in e for e in load_model(self.root).errors))


if __name__ == "__main__":
    unittest.main()
