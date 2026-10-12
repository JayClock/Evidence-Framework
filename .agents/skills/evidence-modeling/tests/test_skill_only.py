"""Host-independent Skill paths; these do not execute a live agent interview."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class SkillOnlyTests(unittest.TestCase):
    def test_core_protocol_uses_natural_language_without_tool_dispatch(self):
        text = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        for token in ("evidence_ui_", "switch-context", "currentAgreementRef",
                      "kind: fulfillment", "`position`", "`story`", "`prompt`"):
            self.assertNotIn(token, text)
        for phrase in ("普通对话是完整交互路径", "自然语言", "取消",
                       "原问题标识", "已经收到的回答用于业务理解", "任一写入失败就停止"):
            self.assertIn(phrase, text)

    def test_distributed_runtime_has_no_host_specific_dependency(self):
        for name in ("evidence-discovery", "evidence-modeling"):
            package = SKILLS / name
            paths = [package / "SKILL.md", *(package / "references").glob("*.md"),
                     *(package / "assets").glob("*.json")]
            for path in paths:
                with self.subTest(path=path.name):
                    self.assertNotRegex(path.read_text(),
                                        r"evidence_ui_|pi-ui|\.pi/|/skill:|/evidence-model|\bPi\b")
        self.assertEqual({"interview.md"}, {
            path.name for path in (SKILLS / "evidence-discovery/references").glob("*.md")
        })

    def test_native_skill_entry_is_the_complete_path(self):
        entry = (SKILLS / "evidence-modeling/SKILL.md").read_text()
        self.assertIn("访谈使用普通对话", entry)
        self.assertIn("无需专门的 Skill 调用工具", entry)
        constitution = (REPO / "AGENTS.md").read_text()
        self.assertIn("显式从 `/skill:evidence-modeling`", constitution)
        self.assertIn("建模只通过 Skill 执行", constitution)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("普通对话是完整交互路径", guide)
        self.assertNotRegex(guide, r"/evidence-model(?!ing)|\.pi/|evidence_ui_")

    def test_behavior_evals_cover_text_controls_resume_and_save_failure(self):
        data = json.loads((SKILLS / "evidence-discovery/evals/evals.json").read_text())
        indexed = {case["category"]: case for case in data["evals"]}
        for category in ("skill-only-complete-interview", "answer-and-stop",
                         "unanswered-cancel-resume", "language-write-failure"):
            with self.subTest(category=category):
                case = indexed[category]
                self.assertIn("follow_up", case)
                self.assertGreaterEqual(len(case["expectations"]), 4)
        instructions = (SKILLS / "evidence-discovery/evals/README.md").read_text()
        self.assertIn("完整普通对话路径", instructions)
        self.assertIn("没有实际执行就保持未执行", instructions)


if __name__ == "__main__":
    unittest.main()
