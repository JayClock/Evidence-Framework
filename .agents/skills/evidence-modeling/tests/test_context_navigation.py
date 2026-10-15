"""On-demand context navigation contracts, not live interview evidence."""
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class ContextNavigationTests(unittest.TestCase):
    def test_navigation_is_on_demand_not_a_discovery_checkpoint(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('合同上下文总览与选择', '明确指定目标或只有一个清晰入口时直接承接',
                       '多个独立入口需要确定优先级', '用户要求查看或切换',
                       '先分析哪个合同上下文？', '选择轮只收集导航选择',
                       '选择只决定分析焦点', '不必先找齐全局所有合同'):
            self.assertIn(phrase, text)
        for edge in ('understanding --> language', 'control -->|需要导航或用户要求查看| navigation',
                     'control -->|已有目标或单一清晰入口| focus'):
            self.assertIn(edge, text)

    def test_completion_cancel_and_viewing_have_distinct_controls(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('结束状态须有人类明确确认', '责任、未决项及适用业务版本',
                       '已澄清结束的合同仍展示，仅供查看', '可选择项限于未结束合同',
                       '取消保留原焦点和原问题', '只看总览保持原控制状态',
                       '单合同结束与全局追责结束分别核对'):
            self.assertIn(phrase, text)

    def test_overview_explains_agreement_parties_and_one_selection(self):
        text = (SKILLS / 'evidence-discovery/examples/navigation.md').read_text()
        display = text.split('```text', 1)[1].split('```', 1)[0]
        self.assertIn('读者（Reader）向平台方（Platform Party）支付订阅费', display)
        self.assertIn('每月两门专栏的上线准备产出', display)
        self.assertIn('责任边界', display)
        self.assertEqual(1, display.count('？'))
        self.assertNotRegex(display, r'sourceRefs|https?://|\.md|资料来源|待追溯')
        self.assertIn('直接进入专栏订阅合同（Column Subscription Contract）', text)
        self.assertIn('不自动切换', text)


if __name__ == '__main__':
    unittest.main()
