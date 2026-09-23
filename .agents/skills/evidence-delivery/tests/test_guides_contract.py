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
        resume = lifecycle.split("## 6. 恢复会话", 1)[1]
        self.assertLess(
            resume.index("Guides 导航"), resume.index("plan_state.py verify")
        )
        self.assertLess(resume.index("procedureRefs"), resume.index("通过后才开始"))
        self.assertIn("架构/指南/代码/环境变化须评估重验", resume)
        self.assertIn("停止在 Plan", resume)
        self.assertLess(resume.index("核对已归位的用户反馈"), resume.index("通过后才开始"))

    def test_knowledge_handoff_separates_triage_discovery_decision_from_progress(self):
        entry = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        lifecycle = (SKILL / "references/lifecycle.md").read_text(encoding="utf-8")
        constitution = (SKILL.parents[2] / "AGENTS.md").read_text(encoding="utf-8")
        handoff = lifecycle.split("## 5. 知识交接与归位", 1)[1].split(
            "## 6. 恢复会话", 1
        )[0]
        self.assertIn("知识交接协议", entry)
        self.assertIn("未保存", entry)
        self.assertIn("清点本轮新增的用户反馈", constitution)
        for concept in (
            "用户统筹", "执行发现", "决定", "来源定位", "适用场景",
            "观察时间", "作出者", "理由", "未保存", "gaps", "status",
            "observedEvidence", "外层", "实际授权", "只读讨论",
            "后说的覆盖先说的", "适用范围", "已保存等同于已批准",
        ):
            self.assertIn(concept, handoff)
        self.assertLess(handoff.index("内层任务"), handoff.index("外层在验收"))
        self.assertIn("不能声称下一会话会自动看到", handoff)
