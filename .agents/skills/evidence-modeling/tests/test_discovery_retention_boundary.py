"""Interview responsibilities and explicitly requested Markdown handoff contracts."""

import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
DISCOVERY = SKILLS / "evidence-discovery"


class DiscoveryRetentionBoundaryTests(unittest.TestCase):
    def test_discovery_has_no_record_template_or_snapshot(self):
        self.assertFalse((DISCOVERY / "assets/discovery-template.json").exists())
        self.assertFalse((DISCOVERY / "examples/refund-record.json").exists())
        for path in (DISCOVERY / "SKILL.md", DISCOVERY / "references/interview.md"):
            text = path.read_text()
            for obsolete in ("discovery.json", "questions.json", "schemaVersion", "先保存原话", "focusRef", "viewRefs"):
                self.assertNotIn(obsolete, text)
            for disclaimed in ("不负责", "不记录原始", "Skill 上层"):
                self.assertNotIn(disclaimed, text)
            for responsibility in ("当前", "每轮", "术语", "等待", "控制"):
                self.assertIn(responsibility, text)

    def test_manual_handoff_is_explicit_and_preserves_decision_coverage(self):
        text = (SKILLS / "evidence-handoff/SKILL.md").read_text()
        self.assertIn("disable-model-invocation: true", text)
        for contract in ("Markdown", ".evidence/handoffs/", "人类确认覆盖", "未决", "控制意图", "路径或 URL", "敏感值脱敏", "写入失败"):
            self.assertIn(contract, text)
        self.assertNotIn("不负责", text)
        discovery = (DISCOVERY / "SKILL.md").read_text()
        self.assertNotIn("evidence-handoff", discovery)
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        self.assertIn("显式", workflow)
        self.assertIn("evidence-handoff", workflow)


if __name__ == "__main__":
    unittest.main()
