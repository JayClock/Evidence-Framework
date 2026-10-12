"""Contract-first business analysis and conversational dependency contracts."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class ContractFirstWorkflowTests(unittest.TestCase):
    def test_method_orders_agreement_skeleton_trace_and_exceptions(self):
        text = (SKILLS / 'evidence-fm/references/business-analysis.md').read_text()
        headings = ('## 2. 合同：确定约定边界', '## 3. 履约：先画请求—确认骨架',
                    '## 4. 凭证：沿骨架追溯关键数据', '## 5. 异常：对新义务重复同一循环')
        positions = [text.index(heading) for heading in headings]
        self.assertEqual(sorted(positions), positions)
        for phrase in ('属性、关联、履约项与结果凭证', '不是通用合同字段表',
                       '骨架存在不等于完成证明已经查清', '引用不自动表示先后',
                       '不要求每项履约都有固定的中间单据'):
            self.assertIn(phrase, text)

    def test_next_question_depends_on_settled_prerequisites(self):
        text = (SKILLS / 'evidence-discovery/references/interview.md').read_text()
        for phrase in ('带共享节点的依赖图', '每条来源链深度优先', '前置依据已经具备', '依赖另一个未知时先追溯该依据',
                       '已知事实直接复用或推导', '每轮一个业务焦点，可问多个独立问题', '问后等待真人'):
            self.assertIn(phrase, text)

    def test_evals_cover_contract_data_and_exception_reuse(self):
        data = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())
        indexed = {case['category']: case for case in data['evals']}
        for category in ('agreement-initial-data', 'skeleton-before-evidence-trace',
                         'exception-reuses-skeleton-trace', 'multi-agreement-reference-resume',
                         'context-sufficiency-boundary'):
            self.assertIn('evidence-fm', indexed[category]['knowledgeSkills'])
            self.assertGreaterEqual(len(indexed[category]['expectations']), 4)


if __name__ == '__main__':
    unittest.main()
