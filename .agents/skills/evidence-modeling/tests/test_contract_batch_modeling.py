"""Contract-level delegation contracts, not proof of live agent execution."""

import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class ContractBatchModelingTests(unittest.TestCase):
    def test_contract_scope_completion_keeps_all_responsibility_without_gating_first_save(self):
        text = (SKILLS / "evidence-fm/references/responsibility-closure.md").read_text()
        for phrase in ("合同范围结束", "全部主履约", "Context Role", "未澄清合同",
                       "不以角色隐藏必要缺口", "全部追责结束", "人类明确确认"):
            self.assertIn(phrase, text)
        self.assertNotIn("单条终点确认、编辑请求、用户沉默、文件存在或机器校验通过都不能替代全局确认", text)
        for path in ("evidence-fm/SKILL.md", "evidence-fm/references/input-review.md",
                     "evidence-fm/references/batch-assessment.md", "evidence-fm/references/editing-workflow.md"):
            with self.subTest(path=path):
                self.assertIn("范围", (SKILLS / path).read_text())
        self.assertIn("不把追责结束作为首次写入 FM 的条件", text)

    def test_completed_contract_delegates_then_records_even_partial_failure(self):
        text = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        diagrams = re.findall(r"```mermaid\n(.*?)```", text, re.S)
        edges = set(re.findall(r"(?m)^\s*(\w+) -->\s*(?:\|[^|]+\|\s*)?(\w+)", diagrams[1]))
        for edge in (("discovery", "endScope"), ("endScope", "complete"),
                     ("endScope", "handoff"), ("ready", "manual"),
                     ("api", "manual"), ("manual", "handoff")):
            self.assertIn(edge, edges)
        for phrase in ("范围结束后的自动接续", "evidence-handoff", "未澄清上下文", "Context Role",
                       "未保存", "只聊不落盘", "不自动切换"):
            self.assertIn(phrase, text)
        discovery = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        self.assertIn("evidence-modeling", discovery)
        self.assertIn("单合同结束确认单独一轮", discovery)

    def test_handoff_keeps_unresolved_roles_versions_questions_and_controls(self):
        text = (SKILLS / "evidence-handoff/SKILL.md").read_text()
        for phrase in ("合同级自动交接", "未澄清合同", "Context Role", "原标识", "暂缓", "业务版本", "实际路径"):
            self.assertIn(phrase, text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("单合同澄清结束", guide)
        self.assertIn("Context Role", guide)
        self.assertIn("evidence-handoff", guide)
        constitution = (REPO / "AGENTS.md").read_text()
        self.assertIn("显式范围完整性检查", constitution)
        self.assertIn("自动交接", constitution)


if __name__ == "__main__":
    unittest.main()
