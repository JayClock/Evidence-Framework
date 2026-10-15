"""Evidence-tracing resource contracts; not evidence of live-agent performance."""

import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
DISCOVERY = SKILLS / "evidence-discovery"


def edges(text):
    graph = re.search(r"```mermaid\n(.*?)```", text, re.S)
    if graph is None:
        raise AssertionError("Missing interview decision graph")
    return set(re.findall(r"(?m)^\s*(\w+) -->\s*(?:\|([^|]+)\|\s*)?(\w+)", graph[1]))


class EvidenceTraceWorkflowTests(unittest.TestCase):
    def test_judgment_sources_deepening_and_return_form_the_interview_loop(self):
        graph = edges((DISCOVERY / "references/interview.md").read_text())
        expected = {
            ("focus", "", "reuse"),
            ("reuse", "", "judgment"),
            ("judgment", "依据充分", "apply"),
            ("judgment", "仍缺必要依据", "data"),
            ("data", "", "source"),
            ("source", "", "basis"),
            ("basis", "足以解释", "returning"),
            ("basis", "有更深来源", "deepen"),
            ("deepen", "", "source"),
            ("returning", "", "judgment"),
            ("basis", "缺失冲突或循环", "needed"),
            ("needed", "有可问项", "group"),
            ("needed", "受控或无可问项", "handoff"),
            ("group", "", "question"),
            ("question", "", "wait"),
            ("apply", "", "handoff"),
        }
        self.assertLessEqual(expected, graph)
        self.assertFalse(any(start in {"apply", "returning"} and end == "group"
                             for start, _, end in graph))

    def test_control_navigation_and_scope_end_do_not_enter_the_trace_loop(self):
        graph = edges((DISCOVERY / "references/interview.md").read_text())
        self.assertIn(("control", "整轮停止、整轮暂缓或仅补资料", "stop"), graph)
        self.assertIn(("navigation", "", "wait"), graph)
        self.assertIn(("closure", "有效且获授权", "batch"), graph)
        for endpoint in ("stop", "wait", "batch", "handoff"):
            self.assertFalse(any(start == endpoint for start, _, _ in graph), endpoint)

    def test_display_is_a_trace_explanation_not_an_analysis_report(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        display = text.split("### 用追溯解释当前履约判断\n", 1)[1].split("\n## 5.", 1)[0]
        for anchor in ("当前位置：", "责任人：", "合同名称 → 履约项名称 → 请求或确认",
                       "关键数据", "请求依据", "结果证明", "回到", "不表示操作先后"):
            self.assertIn(anchor, display)
        self.assertNotRegex(display, r"(?m)^(?:主焦点|业务目标|并行追溯|当前追溯)：")
        self.assertIn("每题只澄清一个", display)
        self.assertIn("不附资料出处", display)
        self.assertIn("实际主体待明确", display)
        self.assertIn("合同责任方待明确", display)

    def test_runtime_has_one_presentation_without_legacy_templates(self):
        paths = [DISCOVERY / "SKILL.md", DISCOVERY / "references/interview.md",
                 *list((DISCOVERY / "examples").glob("*.md"))]
        retired = re.compile(r"(?m)^(?:主焦点|业务目标|并行追溯|当前追溯)：|### 同一焦点的成组澄清")
        for path in paths:
            with self.subTest(path=path):
                self.assertNotRegex(path.read_text(), retired)
        for name in ("test_current_progress.py", "test_grouped_interview.py",
                     "test_multi_evidence_depth.py", "test_bilingual_interview.py",
                     "test_contract_party_rounds.py"):
            self.assertFalse((Path(__file__).parent / name).exists(), name)

    def test_party_language_and_local_control_are_not_relaxed(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for rule in ("责任人就是所属合同的一方", "共同前提与其他独立问题同轮提出",
                     "一个答案不会改变另一题的前提、对象或问法", "不等待整组答完",
                     "原问题标识", "不因切换凭证重编号", "全局结束确认单独一轮",
                     "任一写入失败就停止", "不推荐未知业务事实作为默认答案"):
            self.assertIn(rule, text)
        method = (SKILLS / "evidence-fm/references/domain-language.md").read_text()
        for rule in ("每次使用", "直接翻译英文", "不扩大写入权限"):
            self.assertIn(rule, method)

    def test_examples_explain_both_proof_sides_and_return_without_claiming_completion(self):
        text = (DISCOVERY / "examples/tracing.md").read_text()
        self.assertIn("合成", text)
        self.assertIn("商品交付（Goods Delivery）", text)
        self.assertIn("外观等级（Appearance Grade）", text)
        self.assertIn("请求依据", text)
        self.assertIn("结果证明", text)
        self.assertIn("不表示操作先后", text)
        displays = re.findall(r"```text\n(.*?)```", text, re.S)
        self.assertTrue(displays)
        for display in displays:
            with self.subTest(display=display[:70]):
                self.assertIn("当前位置：", display)
                self.assertIn("责任人：", display)
                self.assertNotRegex(display, r"(?m)^(?:主焦点|业务目标|并行追溯|当前追溯|已明确|尚缺依据)：")
                self.assertNotRegex(display, r"https?://|资料来源：")
                for question in re.findall(r"(?m)^Q\d+：(.+)$", display):
                    self.assertEqual(1, question.count("？"), question)
        for boundary in ("部分回答", "更正", "暂缓", "回到", "不表示履约完成"):
            self.assertIn(boundary, text)

    def test_teaching_materials_are_synthetic_without_identifiers_or_business_source_links(self):
        paths = list((DISCOVERY / "examples").glob("*.md"))
        identifiers = re.compile(
            r"https?://|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|/(?:Users|home)/|\.evidence/"
            r"|(?<!\d)1[3-9]\d{9}(?!\d)|(?<!\d)\d{17}[\dXx](?!\d)"
        )
        for path in paths:
            with self.subTest(path=path):
                text = path.read_text()
                self.assertIn("合成", text)
                self.assertNotRegex(text, identifiers)
        self.assertIn("脱敏", (DISCOVERY / "examples/README.md").read_text())

    def test_project_entrypoints_preserve_evidence_tracing(self):
        for path in (REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md",
                     DISCOVERY / "SKILL.md", SKILLS / "evidence-modeling/references/workflow.md"):
            self.assertIn("凭证追溯", path.read_text(), path)


if __name__ == "__main__":
    unittest.main()
