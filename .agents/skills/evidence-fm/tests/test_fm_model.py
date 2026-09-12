from __future__ import annotations

import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import yaml

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from build_fm_business_patterns import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    render_business_patterns,
)
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    compiled_document,
    load_model,
    validate_model,
)


class FulfillmentModelTests(unittest.TestCase):
    def fixture(self, name: str) -> Path:
        return Path(__file__).resolve().parent / "fixtures" / name

    def copied_fixture(self, name: str, directory: str) -> Path:
        root = Path(directory) / "model"
        shutil.copytree(self.fixture(name), root)
        return root

    def read_yaml(self, path: Path) -> dict[str, Any]:
        return yaml.safe_load(path.read_text(encoding="utf-8"))

    def write_yaml(self, path: Path, document: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            yaml.safe_dump(document, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def test_valid_subscription_builds_fulfillment_members_from_context_refs(
        self,
    ) -> None:
        model = load_model(self.fixture("valid-subscription"))
        self.assertEqual([], validate_model(model))
        fulfillment = model.fulfillment_contexts_by_id["fulfillment.content-payment"]
        self.assertEqual(
            {
                "type": "entity",
                "id": "fulfillment.content-payment",
                "category": "context",
                "kind": "fulfillment",
                "label": "支付内容产品费用",
                "parentContextRef": "context.content-subscription",
            },
            fulfillment,
        )
        members = {
            item["id"]
            for item in model.entities
            if item.get("contextRef") == fulfillment["id"]
        }
        self.assertEqual(
            {"request.content-payment", "confirmation.content-payment"}, members
        )

    def test_contract_is_resolved_from_parent_context_root(self) -> None:
        model = load_model(self.fixture("valid-subscription"))
        self.assertEqual([], validate_model(model))
        contract_edges = [
            relation
            for relation in model.relationships
            if relation.get("sourceRef") == "contract.content-subscription"
            and relation.get("targetRef") == "request.content-payment"
        ]
        self.assertEqual(["precedes"], [edge["kind"] for edge in contract_edges])

    def test_fulfillment_rejects_legacy_member_indexes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "entities/context-fulfillment--content-payment.yaml"
            fulfillment = self.read_yaml(path)
            for field in (
                "contractRef",
                "requestRef",
                "requestInterval",
                "confirmationRefs",
                "subjectRefs",
                "completionPolicy",
                "requestTrigger",
                "confirmationTriggers",
                "breaches",
            ):
                changed = copy.deepcopy(fulfillment)
                changed[field] = "legacy"
                self.write_yaml(path, changed)
                self.assertTrue(validate_model(load_model(root)), field)
            self.write_yaml(path, fulfillment)

    def test_missing_confirmation_fails(self) -> None:
        errors = validate_model(
            load_model(self.fixture("invalid-missing-confirmation"))
        )
        self.assertTrue(
            any("must contain a Fulfillment Confirmation" in e for e in errors)
        )

    def test_orphan_request_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            (root / "entities/context-fulfillment--content-payment.yaml").unlink()
            errors = validate_model(load_model(root))
            self.assertTrue(any("existing Fulfillment Context" in e for e in errors))

    def test_fulfillment_cannot_be_evidence_graph_endpoint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            self.write_yaml(
                root / "relationships/relation--invalid-fulfillment-edge.yaml",
                {
                    "type": "relationship",
                    "id": "relation.invalid-fulfillment-edge",
                    "kind": "precedes",
                    "sourceRef": "fulfillment.content-payment",
                    "targetRef": "confirmation.content-payment",
                    "label": "错误地把履约当作凭证",
                },
            )
            errors = validate_model(load_model(root))
            self.assertTrue(any("must not be an endpoint" in e for e in errors), errors)

    def test_evidence_relationship_directions_are_enforced(self) -> None:
        mutations = {
            "precedes": ("thing.content", "request.content-payment"),
            "evidences": ("request.content-payment", "confirmation.content-payment"),
            "references": ("request.content-payment", "contract.content-subscription"),
            "derived_from": ("thing.content", "request.content-payment"),
        }
        for kind, (source, target) in mutations.items():
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = self.copied_fixture("valid-subscription", directory)
                self.write_yaml(
                    root / f"relationships/relation--invalid-{kind}.yaml",
                    {
                        "type": "relationship",
                        "id": f"relation.invalid-{kind}",
                        "kind": kind,
                        "sourceRef": source,
                        "targetRef": target,
                        "label": "错误方向",
                    },
                )
                self.assertTrue(validate_model(load_model(root)))

    def test_cross_context_evidence_to_thing_reference_is_valid(self) -> None:
        model = load_model(self.fixture("valid-subscription"))
        self.assertEqual([], validate_model(model))
        relation = model.relationships_by_id[
            "relation.content-payment-references-content"
        ]
        self.assertEqual("request.content-payment", relation["sourceRef"])
        self.assertEqual("thing.content", relation["targetRef"])

    def test_relationship_endpoint_cardinalities_are_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = (
                root
                / "relationships/relation--content-payment-precedes-content-payment-confirmation.yaml"
            )
            relationship = self.read_yaml(path)
            relationship["sourceCardinality"] = {"min": 1, "max": 1}
            relationship["targetCardinality"] = {"min": 1, "max": "many"}
            self.write_yaml(path, relationship)

            model = load_model(root)
            self.assertEqual([], validate_model(model))
            compiled = compiled_document(model)
            actual = next(
                item
                for item in compiled["relationships"]
                if item["id"] == relationship["id"]
            )
            self.assertEqual({"min": 1, "max": 1}, actual["sourceCardinality"])
            self.assertEqual({"min": 1, "max": "many"}, actual["targetCardinality"])

    def test_relationship_cardinality_rejects_invalid_bounds(self) -> None:
        invalid_cardinalities = (
            ({"min": 2, "max": 1}, "max must be greater than or equal to min"),
            ({"min": 1}, "max"),
            ({"min": 0, "max": 0}, "max"),
        )
        for cardinality, expected_error in invalid_cardinalities:
            with (
                self.subTest(cardinality=cardinality),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = self.copied_fixture("valid-subscription", directory)
                path = (
                    root
                    / "relationships/relation--content-payment-precedes-content-payment-confirmation.yaml"
                )
                relationship = self.read_yaml(path)
                relationship["targetCardinality"] = cardinality
                self.write_yaml(path, relationship)

                errors = validate_model(load_model(root))
                self.assertTrue(
                    any(expected_error in error for error in errors), errors
                )

    def test_contract_requires_exactly_two_party_roles(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "entities/evidence-contract--content-subscription.yaml"
            contract = self.read_yaml(path)
            contract["roleRefs"] = ["role.subscriber"]
            self.write_yaml(path, contract)
            self.assertTrue(
                any("roleRefs" in e for e in validate_model(load_model(root)))
            )

    def test_request_interval_is_defined_by_required_key_time_attributes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "entities/evidence-fulfillment-request--content-payment.yaml"
            request = self.read_yaml(path)
            started = next(
                a for a in request["attributes"] if a["name"] == "started_at"
            )
            started["keyData"] = False
            self.write_yaml(path, request)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("required keyData timestamp" in e for e in errors), errors
            )

    def test_multi_contract_fixture_compiles_fulfillments_only_as_entities(
        self,
    ) -> None:
        model = load_model(self.fixture("valid-content-platform"))
        self.assertEqual([], validate_model(model))
        document = compiled_document(model)
        fulfillment_ids = {
            item["id"]
            for item in document["entities"]
            if item.get("kind") == "fulfillment"
        }
        self.assertEqual(set(model.fulfillment_contexts_by_id), fulfillment_ids)
        self.assertNotIn("fulfillments", document)

    def test_business_pattern_and_compilation_are_deterministic(self) -> None:
        model = load_model(self.fixture("valid-content-platform"))
        self.assertEqual([], validate_model(model))
        self.assertEqual(
            render_business_patterns(model), render_business_patterns(model)
        )
        first = json.dumps(compiled_document(model), ensure_ascii=False, sort_keys=True)
        second = json.dumps(
            compiled_document(model), ensure_ascii=False, sort_keys=True
        )
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
