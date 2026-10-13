"""Contract navigation guidance, independently of any persistence format."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class ContextNavigationTests(unittest.TestCase):
    def test_navigation_selects_focus_after_material_based_identification(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('合同上下文总览与选择', '首次消化资料', '经营依据与独立边界充分',
                       '先分析哪个合同上下文？', '再承接已知双方和全部主履约',
                       '选择轮只收集导航选择', '选择只决定分析焦点'):
            self.assertIn(phrase, text)

    def test_completion_cancel_and_viewing_have_distinct_controls(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('结束状态须有人类明确确认', '责任、未决项及适用业务版本',
                       '已澄清结束的合同仍展示，仅供查看', '可选择项限于未结束合同',
                       '取消保留原焦点和原问题', '只看总览保持原控制状态',
                       '单合同结束与全局追责结束分别核对'):
            self.assertIn(phrase, text)

    def test_overview_uses_business_purpose_and_one_selection(self):
        text = (SKILLS / 'evidence-discovery/examples/navigation.md').read_text()
        display = text.split('```text', 1)[1].split('```', 1)[0]
        self.assertIn('现金权责：观察主体为内容平台（Content Platform），收入对应内容提供责任', display)
        self.assertIn('读者（Reader）与内容平台（Content Platform）签订订阅协议（Subscription Agreement）', display)
        self.assertIn('责任边界', display)
        self.assertEqual(1, display.count('？'))
        self.assertNotRegex(display, r'sourceRefs|https?://|\.md')

    def test_behavior_cases_cover_navigation_and_counterexamples(self):
        data = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())
        indexed = {item['category']: item for item in data['evals']}
        for category in ('skill-only-complete-interview', 'completed-context-not-selectable',
                         'context-navigation-ambiguous-selection', 'operating-basis-marketplace',
                         'agreement-name-without-operating-basis', 'mixed-context-navigation'):
            self.assertIn('follow_up', indexed[category])
            self.assertGreaterEqual(len(indexed[category]['expectations']), 4)


if __name__ == '__main__':
    unittest.main()
