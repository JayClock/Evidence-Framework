"""Business-analysis coverage kept separate from formal-expression contracts."""

import json
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


class AnalysisBoundaryTests(unittest.TestCase):
    def test_independent_domain_eval_has_its_own_closure_not_a_global_blocker(self):
        catalog = json.loads((SKILL / "evals/behavior.json").read_text())
        cases = {case["id"]: case for case in catalog["evals"]}
        domain = cases[9]
        self.assertEqual("closed-domain-with-open-contract", domain["category"])
        self.assertIn("本分支澄清结束", domain["prompt"])
        self.assertIn("没有适用履约责任", domain["prompt"])
        expectations = "\n".join(domain["expectations"])
        self.assertIn("不等待", expectations)
        self.assertNotIn("档案部分也不进入正式建模", expectations)
        self.assertIn("合同级结束确认", "\n".join(cases[4]["expectations"]))

    def test_request_and_confirmation_responsibility_belongs_to_contract_parties(self):
        text = (SKILL / "references/business-analysis.md").read_text()
        self.assertIn("责任人就是所属合同的一方", text)
        self.assertIn("请求责任人：平台方（Platform Party），为合同一方", text)
        self.assertIn("确认责任人：按约定由作者（Author）", text)
        self.assertIn("经办人、上传人和证明提供方", text)
        self.assertIn("不在双方之外另寻凭证责任角色", text)

    def test_scope_review_warns_about_omissions_not_candidate_contracts(self):
        text = (SKILL / "references/responsibility-closure.md").read_text()
        self.assertNotIn("Agent 可以展示候选和遗漏风险", text)
        self.assertIn("责任遗漏", text)
        self.assertIn("不展示供用户筛选的候选合同", text)


if __name__ == "__main__":
    unittest.main()
