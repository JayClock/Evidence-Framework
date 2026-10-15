"""Reuse-first domain guidance; static contracts are not live agent evidence."""
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


if __name__ == '__main__':
    unittest.main()
