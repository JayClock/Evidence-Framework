"""One focus with parallel depth-first evidence chains; not a live-agent evaluation."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
DISCOVERY = SKILLS / "evidence-discovery"
FM = SKILLS / "evidence-fm"


class MultiEvidenceDepthTests(unittest.TestCase):
    def test_depth_first_is_per_chain_not_a_global_serial_lock(self):
        method = (FM / "references/provenance.md").read_text()
        for phrase in ("每条来源链深度优先", "多个凭证可以并行追溯", "回到上层判断",
                       "不先扫完同一层", "共同依据只追一次", "循环引用不能自证"):
            self.assertIn(phrase, method)
        interview = (DISCOVERY / "references/interview.md").read_text()
        self.assertIn("一个业务焦点可以并行追溯多个凭证", interview)
        self.assertIn("不要求全局只推进一条链", interview)
        self.assertNotIn("交互节点是一项凭证，不是单个数据项", interview)

    def test_each_active_evidence_has_its_own_position_and_responsibility(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("主焦点", "并行追溯", "各凭证当前位置", "各自责任人",
                       "证明提供方", "合同责任方待明确", "不会自动成为主焦点的责任人"):
            self.assertIn(phrase, text)
        for relative in ("AGENTS.md", "docs/evidence-modeling.md"):
            self.assertIn("多凭证", (REPO / relative).read_text())
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        for phrase in ("主焦点", "各凭证", "回溯位置", "控制意图"):
            self.assertIn(phrase, workflow)

    def test_frontier_control_is_dependency_scoped_and_keeps_one_focus(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("共同前提暂缓", "依赖它的分支", "其他已判独立的分支",
                       "不是展开其全部合同责任", "不因切换凭证重编号", "业务目标变化"):
            self.assertIn(phrase, text)
        self.assertIn("全局结束确认单独一轮", text)
        self.assertIn("任一写入失败就停止", text)
        self.assertIn("不附资料出处", text)

    def test_multi_evidence_example_tracks_depth_and_return_without_global_expansion(self):
        path = DISCOVERY / "examples/tracing.md"
        self.assertTrue(path.is_file())
        text = path.read_text()
        displays = re.findall(r"```text\n(.*?)```", text, re.S)
        self.assertEqual([2, 2, 1, 0], [display.count("？") for display in displays])
        for display in displays:
            self.assertEqual(1, display.count("主焦点："))
            self.assertEqual(1, display.count("当前位置："))
            self.assertIn("退款申请（Refund Application）", display)
            self.assertNotRegex(display, r"已明确：|尚缺依据：|https?://|资料来源：")
        self.assertEqual(3, displays[0].count("责任人："))
        self.assertEqual(3, displays[1].count("责任人："))
        self.assertEqual(3, displays[2].count("责任人："))
        self.assertIn("结算凭证（Settlement Evidence）", displays[2])
        self.assertIn("Q4", displays[2])
        self.assertIn("暂缓", displays[2])
        self.assertIn("回到", displays[3])
        self.assertIn("tracing.md", (DISCOVERY / "examples/README.md").read_text())

    def test_eval_catalog_includes_multi_evidence_depth_and_control_cases(self):
        cases = json.loads((DISCOVERY / "evals/evals.json").read_text())["evals"]
        indexed = {case["category"]: case for case in cases}
        for category in ("multi-evidence-depth-first", "multi-evidence-cycle-and-version"):
            self.assertIn(category, indexed)
            self.assertEqual(["evidence-fm"], indexed[category]["knowledgeSkills"])
            self.assertGreaterEqual(len(indexed[category]["expectations"]), 4)
        boundary = indexed["multi-evidence-depth-first"]
        self.assertIn("共同匹配摘要", boundary["follow_up"][0])
        self.assertIn("暂缓", boundary["follow_up"][1])
        self.assertIn("旧匹配依据不足", boundary["follow_up"][2])
        for risk in ("共同订单前提只问一次", "深入结算凭证", "回溯", "共同前提阻塞",
                     "所属合同一方", "原问题", "整轮停止"):
            content = "\n".join(boundary["expectations"] + boundary["follow_up"])
            self.assertIn(risk, content)
        self.assertEqual(len(cases), len({case["id"] for case in cases}))


if __name__ == "__main__":
    unittest.main()
