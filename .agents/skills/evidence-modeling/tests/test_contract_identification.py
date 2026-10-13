"""Agreement discovery contracts and eval coverage, not live interview evidence."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
DISCOVERY_EVALS = SKILLS / "evidence-discovery/evals"


class ContractIdentificationTests(unittest.TestCase):
    def test_discovery_starts_with_agreement_and_responsible_parties(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        flow = "理解实际经营过程 → 寻找实际约定，明确责任双方 → 列出主要履约，检验约定理解"
        self.assertIn(flow, method)
        self.assertLess(method.index("## 1. 理解实际经营过程"),
                        method.index("## 2. 寻找合同，明确参与方"))
        self.assertLess(method.index("## 2. 寻找合同，明确参与方"),
                        method.index("## 3. 履约"))
        for phrase in ("已有约定、双方及责任明确时直接进入",
                       "现金权责和目标—实际是发现线索", "不要求先说明单独收费或 KPI",
                       "不能仅凭协议名称", "实际主体已明确就复用",
                       "经办人不自动成为合同责任方", "不表示法律效力裁决"):
            self.assertIn(phrase, method)

    def test_contract_discovery_is_incremental_without_losing_obligations(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        for phrase in ("不必先找齐全局所有合同", "当前合同的已知主履约清单",
                       "沿履约和凭证增量发现", "第三方出现不自动产生新合同",
                       "不因划入领域而删除合同责任", "金额或费率尚未明确",
                       "全部主履约及各层异常仍须在正式编辑前核对完整"):
            self.assertIn(phrase, method)
        entry = method.split("**进入履约分析的条件**：", 1)[1].split("\n", 1)[0]
        self.assertIn("约定", entry)
        self.assertIn("双方", entry)
        self.assertIn("责任", entry)

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
        for filename in ("semantics.md", "input-review.md", "batch-assessment.md"):
            with self.subTest(reference=filename):
                text = (SKILLS / "evidence-fm/references" / filename).read_text()
                self.assertIn("约定与责任双方", text)
                self.assertIn("business-analysis.md", text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("约定与责任双方", guide)
        self.assertIn("evidence-fm/references/business-analysis.md", guide)

    def test_discovery_does_not_embed_attribution_or_operating_labels(self):
        paths = [REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md"]
        for name in ("evidence-fm", "evidence-discovery", "evidence-modeling", "evidence-handoff"):
            paths.extend((SKILLS / name).glob("SKILL.md"))
            paths.extend((SKILLS / name / "references").glob("*.md"))
            paths.extend((SKILLS / name / "examples").glob("*.md"))
        for path in paths:
            with self.subTest(path=str(path)):
                text = path.read_text()
                self.assertNotRegex(text, r"经营依据|经营主线|分类验证|如何落地业务建模|极客时间|徐昊")

    def test_behavior_cases_cover_direct_entry_parties_and_incremental_discovery(self):
        cases = json.loads((DISCOVERY_EVALS / "evals.json").read_text())["evals"]
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        indexed = {case["category"]: case for case in cases}
        for category in (
            "agreement-direct-entry", "agreement-title-insufficient",
            "performance-agreement-role-direction", "incremental-support-contract",
            "agreement-parties-versus-representatives", "single-entry-then-overview",
            "agreement-proof-fallback",
        ):
            with self.subTest(category=category):
                case = indexed[category]
                self.assertIn("evidence-fm", case["knowledgeSkills"])
                self.assertGreaterEqual(len(case["expectations"]), 4)
                self.assertIn("只聊", case["prompt"])
                self.assertTrue(case["follow_up"])
        incremental = "\n".join(indexed["incremental-support-contract"]["expectations"])
        self.assertIn("不自动切换", incremental)
        self.assertIn("第三方", incremental)
        identity = "\n".join(indexed["agreement-parties-versus-representatives"]["expectations"])
        self.assertIn("经办人", identity)
        self.assertIn("证明提供方", identity)
        for case in cases:
            for relative_path in case.get("files", []):
                path = DISCOVERY_EVALS / relative_path
                self.assertTrue(path.is_file(), relative_path)
                self.assertTrue(path.resolve().is_relative_to(DISCOVERY_EVALS.resolve()))

    def test_evals_distinguish_static_checks_from_actual_interviews(self):
        instructions = (DISCOVERY_EVALS / "README.md").read_text()
        self.assertIn("91—97", instructions)
        self.assertIn("独立风险", instructions)
        self.assertIn("没有实际执行就保持未执行", instructions)
        self.assertIn("files", instructions)


if __name__ == "__main__":
    unittest.main()
