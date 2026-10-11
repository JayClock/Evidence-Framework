"""Navigation documentation contracts, not proof of live agent behavior."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class ContextNavigationTests(unittest.TestCase):
    def test_navigation_and_completion_rules_have_one_protocol_owner(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in (
            '合同上下文总览与选择', '首次消化资料', '通过界面表达相同意图',
            '已澄清结束的合同仍展示，但不可选择或切换进入',
            '自然语言指定也同样拒绝', '不提供重新开启入口',
            'clarificationCompletionSourceRefs', '不分配业务 Q-ID',
            '取消保留原焦点和原问题', '先重新核对目标存在且未结束',
            '清除不再适用的', '保留原问题记录', '用编号列表展示',
            '零候选', '全部结束', '只读查看或仅浏览不写焦点',
        ):
            self.assertIn(phrase, text)

    def test_completion_stores_source_references_on_the_original_agreement(self):
        template = json.loads((SKILLS / 'evidence-discovery/assets/discovery-template.json').read_text())
        field = template['business']['agreements'][0]['clarificationCompletionSourceRefs'][0]
        self.assertIn('可选', field)
        self.assertIn('原话及覆盖版本', field)
        self.assertIn('未取得省略', field)
        self.assertNotIn('contextMenu', template)
        self.assertIn('总览导航', template['handoff']['viewRefs'][0])

    def test_behavior_cases_cover_navigation_not_just_display(self):
        data = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())
        indexed = {item['category']: item for item in data['evals']}
        for name in ('context-overview-selection', 'completed-context-not-selectable', 'context-navigation-empty-headless'):
            case = indexed[name]
            self.assertGreaterEqual(len(case['expectations']), 4)
            self.assertIn('follow_up', case)


if __name__ == '__main__':
    unittest.main()
