"""Skill-only round contracts; static checks do not measure live agent behavior."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
DISCOVERY = SKILLS / "evidence-discovery"


class GroupedInterviewTests(unittest.TestCase):
    def test_modeling_has_no_repository_plugin_or_plugin_build_wiring(self):
        self.assertFalse((REPO / ".pi/extensions/evidence-modeling").exists())
        package = json.loads((REPO / "package.json").read_text())
        self.assertFalse(any(name.startswith("evidence-modeling:") for name in package["scripts"]))
        for command in package["scripts"].values():
            self.assertNotIn(".pi/extensions", command)
        for dependency in ("@earendil-works/pi-coding-agent", "@earendil-works/pi-server",
                           "@earendil-works/pi-tui", "typebox"):
            self.assertNotIn(dependency, package["devDependencies"])
        for relative in ("AGENTS.md", "README.md", "docs/evidence-modeling.md"):
            text = (REPO / relative).read_text()
            self.assertNotRegex(text, r"/evidence-model(?!ing)|evidence_ui_|\.pi/extensions")

    def test_round_selection_proactively_groups_independent_content(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("依赖前沿", "前置依据已经具备", "同一业务节点",
                       "一个答案不会改变另一题的前提、对象或问法",
                       "共同前提与其他独立问题同轮提出", "每轮重新计算",
                       "不在找到第一题后结束分析", "全部独立必要问题",
                       "用户要求一次一问时只选一题", "等待真人"):
            self.assertIn(phrase, text)
        self.assertNotIn("每轮只问一个核心问题", text)

    def test_partial_answers_corrections_and_controls_are_per_question(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("已答项立即吸收", "未答项不视为默认同意", "不知道仍是未决",
                       "原问题标识", "更正推翻共同前提", "整轮停止",
                       "暂缓指定题", "不建立隐藏状态", "任一写入失败就停止"):
            self.assertIn(phrase, text)
        self.assertIn("没有可问问题不等于全部追责结束", text)
        self.assertIn("不推荐未知业务事实作为默认答案", text)

    def test_navigation_and_global_confirmation_are_not_batched_with_questions(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        self.assertIn("选择轮只收集导航选择", text)
        self.assertIn("全局结束确认单独一轮", text)
        self.assertIn("不与业务问题组混问", text)
        self.assertIn("完整责任图", text)
        self.assertIn("人类明确确认全部追责结束", text)

    def test_grouped_examples_keep_one_position_and_a_number_for_each_question(self):
        path = DISCOVERY / "examples/tracing.md"
        self.assertTrue(path.is_file())
        text = path.read_text()
        self.assertIn("合成", text)
        displays = re.findall(r"```text\n(.*?)```", text, re.S)
        self.assertEqual([2, 2, 1, 0], [display.count("？") for display in displays])
        for display in displays:
            self.assertEqual(1, display.count("当前位置："))
            self.assertNotRegex(display, r"已明确：|尚缺依据：|https?://")
        self.assertEqual(["Q1", "Q2"], re.findall(r"(?m)^(Q\d+)：", displays[0]))
        self.assertEqual(["Q3", "Q4"], re.findall(r"(?m)^(Q\d+)：", displays[1]))
        for phrase in ("部分回答", "共同依据", "重算", "一次一问", "原问题 Q2"):
            self.assertIn(phrase, text)
        controls = (DISCOVERY / "examples/control-and-recovery.md").read_text()
        for phrase in ("暂缓", "停止", "保存失败", "原标识"):
            self.assertIn(phrase, controls)
        self.assertIn("tracing.md", (DISCOVERY / "examples/README.md").read_text())

    def test_behavior_catalog_covers_round_selection_and_failure_boundaries(self):
        cases = json.loads((DISCOVERY / "evals/evals.json").read_text())["evals"]
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        indexed = {case["category"]: case for case in cases}
        for category in ("grouped-independent-frontier", "language-write-failure",
                         "grouped-not-global-closure"):
            case = indexed[category]
            self.assertEqual(["evidence-fm"], case["knowledgeSkills"])
            self.assertGreaterEqual(len(case["expectations"]), 4)
        mainline = indexed["grouped-independent-frontier"]
        self.assertIn("只答版本题", mainline["follow_up"][0])
        self.assertIn("更正", mainline["follow_up"][1])
        self.assertIn("一次只问一个问题", mainline["follow_up"][2])
        for risk in ("部分回答", "独立性失效", "整轮串行", "一次一问", "明确解除"):
            self.assertTrue(any(risk in item for item in mainline["expectations"]), risk)
        failure = indexed["language-write-failure"]
        self.assertIn("问题组", failure["prompt"])
        self.assertTrue(any("实际拒绝" in item for item in failure["setup"]))
        self.assertTrue(any("独立可问题" in item for item in failure["expectations"]))
        instructions = (DISCOVERY / "evals/README.md").read_text()
        self.assertIn("依赖前沿", instructions)
        self.assertIn("没有实际执行就保持未执行", instructions)


if __name__ == "__main__":
    unittest.main()
