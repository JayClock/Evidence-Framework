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

    def test_supported_append_is_a_candidate(self) -> None:
        candidates, exploration, operations, diagnostics = self.project(design())
        self.assertEqual(
            [item["id"] for item in candidates], ["capability.request-payment"]
        )
        self.assertEqual(operations[0]["method"], "POST")
        self.assertIn("candidate", {item["status"] for item in exploration})
        self.assertFalse([item for item in diagnostics if item.severity == "error"])

    def test_evidence_put_is_rejected(self) -> None:
        value = design()
        value["capabilities"][0]["method"] = "PUT"
        candidates, _, _, diagnostics = self.project(value)
        self.assertEqual(candidates, [])
        self.assertIn(
            "EVIDENCE_MUTATION_FORBIDDEN", {item.code for item in diagnostics}
        )

    def test_missing_actor_scope_remains_a_gap(self) -> None:
        value = design()
        value["capabilities"][0]["bindingRefs"] = ["binding.request-subscription"]
        candidates, _, _, diagnostics = self.project(value)
        self.assertEqual(candidates, [])
        self.assertIn("ACTOR_SCOPE_UNRESOLVED", {item.code for item in diagnostics})


if __name__ == "__main__":
    unittest.main()
