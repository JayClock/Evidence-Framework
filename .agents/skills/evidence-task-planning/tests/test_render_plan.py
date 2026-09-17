"""Offline task-plan review projection tests."""

from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "render_plan.py"
STATE_TOOL = (
    Path(__file__).resolve().parents[2]
    / "evidence-delivery"
    / "scripts"
    / "plan_state.py"
)
spec = importlib.util.spec_from_file_location("render_plan", SCRIPT)
assert spec and spec.loader
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class RenderPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.plan = self.root / "plan.yaml"
        self.output = self.root / "review.html"
        key = "domain::thing.book::rule.title"
        self.data = {
            "schemaVersion": "3.0",
            "kind": "smart-domain-plan",
            "metadata": {"project": "图书 <审核>"},
            "sourceManifest": [{"path": "docs/requirements.md"}],
            "strategy": {"observableOutcomes": ["可查询图书"]},
            "compiled": {
                "coverageComplete": True,
                "diagnostics": [],
                "tasks": [
                    {
                        "taskKey": key,
                        "ownerRef": "thing.book",
                        "operationRef": "rule.title",
                        "dependsOn": [],
                    }
                ],
                "executionOrder": [key],
            },
            "tasks": {
                key: {
                    "title": "图书标题规则",
                    "mode": "implementation",
                    "status": "planned",
                    "outcome": "拒绝空标题 </script>",
                    "sourceRefs": ["rule.title"],
                    "gapRefs": [],
                    "guides": {"businessRefs": ["rule.title"]},
                    "design": {"behaviorOwner": "thing.book"},
                    "steps": ["先写测试"],
                    "checks": [
                        {"id": "CHECK-TITLE", "command": "pytest", "gapRefs": []}
                    ],
                    "acceptanceCriteria": [
                        {
                            "id": "AC-TITLE",
                            "checkRefs": ["CHECK-TITLE"],
                            "assertions": [
                                {
                                    "path": "title.empty.rejected",
                                    "operator": "equals",
                                    "expected": True,
                                }
                            ],
                        }
                    ],
                    "observedEvidence": [],
                }
            },
            "gaps": [],
        }
        self.plan.write_text(
            yaml.safe_dump(self.data, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def test_render_is_offline_safe_and_contains_all_review_views(self):
        plan, raw = renderer.load_plan(self.plan)
        page = renderer.render(plan, raw, {"valid": True, "diagnostics": []})
        self.assertTrue(page.startswith(renderer.MARKER))
        self.assertIn("Content-Security-Policy", page)
        self.assertIn("Overview", page)
        self.assertIn('data-view="dag">DAG</button>', page)
        self.assertIn('id="dag-canvas"', page)
        self.assertIn("Task dependency DAG", page)
        self.assertIn("location.hash.slice(1)", page)
        self.assertIn("document.createElementNS", page)
        self.assertIn("marker-end", page)
        self.assertIn("event.key === 'Enter' || event.key === ' '", page)
        self.assertIn("Raw YAML", page)
        self.assertIn("Acceptance data", page)
        self.assertIn("title.empty.rejected", page)
        self.assertIn("图书标题规则", page)
        self.assertNotIn("拒绝空标题 </script>", page)
        self.assertIn("\\u003c/script\\u003e", page)
        self.assertEqual(1, page.count("http://"))
        self.assertIn("http://www.w3.org/2000/svg", page)
        self.assertNotIn("https://", page)
        self.assertNotIn("fetch(", page)
        self.assertNotIn('src="http', page)
        self.assertNotIn(".innerHTML", page)
        self.assertNotIn(".outerHTML", page)
        self.assertIn("try {\n  data = JSON.parse", page)
        self.assertIn("} catch (error) {", page)
        self.assertIn("\n<!doctype html>\n<!-- prettier-ignore -->\n<html", page)
        scripts = re.findall(r"<script>(.*?)</script>", page, re.DOTALL)
        self.assertEqual(1, len(scripts))
        actual_hash = base64.b64encode(
            hashlib.sha256(scripts[0].encode()).digest()
        ).decode()
        self.assertIn(f"script-src 'sha256-{actual_hash}'", page)

    def test_cli_validates_and_atomically_publishes(self):
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                str(SCRIPT),
                "--plan",
                str(self.plan),
                "--output",
                str(self.output),
                "--state-tool",
                str(STATE_TOOL),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertTrue(
            self.output.read_text(encoding="utf-8").startswith(renderer.MARKER)
        )
        self.assertTrue(json.loads(result.stdout)["valid"])

    def test_generator_refuses_non_generated_output(self):
        self.output.write_text("human file", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "not created"):
            renderer.publish(self.output, renderer.MARKER)


if __name__ == "__main__":
    unittest.main()
