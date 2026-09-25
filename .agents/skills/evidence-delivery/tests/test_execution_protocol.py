"""Static execution contracts; not a substitute for isolated agent evaluations."""

import json
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


class ExecutionProtocolTests(unittest.TestCase):
    def document(self, name):
        return (SKILL / "references" / name).read_text(encoding="utf-8")

    def test_implementation_has_independent_oracle_and_one_behavior_loop(self):
        text = self.document("implementation.md")
        for phrase in (
            "公开行为入口", "独立预期", "失败后不变性", "实际运行",
            "启动失败不是业务红灯", "已有行为验证", "不伪造红灯", "普通实现与回归",
            "一次一个行为", "observedEvidence",
        ):
            self.assertIn(phrase, text)
        self.assertLess(text.index("1. **红**"), text.index("2. **绿**"))
        self.assertLess(text.index("2. **绿**"), text.index("3. **整理**"))
        self.assertIn("持久化测试可检查 SQL", text)
        self.assertIn("预期值来自规则、验收、已核实案例或独立计算", text)

    def test_diagnosis_gates_fix_on_symptom_and_falsifiable_evidence(self):
        text = self.document("diagnosis.md")
        headings = (
            "## 1. 建立症状信号", "## 2. 缩小案例",
            "## 3. 验证假设", "## 4. 修复并复验",
        )
        positions = [text.index(heading) for heading in headings]
        self.assertEqual(sorted(positions), positions)
        self.assertEqual(4, text.count("**退出条件**"))
        for phrase in (
            "已经实际运行", "具体症状", "环境失败", "停止猜修", "如何证伪",
            "只改变一个变量", "未缩小的原始场景", "样本量",
            "脱敏", "不保存认证头", "只读请求", "用户已有材料只交接",
        ):
            self.assertIn(phrase, text)

    def test_review_keeps_axes_and_uncommitted_changes_visible(self):
        text = self.document("review.md")
        for phrase in (
            "## Standards", "## Spec", "未跟踪文件", "已暂存", "未提交",
            "用户已有改动", "独立依据", "范围扩张", "未验证",
            "只读审查仅报告", "不增加独立批准字段",
        ):
            self.assertIn(phrase, text)
        self.assertIn("不能合并成一个总分", text)
        self.assertIn("两个维度均满足要求且质量检查实际通过", text)

    def test_only_main_archives_and_review_has_no_self_review_fallback(self):
        lifecycle = self.document("lifecycle.md")
        review = self.document("review.md")
        entry = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        for text in (lifecycle, review, entry):
            self.assertIn("主 Agent", text)
            self.assertIn("独立", text)
            self.assertIn("reviewer", text)
        self.assertIn("内层不写持久任务记录", lifecycle)
        self.assertIn("工具权限直接取自 subagent 定义", lifecycle)
        self.assertIn("evidence_worker", entry)
        self.assertIn("evidence_review", entry)
        self.assertNotIn("没有子 Agent 时分两轮审查", review)
        self.assertNotIn("内层先将有权限保存", lifecycle)
        self.assertIn("不由主 Agent 或 worker 自审代替", review)

    def test_behavior_evals_cover_execution_risks_without_retired_plan_layout(self):
        document = json.loads((SKILL / "evals/evals.json").read_text(encoding="utf-8"))
        cases = document["evals"]
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        names = {case["name"] for case in cases}
        self.assertTrue({
            "symptom-before-fix", "independent-expectation-and-existing-green",
            "standards-and-spec-independent", "flaky-repro-and-evidence-limits",
            "independent-review-and-main-only-archive",
            "reviewer-tools-and-untrusted-worker-claims",
        }.issubset(names))
        for case in cases:
            self.assertTrue(case["prompt"])
            self.assertTrue(case["expected_output"])
            self.assertNotIn("index.md", case["prompt"])
            self.assertNotIn("任务文件", case["prompt"])
        instructions = (SKILL / "evals/README.md").read_text(encoding="utf-8")
        self.assertIn("没有实际执行就保持未执行", instructions)


if __name__ == "__main__":
    unittest.main()
