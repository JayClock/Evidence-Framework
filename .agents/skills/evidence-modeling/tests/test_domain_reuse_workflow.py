"""Reuse-first domain guidance; static contracts are not live agent evidence."""
import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]


class DomainReuseWorkflowTests(unittest.TestCase):
    def test_domain_analysis_starts_at_reuse_not_internal_redesign(self):
        text = (SKILLS / 'evidence-fm/references/domain-modeling.md').read_text()
        for phrase in ('优先复用成熟方案', '业务连接点', '必要时深入',
                       '不自动选产品', '不替合同决定', '未展开不等于缺口'):
            self.assertIn(phrase, text)
        self.assertLess(text.index('优先复用成熟方案'), text.index('## 2.'))

    def test_interview_admission_and_generation_keep_consumption_scope(self):
        expectations = {
            'evidence-discovery/references/interview.md': ('优先复用', '业务连接点', '不默认展开内部规则'),
            'evidence-fm/references/responsibility-closure.md': ('复用连接范围', '内部未展开不自动阻塞'),
            'evidence-modeling/references/workflow.md': ('复用连接范围', '不生成成熟方案的内部模型或 API'),
            'evidence-handoff/SKILL.md': ('复用连接范围', '未展开不等于未决'),
        }
        for path, phrases in expectations.items():
            text = (SKILLS / path).read_text()
            for phrase in phrases:
                with self.subTest(path=path, phrase=phrase):
                    self.assertIn(phrase, text)

    def test_evals_cover_reuse_business_gap_and_explicit_deepening(self):
        cases = json.loads((SKILLS / 'evidence-discovery/evals/evals.json').read_text())['evals']
        cases = {case['category']: case for case in cases}
        for category in ('domain-reuse-connection-only', 'noncash-fulfillment-keeps-economic-anchor',
                         'domain-reuse-explicit-deepening', 'domain-role-versus-system-role'):
            self.assertIn(category, cases)
            self.assertGreaterEqual(len(cases[category]['expectations']), 3)


if __name__ == '__main__':
    unittest.main()
