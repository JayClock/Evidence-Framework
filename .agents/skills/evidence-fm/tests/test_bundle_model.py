"""Single-file bundle (`*.evidence.json`) regression.

A bundle holds what `.evidence/fm/` keeps in a tree. These tests pack a real
fixture with a local reader, then assert the directory readers produce the same
verdict for both forms, so packing never loosens or tightens the FM checks.
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from check_fm import check_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    BUNDLE_SUFFIX,
    BUNDLE_TYPE,
    load_model,
    validate_model,
)
from fm_simulation import load_validation_suite  # pyright: ignore[reportMissingImports]  # noqa: E402

TREES = {
    "entities": "entities",
    "relationships": "relationships",
    "rules": "rules",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, document: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def bundle_of_tree(tree: Path) -> dict[str, Any]:
    """Packs a source tree the way `evidence-model pack` does."""
    bundle: dict[str, Any] = {
        "type": BUNDLE_TYPE,
        "schemaVersion": "5.0",
        "manifest": read_json(tree / "model.json"),
    }
    for key in TREES:
        directory = tree / key
        bundle[key] = (
            [read_json(path) for path in sorted(directory.glob("*.json"))]
            if directory.is_dir()
            else []
        )
    instances = tree / "validation" / "instances"
    scenarios = tree / "validation" / "scenarios"
    if instances.is_dir() or scenarios.is_dir():
        bundle["validation"] = {
            "instances": [read_json(path) for path in sorted(instances.glob("*.json"))]
            if instances.is_dir()
            else [],
            "scenarios": [read_json(path) for path in sorted(scenarios.glob("*.json"))]
            if scenarios.is_dir()
            else [],
        }
    readme = tree / "README.md"
    if readme.is_file():
        bundle["readme"] = readme.read_text(encoding="utf-8")
    return bundle


class BundleModelTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def fixture(self, name: str) -> Path:
        fixtures = Path(__file__).resolve().parent / "fixtures"
        nested = fixtures / "models" / name

        return nested if nested.is_dir() else fixtures / name

    def write_bundle(self, bundle: dict[str, Any], name: str = "model") -> Path:
        path = self.root / f"{name}{BUNDLE_SUFFIX}"
        write_json(path, bundle)

        return path

    def packed_fixture(self, name: str) -> tuple[Path, Path]:
        tree = self.fixture(name)
        return tree, self.write_bundle(bundle_of_tree(tree), name)

    def test_bundle_loads_the_same_model_as_the_directory(self) -> None:
        tree, bundle = self.packed_fixture("valid-traceable-subscription")

        from_tree = load_model(tree)
        from_bundle = load_model(bundle)

        self.assertEqual([], validate_model(from_tree))
        self.assertEqual([], from_bundle.errors)
        self.assertEqual(from_tree.manifest, from_bundle.manifest)
        self.assertEqual(
            [item["id"] for item in from_tree.entities],
            [item["id"] for item in from_bundle.entities],
        )
        self.assertEqual(
            [item["id"] for item in from_tree.relationships],
            [item["id"] for item in from_bundle.relationships],
        )
        self.assertEqual(
            [item["id"] for item in from_tree.rules],
            [item["id"] for item in from_bundle.rules],
        )

    def test_bundle_carries_the_validation_inputs(self) -> None:
        tree, bundle = self.packed_fixture("valid-traceable-subscription")

        from_tree = load_validation_suite(tree)
        from_bundle = load_validation_suite(bundle)

        self.assertEqual([], from_bundle.errors)
        self.assertEqual(len(from_tree.instances), len(from_bundle.instances))
        self.assertEqual(len(from_tree.scenarios), len(from_bundle.scenarios))
        self.assertEqual(
            sorted(from_tree.instances_by_id), sorted(from_bundle.instances_by_id)
        )

    def test_check_model_matches_between_directory_and_bundle(self) -> None:
        tree, bundle = self.packed_fixture("valid-traceable-subscription")

        from_tree = check_model(tree)
        from_bundle = check_model(bundle)

        self.assertEqual(from_tree["errors"], from_bundle["errors"])
        self.assertEqual(from_tree["valid"], from_bundle["valid"])
        self.assertEqual(from_tree["consistent"], from_bundle["consistent"])
        self.assertEqual(
            from_tree["executedScenarioCount"], from_bundle["executedScenarioCount"]
        )
        self.assertEqual(
            from_tree["simulationPassed"], from_bundle["simulationPassed"]
        )
        self.assertEqual(from_tree["timelineSummary"], from_bundle["timelineSummary"])

    def test_bundle_without_validation_has_nothing_to_simulate(self) -> None:
        tree, bundle = self.packed_fixture("valid-roleized-payment")
        document = read_json(bundle)
        document.pop("validation", None)
        write_json(bundle, document)

        suite = load_validation_suite(bundle)

        self.assertEqual([], suite.errors)
        self.assertEqual([], suite.instances)
        self.assertEqual([], suite.scenarios)
        self.assertEqual([], load_model(bundle).errors)

    def test_wrong_bundle_type_is_rejected(self) -> None:
        _, bundle = self.packed_fixture("valid-roleized-payment")
        document = read_json(bundle)
        document["type"] = "fm_model"
        write_json(bundle, document)

        model = load_model(bundle)

        self.assertTrue(
            any("type must be 'fm_bundle'" in error for error in model.errors)
        )

    def test_duplicate_entity_ids_are_reported_without_throwing(self) -> None:
        _, bundle = self.packed_fixture("valid-roleized-payment")
        document = read_json(bundle)
        document["entities"].append(document["entities"][0])
        write_json(bundle, document)

        model = load_model(bundle)

        self.assertTrue(any("duplicate id" in error for error in model.errors))

    def test_entity_shaped_document_in_the_rule_collection_is_rejected(self) -> None:
        _, bundle = self.packed_fixture("valid-roleized-payment")
        document = read_json(bundle)
        document["rules"].append(document["entities"][0])
        write_json(bundle, document)

        model = load_model(bundle)

        self.assertTrue(
            any("type must be 'rule'" in error for error in model.errors)
        )

    def test_bundle_requires_at_least_one_entity(self) -> None:
        _, bundle = self.packed_fixture("valid-roleized-payment")
        document = read_json(bundle)
        document["entities"] = []
        write_json(bundle, document)

        model = load_model(bundle)

        self.assertTrue(
            any("at least one entity" in error for error in model.errors)
        )


if __name__ == "__main__":
    unittest.main()
