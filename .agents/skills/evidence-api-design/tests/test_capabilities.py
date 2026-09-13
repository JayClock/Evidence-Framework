from __future__ import annotations

import importlib
import unittest

from test_support import design, index

resources_module = importlib.import_module("fm_api_core.resources")
capabilities_module = importlib.import_module("fm_api_core.capabilities")


class CapabilitiesTest(unittest.TestCase):
    def project(self, value):
        resources, _ = resources_module.build_resources(value, index())
        return capabilities_module.project_capabilities(value, index(), resources)

    def test_supported_append_is_an_interface(self) -> None:
        interfaces, operations, diagnostics = self.project(design())
        self.assertEqual(
            [item["id"] for item in interfaces],
            ["capability.request-payment", "capability.submit-confirmation"],
        )
        self.assertEqual(operations[0]["method"], "POST")
        self.assertTrue(all("status" not in item for item in interfaces))
        self.assertFalse([item for item in diagnostics if item.severity == "error"])

    def test_evidence_put_is_rejected(self) -> None:
        value = design()
        value["capabilities"][0]["method"] = "PUT"
        interfaces, _, diagnostics = self.project(value)
        self.assertNotIn(
            "capability.request-payment", {item["id"] for item in interfaces}
        )
        self.assertIn(
            "EVIDENCE_MUTATION_FORBIDDEN", {item.code for item in diagnostics}
        )

    def test_missing_actor_scope_remains_a_gap(self) -> None:
        value = design()
        value["capabilities"][0]["bindingRefs"] = ["binding.request-subscription"]
        interfaces, _, diagnostics = self.project(value)
        self.assertNotIn(
            "capability.request-payment", {item["id"] for item in interfaces}
        )
        self.assertIn("ACTOR_SCOPE_UNRESOLVED", {item.code for item in diagnostics})


if __name__ == "__main__":
    unittest.main()
