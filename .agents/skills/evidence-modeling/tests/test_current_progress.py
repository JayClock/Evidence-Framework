"""Focused display contracts; live interview quality is evaluated separately."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class CurrentProgressTests(unittest.TestCase):
    def test_focused_display_keeps_position_story_and_numbered_questions(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        display = text.split('### 单点澄清', 1)[1].split('## 5.', 1)[0]
        for phrase in ('合同名称 → 履约项名称 → 请求或确认', '当前位置：', '业务名称',
                       '类型只作辅助标签', '简短追溯故事', '信息来源追到了哪里',
                       '每题只澄清一个仍影响当前判断的业务问题', '未知明确为未知',
                       '领域上下文 → 当前对象', '同一份当前进度'):
            self.assertIn(phrase, display)
        self.assertIn('日常展示聚焦当前节点', display)
        self.assertIn('范围或全局确认时展示完整理解', display)

    def test_story_uses_actual_business_dependencies(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('请求与确认本身就是凭证', '凭证存在与证明充分分别核对',
                       '已找到什么业务依据', '说明证明作用', '问题另起一段',
                       '只有必要未知才接问题', '按新节点重建故事'):
            if phrase == '按新节点重建故事':
                phrase = '用新节点重建故事'
            self.assertIn(phrase, text)

    def test_global_responsibility_coverage_is_independent_of_daily_display(self):
        text = (SKILLS / 'evidence-fm/references/responsibility-closure.md').read_text()
        for phrase in ('完整核对本范围主履约清单', '人类明确确认全部追责结束',
                       '不能自行缩小', '各层异常'):
            self.assertIn(phrase, text)

    def test_project_entrypoints_keep_semantic_position(self):
        for relative in ('AGENTS.md', 'docs/evidence-modeling.md', '.agents/skills/evidence-discovery/references/interview.md'):
            text = (REPO / relative).read_text()
            self.assertIn('请求或确认', text)
            self.assertIn('当前', text)
        workflow = (SKILLS / 'evidence-modeling/references/workflow.md').read_text()
        self.assertIn('请求或确认', workflow)
        self.assertIn('原问题及控制意图', workflow)

    def test_evals_cover_focused_progress_and_context_sufficiency(self):
        cases = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())['evals']
        indexed = {case['category']: case for case in cases}
        for category in ('current-only-progress', 'request-confirmation-progress-resume',
                         'progress-without-fictitious-position', 'focused-exception-progress',
                         'evidence-provenance-story', 'context-sufficiency-boundary'):
            self.assertIn('evidence-fm', indexed[category]['knowledgeSkills'])
            self.assertGreaterEqual(len(indexed[category]['expectations']), 4)
        self.assertIn('Q-001', indexed['current-only-progress']['prompt'])


if __name__ == '__main__':
    unittest.main()
