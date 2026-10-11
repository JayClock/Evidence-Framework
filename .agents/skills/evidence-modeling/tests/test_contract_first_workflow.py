"""Contract-first workflow and discovery-record contracts, not agent behavior proof."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class ContractFirstWorkflowTests(unittest.TestCase):
    def test_business_method_orders_agreement_skeleton_trace_and_exceptions(self):
        text = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        headings = (
            "## 2. 合同：确定约定边界",
            "## 3. 履约：先画请求—确认骨架",
            "## 4. 凭证：沿骨架追溯关键数据",
            "## 5. 异常：对新义务重复同一循环",
        )
        positions = [text.index(heading) for heading in headings]
        self.assertEqual(sorted(positions), positions)
        for phrase in (
            "属性、关联、履约项与结果凭证",
            "不是通用合同字段表",
            "骨架存在不等于完成证明已经查清",
            "引用不自动表示先后",
            "不要求每项履约都有固定的中间单据",
            "不是逐项问卷",
        ):
            self.assertIn(phrase, text)

    def test_discovery_record_has_one_indexed_business_structure(self):
        document = json.loads(
            (SKILLS / "evidence-discovery/assets/discovery-template.json").read_text()
        )
        self.assertEqual("2.0", document["schemaVersion"])
        self.assertNotIn("businessSlice", document)
        business = document["business"]
        for key in (
            "agreements", "responsibilities", "evidenceTraces", "walkthroughs",
            "participants", "variations", "domainObjects", "negotiations",
        ):
            entries = business[key]
            self.assertIsInstance(entries, list, key)
            self.assertTrue(entries, key)
            for entry in entries:
                self.assertIn("id", entry, key)
                self.assertIsInstance(entry["sourceRefs"], list, key)
        self.assertIn("focusRef", document["handoff"])
        self.assertIn("viewRefs", document["handoff"])
        self.assertIn("request", business["responsibilities"][0])
        self.assertIn("confirmation", business["responsibilities"][0])
        self.assertIn("traceRefs", business["responsibilities"][0])
        self.assertIn("exceptions", business["responsibilities"][0])
        self.assertIn("agreedData", business["agreements"][0])
        self.assertIn("agreementRef", business["responsibilities"][0])
        self.assertIn("anchorRef", business["evidenceTraces"][0])
        for retired in (
            "businessView", "evidenceStructure", "requestEvidence",
            "confirmationEvidence", "responsibilityChains", "keyDataTrace",
            "variationAndBoundary",
        ):
            self.assertNotIn(f'"{retired}"', json.dumps(document), retired)
        closure = business["responsibilityClosure"]
        self.assertIn("id", closure["terminalDecisions"][0])
        self.assertIn("humanSourceRefs", closure["terminalDecisions"][0])
        self.assertIn(
            "terminalDecisionRef", business["responsibilities"][0]["exceptions"][0]
        )
        self.assertIn("completionSourceRefs", closure)
        self.assertNotIn("status", closure)
        self.assertNotIn("approved", closure)

    def test_handoff_uses_references_and_does_not_implicitly_convert_records(self):
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        for text in (interview, workflow):
            self.assertIn("schemaVersion", text)
            self.assertIn("不自动迁移", text)
            self.assertIn("focusRef", text)
            self.assertIn("不是正式 FM", text)
        self.assertIn("当前问题只保存问题 ID", interview)
        self.assertIn("视图从记录引用生成", interview)
        self.assertIn("原话与来源", interview)
        self.assertIn("任一写入失败就停止", interview)

    def test_behavior_cases_cover_contract_data_skeleton_and_branch_reuse(self):
        document = json.loads(
            (SKILLS / "evidence-discovery/evals/evals.json").read_text()
        )
        indexed = {case["category"]: case for case in document["evals"]}
        for category in (
            "agreement-initial-data", "skeleton-before-evidence-trace",
            "exception-reuses-skeleton-trace", "multi-agreement-reference-resume",
            "record-version-boundary",
        ):
            case = indexed[category]
            self.assertIn("evidence-fm", case["knowledgeSkills"])
            self.assertGreaterEqual(len(case["expectations"]), 4)
        prompt = indexed["skeleton-before-evidence-trace"]["prompt"]
        self.assertIn("完成证明", prompt)
        self.assertIn("不要", prompt)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("请求—确认骨架", guide)
        self.assertIn("business.responsibilityClosure", guide)


if __name__ == "__main__":
    unittest.main()
