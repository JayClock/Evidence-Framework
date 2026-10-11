"""Two relationship kinds; instance evidence, not type layout, determines order."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_fm_timeline import build_timeline  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import fulfillment_members, load_model, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_simulation import load_validation_suite  # pyright: ignore[reportMissingImports]  # noqa: E402


class RelationshipConvergenceTests(unittest.TestCase):
    def model(self):
        return load_model(Path(__file__).parent / "fixtures/valid-traceable-subscription")

    def test_retired_kinds_are_rejected_without_translation(self):
        for kind in ("precedes", "evidences", "derived_from"):
            with self.subTest(kind=kind):
                model = self.model()
                self.assertEqual([], validate_model(model))
                model.relationships.append({
                    "type": "relationship", "id": "relation.retired",
                    "kind": kind, "sourceRef": "request.content-payment",
                    "targetRef": "confirmation.content-payment", "label": "旧关系",
                })
                self.assertIn(
                    f"relation.retired: unsupported relationship kind '{kind}'",
                    validate_model(model),
                )

    def test_confirmation_references_request_not_the_reverse(self):
        model = self.model()
        confirmation = model.entities_by_id["confirmation.content-payment"]
        confirmation.pop("fulfillmentRef", None)
        model.relationships[:] = [{"type": "relationship", "id": "relation.result",
            "kind": "references", "sourceRef": confirmation["id"],
            "targetRef": "request.content-payment", "label": "结果对应请求"}]
        self.assertEqual([], validate_model(model))
        _, results, _ = fulfillment_members("fulfillment.content-payment", model.entities_by_id, model.relationships)
        self.assertEqual([confirmation["id"]], [r["id"] for r in results])
        relation = model.relationships[0]
        relation["sourceRef"], relation["targetRef"] = relation["targetRef"], relation["sourceRef"]
        _, results, _ = fulfillment_members("fulfillment.content-payment", model.entities_by_id, model.relationships)
        self.assertEqual([], results)

    def test_timeline_depends_on_instances_not_relationship_layout(self):
        model = self.model()
        suite = load_validation_suite(model.root)
        before, errors = build_timeline(model, suite)
        self.assertEqual([], errors)
        self.assertNotIn("precedes", before)
        self.assertIn({"sourceRef": "instance.payment-request", "targetRef": "instance.payment-confirmation"}, before["dependencies"])
        model.relationships.clear()
        after, errors = build_timeline(model, suite)
        self.assertEqual([], errors)
        self.assertEqual(before, after)

    def test_unrelated_instances_are_not_ordered_by_type_references(self):
        model = self.model()
        suite = load_validation_suite(model.root)
        for instance in suite.instances:
            instance["basedOn"] = []
        timeline, _ = build_timeline(model, suite)
        self.assertEqual([], timeline["dependencies"])
        self.assertTrue(timeline["unresolvedOrder"])
