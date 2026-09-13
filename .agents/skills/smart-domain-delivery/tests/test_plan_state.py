"""Deterministic dual-loop plan-state checks; no plan files are modified."""

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
        self.plan = Path(self.temp.name) / "smart-domain"
        (self.plan / "tasks").mkdir(parents=True)
        self.index = self.plan / "index.md"
        self.first = "domain::thing.book::rule.create"
        self.second = "api::context.library::api.book.get"
        self.data = {
            "schemaVersion": "2.0",
            "kind": "task-index",
            "compiled": {
                "inputDigest": "current",
                "coverageComplete": True,
                "diagnostics": [],
                "tasks": [
                    {
                        "taskKey": self.first,
                        "path": "tasks/图书规则.md",
                        "dependsOn": [],
                    },
                    {
                        "taskKey": self.second,
                        "path": "tasks/图书接口.md",
                        "dependsOn": [self.first],
                    },
                ],
                "executionOrder": [self.first, self.second],
            },
            "taskNotes": [
                {
                    "taskRef": self.first,
                    "mode": "implementation",
                    "status": "planned",
                    "outcome": "实现图书规则",
                    "gapRefs": [],
                },
                {
                    "taskRef": self.second,
                    "mode": "verify",
                    "status": "planned",
                    "outcome": "验证图书接口",
                    "gapRefs": [],
                },
            ],
            "gaps": [],
        }
        self.write_task("图书规则.md", self.first, "CHECK-DOMAIN")
        self.write_task("图书接口.md", self.second, "CHECK-API")
        self.write_index(self.data)

    def markdown(self, data):
        return (
            "# generated fixture\n\n```yaml\n"
            + yaml.safe_dump(data, allow_unicode=True, sort_keys=False)
            + "```\n"
        )

    def write_index(self, data):
        self.index.write_text(self.markdown(data), encoding="utf-8")

    def write_task(self, name, task_key, check_id, *, evidence=None):
        data = {
            "schemaVersion": "2.0",
            "kind": "task-plan",
            "taskKey": task_key,
            "planRef": "../index.md",
            "checks": [
                {
                    "id": check_id,
                    "command": "python -m unittest",
                    "gapRefs": [],
                }
            ],
            "completionCriteria": ["检查通过"],
            "observedEvidence": evidence or [],
        }
        (self.plan / "tasks" / name).write_text(self.markdown(data), encoding="utf-8")

    def test_first_planned_task_is_runnable_and_tool_is_read_only(self):
        before = {path: path.read_bytes() for path in self.plan.rglob("*.md")}
        result = plan_state.inspect_plan(self.index)
        after = {path: path.read_bytes() for path in self.plan.rglob("*.md")}

        self.assertTrue(result["valid"])
        self.assertEqual([self.first], [task["taskKey"] for task in result["runnable"]])
        self.assertEqual(before, after)
        self.assertIn("not-checked", result["sourceFreshness"])

    def test_done_dependency_makes_next_task_runnable(self):
        self.data["taskNotes"][0]["status"] = "done"
        self.write_task(
            "图书规则.md",
            self.first,
            "CHECK-DOMAIN",
            evidence=[{"command": "python -m unittest", "exitCode": 0}],
        )
        self.write_index(self.data)

        result = plan_state.inspect_plan(self.index)

        self.assertTrue(result["valid"])
        self.assertEqual(
            [self.second], [task["taskKey"] for task in result["runnable"]]
        )

    def test_supported_execution_modes_are_explicit(self):
        modes = {"design", "setup", "implementation", "verify", "manual"}
        self.assertEqual(modes, plan_state.MODES)
        for mode in sorted(modes):
            with self.subTest(mode=mode):
                self.data["taskNotes"][0]["mode"] = mode
                self.write_index(self.data)
                result = plan_state.inspect_plan(self.index)
                self.assertTrue(result["valid"], result["diagnostics"])
                self.assertEqual(mode, result["runnable"][0]["mode"])

    def test_unknown_mode_is_rejected_without_task_selection(self):
        self.data["taskNotes"][0]["mode"] = "unsupported"
        self.write_index(self.data)
        result = plan_state.inspect_plan(self.index)
        self.assertFalse(result["valid"])
        self.assertEqual([], result["runnable"])
        self.assertTrue(any("mode is invalid" in x for x in result["diagnostics"]))

    def test_active_task_requires_completed_dependencies(self):
        self.data["taskNotes"][1]["status"] = "in-progress"
        self.write_index(self.data)

        result = plan_state.inspect_plan(self.index)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any(
                "before dependencies are done" in item for item in result["diagnostics"]
            )
        )

    def test_blocked_task_and_empty_command_require_known_gap(self):
        self.data["taskNotes"][0]["status"] = "blocked"
        task = plan_state.load_document(self.plan / "tasks" / "图书规则.md")
        task["checks"][0]["command"] = None
        (self.plan / "tasks" / "图书规则.md").write_text(
            self.markdown(task), encoding="utf-8"
        )
        self.write_index(self.data)

        result = plan_state.inspect_plan(self.index)

        self.assertFalse(result["valid"])
        self.assertTrue(any("must reference a gap" in x for x in result["diagnostics"]))
        self.assertTrue(
            any("has no command and no gap" in x for x in result["diagnostics"])
        )

    def test_task_notes_files_and_check_ids_are_one_to_one(self):
        self.data["taskNotes"].pop()
        duplicate = plan_state.load_document(self.plan / "tasks" / "图书接口.md")
        duplicate["checks"][0]["id"] = "CHECK-DOMAIN"
        (self.plan / "tasks" / "图书接口.md").write_text(
            self.markdown(duplicate), encoding="utf-8"
        )
        self.write_index(self.data)

        result = plan_state.inspect_plan(self.index)

        self.assertFalse(result["valid"])
        self.assertTrue(any("missing taskNotes" in x for x in result["diagnostics"]))
        self.assertTrue(any("duplicate CHECK id" in x for x in result["diagnostics"]))

    def test_done_requires_completion_criteria_and_observed_evidence(self):
        self.data["compiled"]["tasks"] = [self.data["compiled"]["tasks"][0]]
        self.data["compiled"]["executionOrder"] = [self.first]
        self.data["taskNotes"] = [self.data["taskNotes"][0]]
        self.data["taskNotes"][0]["status"] = "done"
        self.write_index(self.data)

        result = plan_state.inspect_plan(self.index)

        self.assertFalse(result["valid"])
        self.assertTrue(any("no observed evidence" in x for x in result["diagnostics"]))

    def test_execution_order_must_follow_dependencies(self):
        self.data["compiled"]["executionOrder"] = [self.second, self.first]
        self.write_index(self.data)

        result = plan_state.inspect_plan(self.index)

        self.assertFalse(result["valid"])
        self.assertTrue(
            any("before dependency" in item for item in result["diagnostics"])
        )

    def test_cli_next_reports_json_and_nonzero_for_invalid_plan(self):
        invalid = copy.deepcopy(self.data)
        invalid["compiled"]["coverageComplete"] = False
        self.write_index(invalid)

        completed = subprocess.run(
            [sys.executable, "-B", str(SCRIPT), "next", "--index", str(self.index)],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(1, completed.returncode)
        output = json.loads(completed.stdout)
        self.assertFalse(output["valid"])
        self.assertEqual([], output["runnable"])
        self.assertTrue(any("coverage" in x for x in output["diagnostics"]))


if __name__ == "__main__":
    unittest.main()
