"""Contract-first business analysis and conversational dependency contracts."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class ContractFirstWorkflowTests(unittest.TestCase):
    def test_method_orders_agreement_skeleton_trace_and_exceptions(self):
        text = (SKILLS / 'evidence-fm/references/business-analysis.md').read_text()
        headings = ('## 2. 寻找合同，明确参与方', '## 3. 履约：先画请求—确认骨架',
                    '## 4. 凭证：沿骨架追溯关键数据', '## 5. 异常：对新义务重复同一循环')
        positions = [text.index(heading) for heading in headings]
        self.assertEqual(sorted(positions), positions)
        for phrase in ('双方与标的是对象关联', '不提前当成签约事实或合同状态字段',
                       '不是已经找到全部单据', '引用不自动表示先后',
                       '不要求固定的中间单据'):
            self.assertIn(phrase, text)

    def test_round_groups_shared_prerequisites_with_independent_questions(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('带共享节点的依赖图', '每条来源链深度优先', '前置依据已经具备', '共同前提与其他独立问题同轮提出',
                       '已知事实直接复用或推导', '全部可同时澄清的独立必要问题', '问后等待真人'):
            self.assertIn(phrase, text)

    def test_evals_cover_contract_data_and_exception_reuse(self):
        data = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())
        indexed = {case['category']: case for case in data['evals']}
        for category in ('fulfillment', 'recursive-responsibility-closure',
                         'skill-only-complete-interview', 'context-sufficiency-boundary'):
            self.assertIn('evidence-fm', indexed[category]['knowledgeSkills'])
            self.assertGreaterEqual(len(indexed[category]['expectations']), 4)
        self.assertTrue(any('请求—确认骨架' in item for item in indexed['fulfillment']['expectations']))
        self.assertTrue(any('追溯循环' in item for item in indexed['recursive-responsibility-closure']['expectations']))


if __name__ == '__main__':
    unittest.main()
