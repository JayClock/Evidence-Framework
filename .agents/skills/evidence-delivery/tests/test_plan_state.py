"""Deterministic machine-plan state checks; no plan files are modified."""

from __future__ import annotations

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "plan_state.py"
spec = importlib.util.spec_from_file_location("plan_state", SCRIPT)
assert spec and spec.loader
plan_state = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan_state)


class PlanStateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.plan_path = Path(self.temp.name) / "plan.yaml"
        self.first = "domain::thing.book::rule.create"
        self.second = "api::context.library::api.book.get"
        self.data = {
            "schemaVersion": "3.0",
            "kind": "smart-domain-plan",
            "compiled": {
                "inputDigest": "current",
                "coverageComplete": True,
                "diagnostics": [],
                "tasks": [
                    {"taskKey": self.first, "dependsOn": []},
                    {"taskKey": self.second, "dependsOn": [self.first]},
                ],
                "executionOrder": [self.first, self.second],
            },
            "tasks": {
                self.first: self.task("实现图书规则", "implementation", "CHECK-DOMAIN"),
                self.second: self.task("验证图书接口", "verify", "CHECK-API"),
            },
            "gaps": [],
        }
        self.write_plan(self.data)

    def task(self, title, mode, check_id):
        return {
            "title": title,
            "mode": mode,
            "status": "planned",
            "outcome": title,
            "gapRefs": [],
            "checks": [
                {"id": check_id, "command": "python -m unittest", "gapRefs": []}
            ],
            "completionCriteria": ["检查通过"],
            "observedEvidence": [],
        }

    def write_plan(self, data):
        self.plan_path.write_text(
            yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8"
        )

    def test_first_planned_task_is_runnable_and_tool_is_read_only(self):
        before = self.plan_path.read_bytes()
        result = plan_state.inspect_plan(self.plan_path)
        self.assertTrue(result["valid"], result["diagnostics"])
        self.assertEqual([self.first], [task["taskKey"] for task in result["runnable"]])
        self.assertEqual(before, self.plan_path.read_bytes())
        self.assertIn("not-checked", result["sourceFreshness"])

    def test_done_dependency_makes_next_task_runnable(self):
        task = self.data["tasks"][self.first]
        task["status"] = "done"
        task["observedEvidence"] = [{"command": "python -m unittest", "exitCode": 0}]
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertTrue(result["valid"], result["diagnostics"])
        self.assertEqual(
            [self.second], [task["taskKey"] for task in result["runnable"]]
        )

    def test_supported_execution_modes_are_explicit(self):
        self.assertEqual(
            {"design", "setup", "implementation", "verify", "manual"},
            plan_state.MODES,
        )
        for mode in sorted(plan_state.MODES):
            with self.subTest(mode=mode):
                self.data["tasks"][self.first]["mode"] = mode
                self.write_plan(self.data)
                result = plan_state.inspect_plan(self.plan_path)
                self.assertTrue(result["valid"], result["diagnostics"])
                self.assertEqual(mode, result["runnable"][0]["mode"])

    def test_unknown_mode_is_rejected_without_task_selection(self):
        self.data["tasks"][self.first]["mode"] = "unsupported"
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertFalse(result["valid"])
        self.assertEqual([], result["runnable"])
        self.assertTrue(
            any("mode is invalid" in item for item in result["diagnostics"])
        )

    def test_active_task_requires_completed_dependencies(self):
        self.data["tasks"][self.second]["status"] = "in-progress"
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertFalse(result["valid"])
        self.assertTrue(
            any(
                "before dependencies are done" in item for item in result["diagnostics"]
            )
        )

    def test_blocked_task_and_empty_command_require_known_gap(self):
        task = self.data["tasks"][self.first]
        task["status"] = "blocked"
        task["checks"][0]["command"] = None
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertFalse(result["valid"])
        self.assertTrue(
            any("must reference a gap" in item for item in result["diagnostics"])
        )
        self.assertTrue(
            any("has no command and no gap" in item for item in result["diagnostics"])
        )

    def test_task_records_and_check_ids_are_one_to_one(self):
        del self.data["tasks"][self.second]
        self.data["tasks"][self.first]["checks"].append(
            {"id": "CHECK-DOMAIN", "command": "true", "gapRefs": []}
        )
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertFalse(result["valid"])
        self.assertTrue(
            any("missing task records" in item for item in result["diagnostics"])
        )
        self.assertTrue(
            any("duplicate CHECK id" in item for item in result["diagnostics"])
        )

    def test_done_requires_completion_criteria_and_observed_evidence(self):
        self.data["compiled"]["tasks"] = [self.data["compiled"]["tasks"][0]]
        self.data["compiled"]["executionOrder"] = [self.first]
        self.data["tasks"] = {self.first: self.data["tasks"][self.first]}
        self.data["tasks"][self.first]["status"] = "done"
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertFalse(result["valid"])
        self.assertTrue(
            any("no observed evidence" in item for item in result["diagnostics"])
        )

    def test_execution_order_must_follow_dependencies(self):
        self.data["compiled"]["executionOrder"] = [self.second, self.first]
        self.write_plan(self.data)
        result = plan_state.inspect_plan(self.plan_path)
        self.assertFalse(result["valid"])
        self.assertTrue(
            any("before dependency" in item for item in result["diagnostics"])
        )

    def test_markdown_plan_is_rejected(self):
        markdown = self.plan_path.with_suffix(".md")
        markdown.write_text("```yaml\nkind: smart-domain-plan\n```\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "YAML file"):
            plan_state.load_document(markdown)

    def test_cli_next_reports_json_and_nonzero_for_invalid_plan(self):
        invalid = copy.deepcopy(self.data)
        invalid["compiled"]["coverageComplete"] = False
        self.write_plan(invalid)
        completed = subprocess.run(
            [sys.executable, "-B", str(SCRIPT), "next", "--plan", str(self.plan_path)],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(1, completed.returncode)
        output = json.loads(completed.stdout)
        self.assertFalse(output["valid"])
        self.assertEqual([], output["runnable"])
        self.assertTrue(any("coverage" in item for item in output["diagnostics"]))


if __name__ == "__main__":
    unittest.main()
