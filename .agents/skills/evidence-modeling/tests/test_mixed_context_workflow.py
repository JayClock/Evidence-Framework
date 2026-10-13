"""Mixed-context documentation contracts; not live interview evidence."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class MixedContextWorkflowTests(unittest.TestCase):
    def test_analysis_separates_contexts_without_erasing_responsibility(self):
        text = (SKILLS / 'evidence-fm/references/business-analysis.md').read_text()
        for phrase in ('初步上下文识别与分流', '领域上下文', '合同前协商',
                       '不把合约章节直接当成上下文', '不因划入领域而删除合同责任'):
            self.assertIn(phrase, text)

    def test_navigation_and_confirmation_cover_non_contract_focus(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('混合上下文总览与选择', '先分析哪个上下文？',
                       '领域与协商的单轮澄清及结束', '不虚构凭证责任人',
                       '分支结束确认单独一轮', '选择只决定分析焦点'):
            self.assertIn(phrase, text)

    def test_non_contract_admission_does_not_bypass_contract_gaps(self):
        text = (SKILLS / 'evidence-fm/references/responsibility-closure.md').read_text()
        for phrase in ('领域与独立协商的分支准入', '正常、边界和反例',
                       '没有适用履约责任', '不能将未闭合合同改名为领域'):
            self.assertIn(phrase, text)

    def test_non_contract_completion_reaches_generation_and_handoff(self):
        text = (SKILLS / 'evidence-modeling/references/workflow.md').read_text()
        for phrase in ('领域与协商结束后的自动接续', 'branchEnd -->|有效且获授权| resources',
                       'branchEnd -->|依据不足或更窄限制| handoff', '未澄清上下文',
                       '不自动切换', '仅访谈'):
            self.assertIn(phrase, text)
        text = (SKILLS / 'evidence-handoff/SKILL.md').read_text()
        for phrase in ('未澄清上下文', '领域与协商的分支结束', '原标识'):
            self.assertIn(phrase, text)

    def test_mixed_navigation_example_keeps_contract_and_domain_distinct(self):
        text = (SKILLS / 'evidence-discovery/examples/mixed-contexts.md').read_text()
        display = text.split('```text', 1)[1].split('```', 1)[0]
        for phrase in ('合同', '领域', '协商', '先分析哪个上下文？'):
            self.assertIn(phrase, display)
        self.assertEqual(1, display.count('？'))
        for phrase in ('仅访谈', '不生成', '不因划入领域而删除合同责任'):
            self.assertIn(phrase, text)

    def test_overviews_hide_pending_columns_but_keep_unresolved_work(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        self.assertIn('总览不展示“待追溯”一栏', text)
        self.assertIn('未决问题继续保留', text)
        self.assertIn('总览和日常问答不展示资料来源信息', text)
        self.assertIn('内部仍保留依据及版本', text)
        for name in ('navigation.md', 'mixed-contexts.md'):
            example = (SKILLS / 'evidence-discovery/examples' / name).read_text()
            display = example.split('```text', 1)[1].split('```', 1)[0]
            self.assertNotRegex(display, r'待追溯|尚待逐项追溯|待澄清|缺口清单')
            self.assertNotRegex(display, r'sourceRefs|https?://|\.md|资料来源|来源 ID|页码')

    def test_classification_is_checked_before_navigation_and_rechecked_on_change(self):
        method = (SKILLS / 'evidence-fm/references/business-analysis.md').read_text()
        for phrase in ('分类验证：先检验，再展示', '运营特定', '运营中立',
                       '改变运营方式', '替换经营对象', '不能把假设当成现行事实',
                       '没有收费或书面合同', '工具或集成'):
            self.assertIn(phrase, method)
        interview = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for edge in ('understanding --> classification', 'classification -->|需调整| correction',
                     'correction --> classification',
                     'classification -->|验证通过或不足项已移出选项| language'):
            self.assertIn(edge, interview)
        for phrase in ('选择不是分类验证或业务批准', '受影响边界重新验证',
                       '没有任何可展示项', '内部仍保留依据及版本'):
            self.assertIn(phrase, interview)

    def test_outer_review_does_not_replace_inner_validation_or_human_confirmation(self):
        workflow = (SKILLS / 'evidence-modeling/references/workflow.md').read_text()
        for phrase in ('双层循环的验证与退出', 'Plan', 'Do', 'Check', 'Act',
                       'Sensors', '人类结束确认', '不自动修改 Skill'):
            self.assertIn(phrase, workflow)
        example = (SKILLS / 'evidence-discovery/examples/mixed-contexts.md').read_text()
        for phrase in ('功能清单不足以分类', '混合责任与能力', '后续输入推翻边界'):
            self.assertIn(phrase, example)

    def test_behavior_cases_cover_navigation_closure_and_counterexamples(self):
        for skill, categories in {
            'evidence-discovery': ('mixed-context-navigation', 'domain-classification-keeps-obligations'),
            'evidence-modeling': ('domain-closed-contract-pending', 'domain-closure-readonly-or-invalid'),
        }.items():
            cases = json.loads((SKILLS / skill / 'evals/evals.json').read_text())['evals']
            indexed = {case['category']: case for case in cases}
            for category in categories:
                self.assertIn(category, indexed)
                case = indexed[category]
                self.assertGreaterEqual(len(case.get('expectations', case.get('assertions', []))), 3)


if __name__ == '__main__':
    unittest.main()
