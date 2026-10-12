"""Identification guidance and anonymized eval contracts, not agent behavior proof."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
DISCOVERY_EVALS = SKILLS / "evidence-discovery/evals"


class ContractIdentificationTests(unittest.TestCase):
    def test_operating_basis_precedes_agreement_and_skeleton(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        flow = "现金权责／目标—实际约束及来源 → 识别合同上下文与双方 → 全部主履约清单"
        self.assertIn(flow, method)
        self.assertLess(
            method.index("### 合同上下文的识别依据"),
            method.index("## 2. 合同：确定约定边界"),
        )
        for phrase in (
            "经营依据", "交换责任", "约定来源", "边界理由",
            "不能仅凭协议名称", "代收或托管的商品货款",
            "不是 Contract 的两种 Schema 类型", "金额或费率尚未明确",
            "不自动判为领域或工具", "不以未查到现金或 KPI 为由删除",
        ):
            self.assertIn(phrase, method)
        exit_condition = method.split("**退出条件**：", 1)[1].split("\n", 1)[0]
        self.assertIn("经营依据", exit_condition)
        self.assertIn("边界理由", exit_condition)

    def test_identification_is_a_material_based_result_not_a_candidate_vote(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        for phrase in (
            "依据材料直接识别合同上下文", "不进入合同总览",
            "不要求用户确认合同是否存在", "不再泛问交易如何成立",
            "参数缺口不阻塞合同识别", "不删除已知责任",
        ):
            self.assertIn(phrase, method)
        self.assertNotIn("候选约定与双方", method)
        self.assertNotIn("候选上下文的识别依据", method)

    def test_entrypoints_route_operating_identification_to_fm(self):
        for name in ("evidence-fm", "evidence-discovery"):
            with self.subTest(skill=name):
                text = (SKILLS / name / "SKILL.md").read_text()
                self.assertIn("经营依据", text)
                self.assertIn("business-analysis.md", text)
        composition = (SKILLS / "evidence-modeling/SKILL.md").read_text()
        self.assertIn("evidence-fm", composition)
        self.assertIn("evidence-discovery", composition)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("evidence-fm/references/business-analysis.md", guide)
        self.assertIn("经营依据", guide)

    def test_agreement_understanding_explains_business_basis(self):
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        for phrase in ("现金权责", "目标与实际", "观察主体", "独立边界", "具体目的", "双方"):
            self.assertIn(phrase, interview)
        self.assertIn("经营依据或独立边界不足的线索保持待查", interview)
        self.assertIn("参数与证明缺口归对应合同", interview)

    def test_formal_mapping_rechecks_identification_without_new_contract_kinds(self):
        for filename in ("semantics.md", "input-review.md", "batch-assessment.md"):
            with self.subTest(reference=filename):
                text = (SKILLS / "evidence-fm/references" / filename).read_text()
                self.assertIn("经营依据", text)
                self.assertIn("business-analysis.md", text)
        semantics = (SKILLS / "evidence-fm/references/semantics.md").read_text()
        self.assertIn("不新增金额型或 KPI 型", semantics)
        patterns = (SKILLS / "evidence-fm/references/business-pattern-extraction.md").read_text()
        self.assertNotIn("从收入、支出、KPI、合规或风险链", patterns)
        self.assertIn("不是另一个合同识别入口", patterns)

    def test_behavior_cases_cover_identification_and_counterexamples(self):
        document = json.loads((DISCOVERY_EVALS / "evals.json").read_text())
        cases = document["evals"]
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        indexed = {case["category"]: case for case in cases}
        categories = (
            "operating-basis-marketplace", "target-actual-without-cash",
            "agreement-name-without-operating-basis", "non-cash-duty-in-cash-contract",
            "unknown-fee-retains-context", "custody-not-platform-revenue",
        )
        for category in categories:
            with self.subTest(category=category):
                case = indexed[category]
                self.assertIn("evidence-fm", case["knowledgeSkills"])
                self.assertGreaterEqual(len(case["expectations"]), 4)
                self.assertIn("只聊", case["prompt"])
        marketplace = indexed["operating-basis-marketplace"]
        self.assertEqual(
            ["fixtures/anonymized-marketplace-agreement.md"], marketplace["files"]
        )
        for case in cases:
            for relative_path in case.get("files", []):
                path = DISCOVERY_EVALS / relative_path
                self.assertTrue(path.is_file(), relative_path)
                self.assertTrue(path.resolve().is_relative_to(DISCOVERY_EVALS.resolve()))

    def test_anonymized_fixture_preserves_rules_without_identifiers_or_answers(self):
        fixture = DISCOVERY_EVALS / "fixtures/anonymized-marketplace-agreement.md"
        text = fixture.read_text()
        for phrase in (
            "脱敏节选", "不是完整协议", "平台运营方", "卖方服务费",
            "交易金额的一定比例", "商品货款", "第三方支付机构",
            "不是商品买卖的一方", "实名认证", "SaaS",
            "未提供", "并非质量或履行能力保证",
        ):
            self.assertIn(phrase, text)
        for identifier in (
            r"https?://|www\.",
            r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}",
            r"\b(?:1[3-9]\d{9}|0\d{2,3}[- ]?\d{7,8})\b",
            r"\d{4}年\d{1,2}月|\d{4}-\d{2}-\d{2}",
            r"有限公司|股份公司|注册地址|办公地址",
        ):
            self.assertIsNone(re.search(identifier, text), identifier)
        self.assertNotIn("期望输出", text)
        self.assertNotIn("应识别为", text)
        for section in range(1, 8):
            self.assertIn(f"A-{section:03}", text)

    def test_eval_instructions_separate_static_and_behavior_evidence(self):
        instructions = (DISCOVERY_EVALS / "README.md").read_text()
        self.assertIn("35 至 40", instructions)
        self.assertIn("脱敏", instructions)
        self.assertIn("files", instructions)
        self.assertIn("没有实际执行就保持未执行", instructions)
        self.assertIn("不是完整协议", instructions)


if __name__ == "__main__":
    unittest.main()
