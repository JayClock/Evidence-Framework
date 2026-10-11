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
        flow = "现金权责／目标—实际约束及来源 → 候选约定与双方 → 全部主履约清单"
        self.assertIn(flow, method)
        self.assertLess(
            method.index("### 候选上下文的识别依据"),
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

    def test_entrypoints_route_operating_identification_to_fm(self):
        for name in ("evidence-fm", "evidence-discovery", "evidence-modeling"):
            with self.subTest(skill=name):
                text = (SKILLS / name / "SKILL.md").read_text()
                self.assertIn("经营依据", text)
                self.assertIn("business-analysis.md", text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("现金权责／目标—实际约束及来源", guide)

    def test_each_agreement_records_basis_without_implicit_migration(self):
        template = json.loads(
            (SKILLS / "evidence-discovery/assets/discovery-template.json").read_text()
        )
        self.assertEqual("2.0", template["schemaVersion"])
        business = template["business"]
        self.assertIn("约定记录", business["operatingBasis"])
        basis = business["agreements"][0]["operatingBasis"]
        for phrase in ("现金权责", "目标—实际", "来源", "边界理由", "未知"):
            self.assertIn(phrase, basis)
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        self.assertIn("agreements[].operatingBasis", interview)
        self.assertIn("可选说明", interview)
        self.assertIn("不自动补写", interview)
        self.assertIn("不自动迁移", interview)

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
            "unknown-fee-retains-candidate", "custody-not-platform-revenue",
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
