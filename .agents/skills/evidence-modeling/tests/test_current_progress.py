"""Current-progress display contracts; not proof of live agent interview behavior."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class CurrentProgressTests(unittest.TestCase):
    def test_daily_interview_has_one_focused_display_contract(self):
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        display = interview.split("## 4. 只展示当前进度", 1)[1].split("## 5.", 1)[0]
        for phrase in (
            "合同名称 → 履约项名称 → 请求或确认",
            "当前位置：", "已明确：", "正在澄清：",
            "一个仍影响当前判断的业务问题", "不代替业务位置",
            "不要展开其他合同", "全局责任图", "整体准入提醒",
            "不在回答末尾附方法文章、作者、章节或参考链接",
            "来源与版本继续保存在发现记录", "无 UI", "同一份当前进度",
            "不编造合同或履约", "不套履约链", "不携带前一个节点",
        ):
            self.assertIn(phrase, display)
        for field in ("position", "known", "prompt", "questionId", "gapKey"):
            self.assertIn(f"`{field}`", display)
        self.assertIn("没有必要问题时交接当前结果", display)

    def test_focused_position_is_a_reference_not_another_business_copy(self):
        document = json.loads((SKILLS / "evidence-discovery/assets/discovery-template.json").read_text())
        handoff = document["handoff"]
        self.assertIn("请求或确认", handoff["businessPosition"])
        self.assertIn("request 或 confirmation", handoff["focusPoint"])
        self.assertIn("focusRef", handoff["focusPoint"])
        self.assertIn("非履约省略", handoff["focusPoint"])
        self.assertIn("不展开全局", handoff["viewRefs"][0])
        self.assertNotIn("known", handoff)
        self.assertNotIn("progressState", document)
        self.assertIn("sources", document)
        self.assertIn("request", document["business"]["responsibilities"][0])
        self.assertIn("confirmation", document["business"]["responsibilities"][0])
        self.assertIn("completionSourceRefs", document["business"]["responsibilityClosure"])

    def test_no_method_still_requires_global_display_each_round(self):
        paths = (
            "evidence-discovery/SKILL.md",
            "evidence-discovery/references/interview.md",
            "evidence-fm/references/business-analysis.md",
            "evidence-fm/references/responsibility-closure.md",
        )
        for relative in paths:
            text = (SKILLS / relative).read_text()
            with self.subTest(path=relative):
                for retired in (
                    "显示全局覆盖、当前焦点",
                    "显示全局覆盖、当前分支",
                    "每轮展示本范围主履约清单",
                    "同时展示全部主履约",
                    "## 4. 展示全局与当前焦点",
                ):
                    self.assertNotIn(retired, text)
                self.assertIn("当前", text)
        closure = (SKILLS / "evidence-fm/references/responsibility-closure.md").read_text()
        self.assertIn("在发现记录中完整维护", closure)
        self.assertIn("人类明确确认全部追责结束", closure)
        self.assertIn("不能自行缩小", closure)

    def test_project_guidance_and_recovery_use_the_focused_position(self):
        for relative in ("AGENTS.md", "docs/evidence-modeling.md", ".pi/extensions/evidence-modeling/README.md"):
            text = (REPO / relative).read_text()
            with self.subTest(path=relative):
                self.assertIn("请求或确认", text)
                self.assertIn("当前", text)
                self.assertIn("准入提醒", text)
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        for text in (workflow, interview):
            self.assertIn("focusRef", text)
            self.assertIn("focusPoint", text)
            self.assertIn("原问题", text)
            self.assertIn("不自动迁移", text)

    def test_behavior_cases_cover_focused_progress_and_independent_record_coverage(self):
        document = json.loads((SKILLS / "evidence-discovery/evals/evals.json").read_text())
        indexed = {case["category"]: case for case in document["evals"]}
        for category in (
            "current-only-progress", "request-confirmation-progress-resume",
            "progress-without-fictitious-position", "focused-exception-progress",
        ):
            case = indexed[category]
            self.assertIn("evidence-fm", case["knowledgeSkills"])
            self.assertGreaterEqual(len(case["expectations"]), 4)
        current = indexed["current-only-progress"]
        self.assertIn("Q-001", current["prompt"])
        self.assertIn("采购记录和Q-001继续保留", "\n".join(current["expectations"]))
        self.assertIn("follow_up", indexed["request-confirmation-progress-resume"])
        instructions = (SKILLS / "evidence-discovery/evals/README.md").read_text()
        self.assertIn("41 至 44", instructions)
        self.assertIn("没有实际执行就保持未执行", instructions)


if __name__ == "__main__":
    unittest.main()
