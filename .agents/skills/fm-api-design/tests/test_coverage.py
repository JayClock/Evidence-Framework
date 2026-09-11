from __future__ import annotations

import importlib
import unittest

from test_support import design, index

coverage_module = importlib.import_module("fm_api_core.coverage")


class CoverageTest(unittest.TestCase):
    def test_missing_scenario_step_is_reported_as_gap(self) -> None:
        value = design()
        value["journeys"][0]["steps"] = value["journeys"][0]["steps"][:1]
        coverage, diagnostics = coverage_module.project_coverage(
            value, index(), [{"id": "capability.request-payment"}]
        )
        self.assertEqual(coverage[0]["status"], "gap")
        self.assertIn("SCENARIO_UNCOVERED", {item.code for item in diagnostics})

    def test_absent_journeys_are_not_evaluated(self) -> None:
        value = design()
        value["journeys"] = []
        coverage, diagnostics = coverage_module.project_coverage(value, index(), [])
        self.assertEqual(coverage[0]["status"], "not_evaluated")
        self.assertEqual(diagnostics, [])


if __name__ == "__main__":
    unittest.main()
