"""Composition flow and permission-example contracts, not agent execution evidence."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
MODELING = SKILLS / "evidence-modeling"


class WorkflowAnchorTests(unittest.TestCase):
    def test_entry_delegates_flow_and_action_scoped_examples(self):
        entry = (MODELING / "SKILL.md").read_text()
        self.assertIn("examples/README.md", entry)
        workflow = (MODELING / "references/workflow.md").read_text()
        self.assertIn("../assets/handoff-template.md", workflow)
        self.assertIn("../examples/README.md", workflow)
        diagrams = re.findall(r"```mermaid\n(.*?)```", workflow, re.S)
        self.assertEqual(2, len(diagrams))
        structure, flow = diagrams
        self.assertIn("modeling --> discovery", structure)
        self.assertIn("modeling --> fm", structure)
        self.assertIn("modeling --> visual", structure)
        self.assertIn("modeling --> manual", structure)
        self.assertIn("discovery -.-> fm", structure)
        edges = set(re.findall(r"(?m)^\s*(\w+) -->\s*(?:\|[^|]+\|\s*)?(\w+)", flow))
        self.assertTrue({
            ("intent", "discussion"), ("intent", "discovery"),
            ("discovery", "authorized"), ("authorized", "fm"),
            ("authorized", "handoff"), ("fm", "check"),
            ("check", "endScope"), ("check", "handoff"),
            ("discovery", "endScope"), ("endScope", "complete"),
            ("endScope", "handoff"), ("complete", "ready"),
            ("ready", "api"), ("ready", "manual"),
            ("api", "page"), ("api", "manual"),
            ("page", "review"), ("page", "manual"), ("review", "manual"),
            ("intent", "manual"), ("manual", "handoff"),
        }.issubset(edges), edges)
        self.assertFalse(any(start == "handoff" for start, _ in edges))

    def cases(self):
        return json.loads((MODELING / "examples/permissions.json").read_text())["cases"]

    def test_examples_exercise_narrow_authorization_and_partial_delivery(self):
        cases = {case["id"]: case for case in self.cases()}
        self.assertEqual({"combined", "fm-only", "read-only", "api-blocked"}, set(cases))
        self.assertEqual([], cases["read-only"]["allowedWrites"])
        self.assertEqual(["fm-check", "api-check"], cases["read-only"]["steps"])
        self.assertEqual(["authorization", "fm-edit", "fm-check"], cases["fm-only"]["steps"])
        self.assertEqual([".evidence/fm/"], cases["fm-only"]["allowedWrites"])
        self.assertEqual("consistency", cases["fm-only"]["checkMode"])
        combined = cases["combined"]
        self.assertEqual("scope-completeness", combined["checkMode"])
        self.assertLess(combined["steps"].index("fm-edit"), combined["steps"].index("scope-confirmation"))
        self.assertLess(combined["steps"].index("scope-confirmation"), combined["steps"].index("fm-check"))
        self.assertLess(combined["steps"].index("fm-check"), combined["steps"].index("api-edit"))
        self.assertLess(combined["steps"].index("api-check"), combined["steps"].index("api-project"))
        self.assertLess(combined["steps"].index("api-project"), combined["steps"].index("joint-review"))
        blocked = cases["api-blocked"]
        self.assertNotIn("api-project", blocked["steps"])
        self.assertNotIn("joint-review", blocked["steps"])
        self.assertEqual([".evidence/fm/"], blocked["saved"])
        self.assertEqual("blocked", blocked["exit"])
        self.assertFalse(blocked["rollback"])
        for case in cases.values():
            self.assertEqual(1, case["designFmChecks"])
            self.assertEqual("same-fm-check", case.get("apiInput", "same-fm-check"))
            self.assertFalse(case["approved"])
            self.assertNotIn("requirements", case["steps"])

    def test_handoff_template_reports_observations_without_business_state(self):
        text = (MODELING / "assets/handoff-template.md").read_text()
        for heading in ("授权", "输入与恢复", "文件结果", "检查", "剩余工作", "停止"):
            self.assertIn(f"## {heading}", text)
        self.assertIn("未执行", text)
        self.assertIn("不新增", text)
        self.assertNotRegex(text, r"(?m)^approved:|^status:|^modelDigest:\s*[0-9a-f]+")

    def test_runtime_examples_are_internal_and_have_no_external_attribution(self):
        index = (MODELING / "examples/README.md").read_text()
        self.assertIn("](handoffs.md)", index)
        self.assertIn("](permissions.json)", index)
        for document in (MODELING / "examples").glob("*.md"):
            self.assertNotRegex(document.read_text(), r"(?m)https?://|^author:|^date:")


if __name__ == "__main__":
    unittest.main()
