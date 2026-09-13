"""Delivery protocol regression; machine checks do not judge task semantics."""

import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


class DeliveryGuidesContractTests(unittest.TestCase):
    def test_guides_gate_action_and_preserve_single_state(self):
        entry = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        guides = entry.split("### Guides\n", 1)[1].split("### Action\n", 1)[0]
        for concept in (
            "授权",
            "审核",
            "done",
            "procedureRefs",
            "CHECK",
            "不进入 Action",
            "FM/API 摘要不覆盖工程指南",
            "不新增状态文件",
        ):
            self.assertIn(concept, guides)
        self.assertIn("next` 只判断结构候选", entry)
        self.assertIn("实际目录", entry)

    def test_resume_reloads_engineering_sources_and_checks_before_action(self):
        lifecycle = (SKILL / "references/lifecycle.md").read_text(encoding="utf-8")
        resume = lifecycle.split("## 5. 恢复会话", 1)[1]
        self.assertLess(
            resume.index("Guides 导航"), resume.index("plan_state.py verify")
        )
        self.assertLess(resume.index("procedureRefs"), resume.index("通过后才开始"))
        self.assertIn("架构/指南/代码/环境变化须评估重验", resume)
        self.assertIn("停止在 Plan", resume)
