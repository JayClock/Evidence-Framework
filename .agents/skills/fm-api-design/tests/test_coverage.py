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
            value, index(), value["capabilities"]
        )
        self.assertEqual(
            next(
                item
                for item in coverage
                if item.get("journeyId") == "journey.successful-payment"
            )["status"],
            "gap",
        )
        self.assertIn("SCENARIO_UNCOVERED", {item.code for item in diagnostics})

    def test_absent_journeys_leave_all_fm_scenarios_uncovered(self) -> None:
        value = design()
        value["journeys"] = []
        coverage, diagnostics = coverage_module.project_coverage(value, index(), [])
        self.assertTrue(all(item["status"] == "gap" for item in coverage))
        self.assertEqual(
            {item["sourceScenarioRef"] for item in coverage}, set(index().scenarios)
        )
        self.assertEqual({item.code for item in diagnostics}, {"SCENARIO_UNCOVERED"})


if __name__ == "__main__":
    unittest.main()
