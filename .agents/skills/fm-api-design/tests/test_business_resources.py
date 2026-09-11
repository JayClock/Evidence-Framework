from __future__ import annotations

import copy
import importlib
import unittest

from test_support import design, index

resources = importlib.import_module("fm_api_core.resources")
capabilities = importlib.import_module("fm_api_core.capabilities")
hypermedia = importlib.import_module("fm_api_core.hypermedia")


def singleton_case():
    value, model = design(), copy.deepcopy(index())
    child = value["resources"][1]
    child.update(shape="singleton", segment="payment", identity={"kind": "parent_scoped"},
                 cardinality={"relationshipRef": "relation.subscription-payment"})
    model.relationships["relation.subscription-payment"] = {
        "sourceRef": value["resources"][0]["entityRef"], "targetRef": child["entityRef"],
        "sourceCardinality": {"min": 1, "max": 1},
        "targetCardinality": {"min": 0, "max": 1},
    }
    value["capabilities"][0]["view"] = "singleton"
    return value, model


class BusinessResourcesTest(unittest.TestCase):
    def codes(self, value, model):
        return {d.code for d in resources.build_resources(value, model)[1]}

    def test_singleton_has_only_parent_parameters_and_one_view(self):
        value, model = singleton_case()
        projected, diagnostics = resources.build_resources(value, model)
        self.assertEqual(diagnostics, [])
        payment = next(r for r in projected if r["id"] == "resource.payment")
        self.assertEqual(payment["uris"], {"singleton": "/subscriptions/{subscriptionId}/payment"})
        self.assertEqual(payment["parameters"], ["subscriptionId"])
        selected, exploration, _, diagnostics = capabilities.project_capabilities(value, model, projected)
        self.assertEqual(diagnostics, [])
        self.assertEqual(selected[0]["uri"], payment["uris"]["singleton"])
        self.assertEqual({e["view"] for e in exploration if e["resourceRef"] == "resource.payment"}, {"singleton"})

    def test_one_to_one_is_not_a_collection(self):
        value, model = singleton_case()
        value["resources"][1].update(shape="collection", identity=design()["resources"][1]["identity"])
        self.assertIn("RESOURCE_CARDINALITY_CONFLICT", self.codes(value, model))

    def test_many_children_cannot_be_collapsed_to_singleton(self):
        value, model = singleton_case()
        model.relationships["relation.subscription-payment"]["targetCardinality"]["max"] = "many"
        self.assertIn("RESOURCE_CARDINALITY_CONFLICT", self.codes(value, model))

    def test_quantity_is_directional(self):
        value, model = singleton_case()
        relation = model.relationships["relation.subscription-payment"]
        relation["sourceCardinality"]["max"] = "many"
        self.assertEqual(self.codes(value, model), set())
        relation["sourceRef"], relation["targetRef"] = relation["targetRef"], relation["sourceRef"]
        relation["sourceCardinality"], relation["targetCardinality"] = relation["targetCardinality"], relation["sourceCardinality"]
        self.assertEqual(self.codes(value, model), set())

    def test_missing_quantity_remains_a_gap(self):
        value, model = singleton_case()
        del model.relationships["relation.subscription-payment"]["targetCardinality"]
        self.assertIn("RESOURCE_CARDINALITY_UNRESOLVED", self.codes(value, model))
        del value["resources"][1]["cardinality"]
        self.assertIn("RESOURCE_CARDINALITY_UNRESOLVED", self.codes(value, model))

    def test_unrelated_or_unknown_quantity_reference_is_rejected(self):
        value, model = singleton_case()
        model.relationships["relation.subscription-payment"]["sourceRef"] = "request.unrelated"
        self.assertIn("CARDINALITY_SCOPE_INVALID", self.codes(value, model))
        model.relationships.pop("relation.subscription-payment")
        self.assertIn("FM_REF_NOT_FOUND", self.codes(value, model))

    def test_source_claim_cannot_override_existing_fm_quantity(self):
        value, model = singleton_case()
        value["resources"][1]["cardinality"] = design()["resources"][1]["cardinality"]
        self.assertIn("RESOURCE_CARDINALITY_CONFLICT", self.codes(value, model))

    def test_unknown_business_source_is_rejected(self):
        value, model = singleton_case()
        value["resources"][1]["cardinality"] = {"max": 1, "sourceRefs": ["source.unknown"], "reasoning": "明确数量"}
        self.assertIn("SOURCE_REF_NOT_FOUND", self.codes(value, model))

    def test_singleton_requires_parent_scope_and_no_child_parameter(self):
        value, model = singleton_case()
        value["resources"][1]["identity"] = design()["resources"][1]["identity"]
        self.assertIn("RESOURCE_IDENTITY_CONFLICT", self.codes(value, model))
        value, model = singleton_case()
        del value["resources"][1]["parentRef"]
        self.assertIn("CARDINALITY_SCOPE_INVALID", self.codes(value, model))

    def test_business_name_is_not_inflected_from_shape_or_fm_type(self):
        value, model = singleton_case()
        value["resources"][1]["segment"] = "fee-settlement"
        result, diagnostics = resources.build_resources(value, model)
        self.assertEqual(diagnostics, [])
        self.assertTrue(next(r for r in result if r["id"] == "resource.payment")["uris"]["singleton"].endswith("/fee-settlement"))

    def test_collection_view_on_singleton_is_rejected(self):
        value, model = singleton_case()
        value["capabilities"][0]["view"] = "collection"
        projected, _ = resources.build_resources(value, model)
        selected, _, _, diagnostics = capabilities.project_capabilities(value, model, projected)
        self.assertEqual(selected, [])
        self.assertIn("RESOURCE_VIEW_INVALID", {d.code for d in diagnostics})

    def test_singleton_does_not_allow_overwriting_evidence(self):
        value, model = singleton_case()
        value["capabilities"][0]["method"] = "PUT"
        projected, _ = resources.build_resources(value, model)
        selected, _, _, diagnostics = capabilities.project_capabilities(value, model, projected)
        self.assertEqual(selected, [])
        self.assertIn("EVIDENCE_MUTATION_FORBIDDEN", {d.code for d in diagnostics})

    def test_hypermedia_can_target_singleton_without_inventing_get(self):
        value, model = singleton_case()
        value["representations"] = [{
            "id": "representation.subscription", "resourceRef": "resource.subscription",
            "view": "item", "format": "hal", "fields": [],
            "links": [{"rel": "payment", "targetResourceRef": "resource.payment",
                       "targetView": "singleton", "capabilityRef": value["capabilities"][0]["id"],
                       "parameterBindings": [{"parameter": "subscriptionId", "fromParameter": "subscriptionId"}]}],
        }]
        projected, _ = resources.build_resources(value, model)
        selected, _, _, _ = capabilities.project_capabilities(value, model, projected)
        result, diagnostics = hypermedia.validate_representations(value, model, projected, selected)
        self.assertEqual(diagnostics, [])
        self.assertEqual(len(result), 1)
        value["representations"][0]["links"][0]["targetView"] = "item"
        _, diagnostics = hypermedia.validate_representations(value, model, projected, selected)
        self.assertIn("RESOURCE_VIEW_INVALID", {d.code for d in diagnostics})
        value["representations"][0]["view"] = "singleton"
        _, diagnostics = hypermedia.validate_representations(value, model, projected, selected)
        self.assertIn("RESOURCE_VIEW_INVALID", {d.code for d in diagnostics})


if __name__ == "__main__":
    unittest.main()
