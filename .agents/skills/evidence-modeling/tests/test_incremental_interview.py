"""Static loading contracts; real multi-turn behavior is evaluated separately."""

import json
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
SKILLS = REPO / ".agents/skills"


def read(relative_path: str) -> str:
    return (REPO / relative_path).read_text(encoding="utf-8")


class IncrementalInterviewTests(unittest.TestCase):
    def section(self, text: str, heading: str) -> str:
        match = re.search(
            rf"(?ms)^{re.escape(heading)}\n(.*?)(?=^#{{1,3}} |\Z)", text
        )
        if match is None:
            self.fail(f"Missing section: {heading}")
        return match.group(1)

    def interview(self) -> str:
        return read(".agents/skills/evidence-discovery/references/interview.md")

    def test_repository_entry_distinguishes_continuation_from_task_restart(self):
        constitution = read("AGENTS.md")
        guides = read("docs/guides/index.md")
        self.assertIn("连续问答不是任务重启", constitution)
        self.assertIn("任务装配时必读", guides)
        self.assertIn("不重复工程开工检查", guides)
        self.assertIn("Skill 不反向依赖", guides)

    def test_entry_and_recovery_load_only_current_branch(self):
        entry = self.section(self.interview(), "### 首次进入或恢复")
        for requirement in (
            "必要方法",
            "实际文件",
            "focusRef",
            "focusPoint",
            "原问题",
            "停止／暂缓",
            "不预加载",
            "不重复总览",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, entry)

    def test_continuation_reuses_methods_but_processes_all_new_input(self):
        continuation = self.section(self.interview(), "### 连续问答")
        for requirement in (
            "全部输入",
            "授权未变",
            "仍在上下文",
            "未变化",
            "不重新装配",
            "受影响",
            "每轮只问一个核心问题",
            "任一写入失败就停止",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, continuation)
        self.assertLess(
            continuation.index("保存原话与来源"),
            continuation.index("维护受影响术语"),
        )

    def test_minimum_scope_is_a_starting_point_not_a_whitelist(self):
        scope = self.section(self.interview(), "### 最小读取范围与新鲜度")
        for requirement in (
            "当前节点",
            "来源片段",
            "适用版本",
            "受影响术语",
            "对应 FM 目标",
            "viewRefs",
            "不是读取白名单",
            "影响范围不能确定",
            "扩大读取",
            "写入前",
            "实际文件",
            "digestedSources",
            "不建立隐藏状态",
        ):
            with self.subTest(requirement=requirement):
                self.assertIn(requirement, scope)

    def test_event_scope_preserves_global_closure_and_source_invalidation(self):
        events = self.section(self.interview(), "### 按事件扩大核对")
        for event in (
            "切换合同",
            "新增异常义务",
            "更正业务依据",
            "全部追责结束",
            "方法或文件变化",
            "上下文压缩",
            "保存中断",
        ):
            with self.subTest(event=event):
                self.assertRegex(events, rf"(?m)^\| {event}.*\|$")
        for requirement in ("完整责任图", "全部终点", "全局原话", "失效"):
            self.assertIn(requirement, events)
        self.assertIn("不等于重新加载全部方法", events)

    def test_composition_delegates_continuation_without_repeating_analysis(self):
        entry = read(".agents/skills/evidence-modeling/SKILL.md")
        workflow = read(".agents/skills/evidence-modeling/references/workflow.md")
        self.assertIn("分支进入与连续承接", workflow)
        self.assertIn("连续问答", entry)
        self.assertIn("不重新分派", entry)
        self.assertIn("Discovery", workflow)
        self.assertIn("不重做专业分析", workflow)
        self.assertIn("不是每轮回答后的必经步骤", workflow)

    def test_language_owner_limits_round_reads_without_deferring_term_updates(self):
        language = read(".agents/skills/evidence-fm/references/domain-language.md")
        self.assertIn("受影响术语", language)
        self.assertIn("不要求每轮全文重读", language)
        self.assertIn("已加载且未变化", language)
        self.assertIn("来源记录先保存原话", language)
        self.assertIn("不等待所有问题解决", language)
        self.assertIn("已建模概念的更正属于 FM 修改", language)

    def test_portable_skills_have_no_repository_routing_dependency(self):
        for skill in ("evidence-discovery", "evidence-modeling", "evidence-fm"):
            for document in (
                SKILLS / skill / "SKILL.md",
                *(SKILLS / skill / "references").glob("*.md"),
            ):
                with self.subTest(document=document):
                    self.assertNotIn("docs/guides/", document.read_text())
        template = json.loads(
            read(".agents/skills/evidence-discovery/assets/discovery-template.json")
        )
        self.assertEqual("2.0", template["schemaVersion"])
        self.assertIn("focusRef", template["handoff"])
        self.assertIn("focusPoint", template["handoff"])
        for field in ("methodCache", "contextSnapshot", "readWhitelist"):
            self.assertNotIn(field, template["handoff"])

    def test_behavior_evals_cover_loading_scope_and_unexecuted_evidence(self):
        cases = json.loads(
            read(".agents/skills/evidence-discovery/evals/evals.json")
        )["evals"]
        by_category = {case["category"]: case for case in cases}
        categories = (
            "incremental-entry-recovery",
            "incremental-continuous-answer",
            "incremental-context-switch",
            "incremental-source-correction",
            "incremental-global-closure",
            "incremental-context-loss",
            "incremental-external-change",
            "incremental-save-failure",
        )
        for category in categories:
            with self.subTest(category=category):
                self.assertIn(category, by_category)
                case = by_category[category]
                self.assertEqual(["evidence-fm"], case["knowledgeSkills"])
                self.assertTrue(case["expectations"])
                self.assertTrue(
                    any("读取" in expectation for expectation in case["expectations"])
                )
        protocol = read(".agents/skills/evidence-discovery/evals/README.md")
        for requirement in ("读取轨迹", "未执行", "token", "至少独立运行三次"):
            self.assertIn(requirement, protocol)


if __name__ == "__main__":
    unittest.main()
