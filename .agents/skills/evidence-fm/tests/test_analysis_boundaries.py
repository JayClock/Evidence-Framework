"""Business-analysis coverage kept separate from formal-expression contracts."""

import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


class AnalysisBoundaryTests(unittest.TestCase):
    def test_request_and_confirmation_responsibility_belongs_to_contract_parties(self):
        text = (SKILL / "references/business-analysis.md").read_text()
        self.assertIn("责任人就是所属合同的一方", text)
        self.assertIn("请求责任人：平台方（Platform Party），为合同一方", text)
        self.assertIn("确认责任人：作者（Author），为合同另一方", text)
        self.assertIn("经办人、上传人和证明提供方", text)
        self.assertIn("不在双方之外另寻凭证责任角色", text)

    def test_scope_review_warns_about_omissions_not_candidate_contracts(self):
        text = (SKILL / "references/responsibility-closure.md").read_text()
        self.assertNotIn("Agent 可以展示候选和遗漏风险", text)
        self.assertIn("责任遗漏", text)
        self.assertIn("不展示供用户筛选的候选合同", text)


if __name__ == "__main__":
    unittest.main()
