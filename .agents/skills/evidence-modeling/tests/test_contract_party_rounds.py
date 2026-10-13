"""Contract-party responsibility and proactive grouping; not live-agent evidence."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
DISCOVERY = SKILLS / "evidence-discovery"
FM = SKILLS / "evidence-fm"


class ContractPartyRoundTests(unittest.TestCase):
    def test_responsibility_is_a_party_to_the_evidences_own_contract(self):
        for path in (DISCOVERY / "references/interview.md",
                     FM / "references/business-analysis.md",
                     FM / "references/provenance.md"):
            text = path.read_text()
            with self.subTest(path=path.name):
                self.assertIn("责任人就是所属合同的一方", text)
                self.assertIn("合同责任方", text)
                self.assertIn("经办人", text)
                self.assertIn("证明提供方", text)
        text = (DISCOVERY / "references/interview.md").read_text()
        self.assertIn("合同责任方待明确", text)
        self.assertIn("实际主体待明确", text)
        self.assertIn("支撑凭证所属合同", text)

    def test_every_round_searches_for_all_independent_content_before_single_question(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("每轮主动寻找可以同时澄清的内容", "全部独立必要问题",
                       "共同前提与其他独立问题同轮提出", "不因局部依赖不明而整轮逐问",
                       "确实只有一个可问项", "用户要求一次一问"):
            self.assertIn(phrase, text)
        for path in (DISCOVERY / "SKILL.md", FM / "references/provenance.md",
                     REPO / "docs/evidence-modeling.md"):
            with self.subTest(path=path.name):
                self.assertIn("主动寻找", path.read_text())

    def test_retired_rules_are_absent_from_runtime_guidance(self):
        paths = [REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md"]
        for name in ("evidence-discovery", "evidence-fm", "evidence-modeling", "evidence-handoff"):
            root = SKILLS / name
            paths.append(root / "SKILL.md")
            paths.extend((root / "references").glob("*.md"))
            paths.extend((root / "assets").glob("*.md"))
        retired = ("不能从合同一方", "依赖关系不确定时退回逐问",
                   "依赖不明或用户要求一次一问时逐问",
                   "依赖关系不确定或用户要求逐问时只问一题",
                   "问题依赖另一未知或独立性不明")
        for path in paths:
            text = path.read_text()
            for phrase in retired:
                with self.subTest(path=str(path), phrase=phrase):
                    self.assertNotIn(phrase, text)

    def test_mixed_dependency_examples_ask_shared_basis_and_independent_proof_together(self):
        text = (DISCOVERY / "examples/tracing.md").read_text()
        displays = re.findall(r"```text\n(.*?)```", text, re.S)
        self.assertGreaterEqual(len(displays), 1)
        self.assertEqual(["Q1", "Q2"], re.findall(r"(?m)^(Q\d+)：", displays[0]))
        for party in ("读者（Reader）", "平台方（Platform Party）", "支付机构（Payment Institution）"):
            self.assertIn(f"责任人：{party}", displays[0])
        self.assertIn("双方认可", displays[0])
        self.assertIn("履约确认", displays[0])
        self.assertIn("实付金额（Paid Amount）", displays[0])

    def test_behavior_cases_guard_against_partial_dependency_becoming_serial_round(self):
        cases = json.loads((DISCOVERY / "evals/evals.json").read_text())["evals"]
        indexed = {case["category"]: case for case in cases}
        case = indexed["grouped-independent-frontier"]
        self.assertIn("独立", case["prompt"])
        self.assertTrue(any("同轮" in item for item in case["expectations"]))
        self.assertTrue(any("局部依赖整轮串行" in item for item in case["expectations"]))
        self.assertTrue(any("请求与确认责任人为所属合同一方" in item for item in case["expectations"]))
        owner = indexed["multi-evidence-depth-first"]
        self.assertTrue(any("所属合同一方" in item for item in owner["expectations"]))

    def test_clear_business_meanings_are_translated_without_waiting_for_english(self):
        method = (FM / "references/domain-language.md").read_text()
        for phrase in ("直接翻译英文", "不等待人类", "业务含义", "已有规范映射",
                       "不扩大写入权限", "不自动创建词汇表"):
            self.assertIn(phrase, method)
        for path in (FM / "references/domain-language.md", FM / "references/format.md",
                     FM / "examples/domain-language.md", DISCOVERY / "references/interview.md",
                     REPO / "docs/guides/index.md"):
            text = path.read_text()
            with self.subTest(path=path.name):
                self.assertNotIn("英文名待明确", text)
                self.assertNotIn("英文未明确不猜译", text)
        catalog = json.loads((FM / "evals/domain-language.json").read_text())
        self.assertTrue(any(case["category"] == "direct-business-name-translation"
                            for case in catalog["evals"]))

    def test_cases_use_a_continuous_mainline_instead_of_per_rule_variants(self):
        cases = json.loads((DISCOVERY / "evals/evals.json").read_text())["evals"]
        indexed = {case["category"]: case for case in cases}
        retired = {"grouped-dependent-questions", "grouped-premise-correction",
                   "grouped-single-question-preference", "parallel-mixed-dependencies",
                   "bilingual-direct-translation", "multi-evidence-shared-basis",
                   "multi-evidence-local-control", "multi-evidence-owner-boundary",
                   "delivery-contract-party-grouping"}
        self.assertFalse(retired & indexed.keys())
        for category in ("grouped-independent-frontier", "multi-evidence-depth-first"):
            self.assertGreaterEqual(len(indexed[category]["follow_up"]), 4)
        self.assertIn("multi-evidence-cycle-and-version", indexed)
        self.assertIn("grouped-not-global-closure", indexed)
        self.assertIn("language-write-failure", indexed)
        example = (DISCOVERY / "examples/tracing.md").read_text()
        self.assertEqual(["连续主案例"], re.findall(r"(?m)^## (.+)$", example))

    def test_handoff_preserves_contract_parties_and_the_next_question_group(self):
        handoff = (SKILLS / "evidence-handoff/SKILL.md").read_text()
        template = (SKILLS / "evidence-modeling/assets/handoff-template.md").read_text()
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        for text in (handoff, template, workflow):
            self.assertIn("合同责任方", text)
            self.assertIn("可同时澄清", text)


if __name__ == "__main__":
    unittest.main()
