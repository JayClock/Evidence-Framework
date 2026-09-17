"""Machine-plan template and protocol contract checks."""

import unittest
from pathlib import Path

import yaml

SKILL = Path(__file__).resolve().parents[1]


class GuidesContractTests(unittest.TestCase):
    def document(self, relative):
        return (SKILL / relative).read_text(encoding="utf-8")

    def test_template_is_single_machine_document_with_unique_state_ownership(self):
        template = yaml.safe_load(self.document("assets/plan-template.yaml"))
        self.assertEqual("3.0", str(template["schemaVersion"]))
        self.assertEqual("smart-domain-plan", template["kind"])
        self.assertEqual({}, template["tasks"])
        self.assertIsNone(template["compiled"])
        self.assertEqual([], template["gaps"])
        self.assertNotIn("taskNotes", template)

    def test_machine_plan_keeps_guides_design_checks_and_evidence_together(self):
        template = self.document("assets/plan-template.yaml")
        for concept in (
            "guides:",
            "design:",
            "procedureRefs",
            "dependencyUsage",
            "checks:",
            "acceptanceCriteria",
            "observedEvidence",
            "status:",
        ):
            self.assertIn(concept, template)

    def test_procedure_selection_precedes_grouping_without_extending_compiler_schema(
        self,
    ):
        entry = self.document("SKILL.md")
        self.assertLess(
            entry.index("实例化切片测试策略"), entry.index("明确切片和归属")
        )
        protocol = self.document("references/guides.md")
        for concept in (
            "触发条件",
            "测试边界",
            "合并与拆分",
            "退出条件",
            "procedureRefs",
            "工序不等于 mode",
        ):
            self.assertIn(concept, protocol)
        template = yaml.safe_load(self.document("assets/plan-template.yaml"))
        self.assertNotIn("procedureId", template)
        self.assertNotIn("procedureStatus", template)

    def test_review_is_projection_not_state(self):
        entry = self.document("SKILL.md")
        self.assertIn("review.html", entry)
        self.assertIn("禁止直接编辑 HTML", entry)
        self.assertIn("tasks[*].status", entry)
        self.assertIn("scripts/render_plan.py", entry)

    def test_protocol_keeps_consumer_project_independent(self):
        protocol = self.document("references/guides.md")
        for concept in (
            "其他项目",
            "实际需求、架构、配置、源码与测试",
            "procedureRefs",
            "不进入 Action",
            "只读",
        ):
            self.assertIn(concept, protocol)
        self.assertNotIn("/Users/", protocol)
        self.assertNotIn("party.user", protocol)
        self.assertNotIn("displayName", protocol)


if __name__ == "__main__":
    unittest.main()
