"""Entrypoint and evaluation-catalog contracts, not measured agent routing accuracy."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
NAMES = (
    "evidence-modeling",
    "evidence-discovery",
    "evidence-fm",
    "evidence-visualization",
)


class SkillRoutingTests(unittest.TestCase):
    def test_entrypoints_expose_a_complete_execution_loop(self):
        for name in NAMES:
            with self.subTest(skill=name):
                text = (SKILLS / name / "SKILL.md").read_text()
                headings = re.findall(r"^## (.+)$", text, re.M)
                self.assertEqual(["Guides", "Action", "Sensors", "Steer"], headings)
                description = re.search(r"^description: (.+)$", text, re.M)
                self.assertIsNotNone(description)
                assert description is not None
                prefix = "仅在显式" if name == "evidence-modeling" else "当用户"
                self.assertTrue(description[1].startswith(prefix))
                self.assertIn("不", description[1])
                self.assertIn("停止", text.split("## Steer", 1)[1])

    def test_fm_editing_routes_to_its_specialist_sources(self):
        text = (SKILLS / "evidence-fm/SKILL.md").read_text()
        targets = set(re.findall(r"\]\((references/[^)#]+)", text))
        self.assertLessEqual({
            "references/business-analysis.md", "references/domain-language.md",
            "references/responsibility-closure.md", "references/semantics.md",
            "references/format.md", "references/provenance.md",
            "references/cel-rules.md", "references/scenario-validation.md",
            "references/validation.md", "references/editing-workflow.md",
        }, targets)
        flow = (SKILLS / "evidence-fm/references/editing-workflow.md").read_text()
        self.assertIn("admission -->|满足| mapping", flow)
        self.assertIn("mapping --> edit", flow)
        self.assertIn("responsibility-closure.md", flow)
        self.assertNotIn("sourceCardinality", text)
        self.assertNotIn("responsibleRoleRef", text)

    def test_visual_generation_does_not_load_the_ui_spec_unconditionally(self):
        text = (SKILLS / "evidence-visualization/SKILL.md").read_text()
        self.assertIn("references/visual-review.md", text)
        self.assertIn("references/operations.md", text)
        self.assertIn("--require-api", text)
        self.assertIn("tests/review-browser.mjs", text)
        self.assertNotIn("### 字段内联派生计算", text)
        self.assertNotIn("derivedByRuleRef", text)
        self.assertIn("实现维护或视觉评审", text)

    def test_routing_evaluations_cover_all_entries_and_near_misses(self):
        catalog = json.loads((SKILLS / "evidence-modeling/evals/routing.json").read_text())
        self.assertEqual(list(NAMES), catalog["availableSkills"])
        cases = catalog["evals"]
        self.assertGreaterEqual(len(cases), 20)
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        self.assertEqual(set(NAMES) | {None}, {case["primarySkill"] for case in cases})
        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["prompt"])
                self.assertTrue(case["expectations"])
                self.assertTrue(case["forbiddenActions"])
                self.assertIsInstance(case["explicit"], bool)
                if case["primarySkill"] == "evidence-modeling":
                    self.assertTrue(case["explicit"])
        self.assertGreaterEqual(sum(case["primarySkill"] is None for case in cases), 3)


if __name__ == "__main__":
    unittest.main()
