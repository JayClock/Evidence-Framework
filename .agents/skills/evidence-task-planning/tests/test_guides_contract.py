"""Template/protocol structure checks, not proof of semantic readiness."""

import re
import unittest
from pathlib import Path

import yaml

SKILL = Path(__file__).resolve().parents[1]


class GuidesContractTests(unittest.TestCase):
    def document(self, relative):
        return (SKILL / relative).read_text(encoding="utf-8")

    def test_templates_preserve_single_yaml_and_state_ownership(self):
        task = self.document("assets/task-plan-template.md")
        index = self.document("assets/plan-index-template.md")
        task_blocks = re.findall(r"```yaml\n(.*?)\n```", task, re.S)
        index_blocks = re.findall(r"```yaml\n(.*?)\n```", index, re.S)
        self.assertEqual(len(task_blocks), 1)
        self.assertEqual(len(index_blocks), 1)
        detail = yaml.safe_load(task_blocks[0])
        plan = yaml.safe_load(index_blocks[0])
        self.assertEqual(detail["planRef"], "../index.md")
        self.assertEqual(detail["procedureRefs"], [])
        self.assertEqual(detail["observedEvidence"], [])
        self.assertNotIn("status", detail)
        self.assertNotIn("dependsOn", detail)
        self.assertNotIn("guidesReady", detail)
        self.assertEqual(plan["sourceManifest"], [])
        self.assertEqual(plan["taskNotes"], [])
        self.assertIsNone(plan["compiled"])

    def test_task_has_business_and_engineering_guides_before_action(self):
        task = self.document("assets/task-plan-template.md")
        guides = task.split("## 2.", 1)[0]
        for concept in (
            "授权",
            "业务来源",
            "工程基线",
            "procedureRefs",
            "前置产物",
            "审核",
            "新鲜度",
            "CHECK",
            "不进入 Action",
            "只读",
        ):
            self.assertIn(concept, guides)
        self.assertLess(task.index("Guides"), task.index("## 3."))

    def test_procedure_selection_precedes_grouping_without_extending_schema(self):
        entry = self.document("SKILL.md")
        selection = entry.index("按测试工序展开候选任务")
        self.assertLess(selection, entry.index("concern: domain"))
        protocol = self.document("references/guides.md")
        for concept in (
            "触发条件",
            "测试边界",
            "合并与拆分",
            "退出条件",
            "procedureRefs",
            "不新增",
            "工序不等于 mode",
        ):
            self.assertIn(concept, protocol)
        index = self.document("assets/plan-index-template.md")
        task = self.document("assets/task-plan-template.md")
        self.assertIn("工序选择", index)
        self.assertIn("工序实例", task)
        self.assertIn("触发条件", task)
        self.assertIn("测试边界", task)
        for template in (index, task):
            data = yaml.safe_load(re.findall(r"```yaml\n(.*?)\n```", template, re.S)[0])
            self.assertNotIn("procedureId", data)
            self.assertNotIn("procedureStatus", data)

    def test_procedure_protocol_preserves_independent_test_boundaries(self):
        protocol = self.document("references/guides.md")
        for concept in (
            "API 不因层次顺序依赖持久化",
            "唯一拥有",
            "design.*",
            "checks",
            "completionCriteria",
            "coverageComplete",
        ):
            self.assertIn(concept, protocol)

    def test_protocol_is_required_and_keeps_consumer_project_independent(self):
        entry = self.document("SKILL.md")
        self.assertIn("[任务前馈装配协议](references/guides.md)", entry)
        protocol = self.document("references/guides.md")
        for concept in (
            "其他项目",
            "实际需求、架构、配置、源码与测试",
            "不覆盖",
            "procedureRefs",
            "taskNotes",
            "不进入 Action",
            "只读",
            "不执行产品 CHECK",
        ):
            self.assertIn(concept, protocol)
        self.assertNotIn("/Users/", protocol)
        self.assertNotIn("party.user", protocol)
        self.assertNotIn("displayName", protocol)
