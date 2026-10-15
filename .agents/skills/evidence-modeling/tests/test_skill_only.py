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
        for phrase in ("普通对话沿同一条主线推进", "自然语言", "取消",
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

    def test_project_wiring_does_not_add_a_host_extension_for_interviews(self):
        self.assertFalse((REPO / ".pi/extensions/evidence-modeling").exists())
        package = json.loads((REPO / "package.json").read_text())
        self.assertFalse(any(name.startswith("evidence-modeling:") for name in package["scripts"]))
        self.assertFalse(any(".pi/extensions" in command for command in package["scripts"].values()))
        dependencies = package["devDependencies"]
        for name in ("@earendil-works/pi-coding-agent", "@earendil-works/pi-server",
                     "@earendil-works/pi-tui", "typebox"):
            self.assertNotIn(name, dependencies)

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


if __name__ == "__main__":
    unittest.main()
