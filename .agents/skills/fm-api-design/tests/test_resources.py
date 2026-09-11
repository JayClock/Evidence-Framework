from __future__ import annotations

import importlib
import unittest

from test_support import API_ROOT, FM_SKILL, design, design_loader, fm_adapter, index

resources_module = importlib.import_module("fm_api_core.resources")


class ResourcesTest(unittest.TestCase):
    def test_nested_collection_and_item_uris_are_deterministic(self) -> None:
        resources, diagnostics = resources_module.build_resources(design(), index())
        self.assertFalse([item for item in diagnostics if item.severity == "error"])
        payment = next(
            item for item in resources if item["id"] == "resource.payment"
        )
        self.assertEqual(
            payment["uris"]["collection"], "/subscriptions/{subscriptionId}/payments"
        )
        self.assertEqual(
            payment["uris"]["item"],
            "/subscriptions/{subscriptionId}/payments/{paymentId}",
        )

    def test_parent_cycle_is_rejected(self) -> None:
        value = design()
        value["resources"][0]["parentRef"] = "resource.payment"
        value["resources"][0]["parentBindingRef"] = "binding.request-subscription"
        _, diagnostics = resources_module.build_resources(value, index())
        self.assertIn("RESOURCE_CYCLE", {item.code for item in diagnostics})

    def test_different_business_contexts_require_separate_uri_roots(self) -> None:
        example = API_ROOT / "assets" / "examples" / "full-lifecycle"
        value, design_diagnostics = design_loader.load_design(
            example / "design.yaml",
            API_ROOT / "schemas" / "api-design.schema.json",
        )
        model, fm_diagnostics = fm_adapter.load_fm(example / "fm", FM_SKILL)
        self.assertEqual(design_diagnostics, [])
        self.assertEqual(fm_diagnostics, [])
        self.assertIsNotNone(value)
        self.assertIsNotNone(model)
        assert value is not None and model is not None
        contract = next(
            item
            for item in value["resources"]
            if item["id"] == "resource.product-procurement"
        )
        contract["parentRef"] = "resource.product-quotation"
        contract["parentBindingRef"] = "binding.quotation-inquiry"
        _, diagnostics = resources_module.build_resources(value, model)
        self.assertIn(
            "RESOURCE_CONTEXT_ROOT_MISMATCH",
            {item.code for item in diagnostics},
        )


if __name__ == "__main__":
    unittest.main()
