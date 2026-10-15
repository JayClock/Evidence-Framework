"""Cash/performance discovery contracts, not live interview evidence."""

import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class ContractIdentificationTests(unittest.TestCase):
    def test_discovery_starts_with_cash_and_performance_then_agreement(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        for step in ("以现金权责、目标—实际对比发现业务", "寻找实际约定，明确责任双方",
                     "找到双方主要请求—确认交互 → 配对后包裹为履约项 → 凭证追溯"):
            self.assertIn(step, method)
        self.assertLess(method.index("## 1. 理解实际经营过程"),
                        method.index("## 2. 寻找合同，明确参与方"))
        self.assertLess(method.index("## 2. 寻找合同，明确参与方"),
                        method.index("## 3. 请求—确认"))
        for phrase in ("现金权责与目标—实际对比是发现业务的核心逻辑",
                       "现金收入对应承担的义务", "现金支出对应取得的权利",
                       "没有现金往来时", "凭证必须围绕现金往来或 KPI",
                       "不是先等实际结果出现偏差", "不要求每项履约单独收费",
                       "不能仅凭协议名称", "实际主体已明确就复用",
                       "经办人不自动成为合同责任方", "不表示法律效力裁决"):
            self.assertIn(phrase, method)

    def test_contract_discovery_is_incremental_without_losing_obligations(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        for phrase in ("不必先找齐全局所有合同", "当前合同的已知主履约清单",
                       "沿履约和凭证增量发现", "第三方出现不自动产生新合同",
                       "不因划入领域而删除合同责任", "金额或费率尚未明确",
                       "全部主履约及各层异常须在范围结束及下游交付前核对完整"):
            self.assertIn(phrase, method)
        entry = method.split("**进入履约分析的条件**：", 1)[1].split("\n", 1)[0]
        self.assertIn("约定", entry)
        self.assertIn("双方", entry)
        self.assertIn("责任", entry)
        self.assertIn("现金权责或目标—实际对比", entry)

    def test_responsible_party_identity_is_not_deferred_to_walkthrough(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        parties = method.split("## 2. 寻找合同，明确参与方", 1)[1].split("## 3.", 1)[0]
        for phrase in ("个人或组织", "代表办理人", "证明提供方", "权利方和义务方"):
            self.assertIn(phrase, parties)
        self.assertIn("合同入口即明确责任双方", method)
        self.assertIn("不以单据推演完成为前提", method)

    def test_entrypoints_and_mapping_share_agreement_discovery(self):
        for name in ("evidence-fm", "evidence-discovery"):
            with self.subTest(skill=name):
                text = (SKILLS / name / "SKILL.md").read_text()
                self.assertIn("约定与责任双方", text)
                self.assertIn("business-analysis.md", text)
        for filename in ("input-review.md", "batch-assessment.md"):
            with self.subTest(reference=filename):
                text = (SKILLS / "evidence-fm/references" / filename).read_text()
                self.assertIn("约定", text)
                self.assertIn("责任双方", text)
                self.assertIn("business-analysis.md", text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("约定与责任双方", guide)
        self.assertIn("evidence-fm/references/business-analysis.md", guide)

    def test_entrypoints_preserve_core_discovery_instead_of_optional_clues(self):
        paths = [REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md",
                 SKILLS / "evidence-fm/SKILL.md", SKILLS / "evidence-discovery/SKILL.md",
                 SKILLS / "evidence-fm/references/business-analysis.md",
                 SKILLS / "evidence-discovery/references/interview.md"]
        for path in paths:
            with self.subTest(path=str(path)):
                text = path.read_text()
                self.assertIn("现金权责", text)
                self.assertIn("目标—实际对比", text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("《如何落地业务建模》的四色建模与 8X Flow 为准", guide)

    def test_business_display_omits_attribution_not_operating_responsibilities(self):
        text = (SKILLS / "evidence-discovery/examples/navigation.md").read_text()
        display = text.split("```text", 1)[1].split("```", 1)[0]
        self.assertIn("付款", display)
        self.assertNotRegex(display, r"sourceRefs|https?://|\.md|如何落地业务建模|徐昊|资料来源")


if __name__ == "__main__":
    unittest.main()
