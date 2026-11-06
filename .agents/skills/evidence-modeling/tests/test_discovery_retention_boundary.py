"""Interview responsibilities and scope-report contracts."""

import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
DISCOVERY = SKILLS / "evidence-discovery"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


class DiscoveryRetentionBoundaryTests(unittest.TestCase):
    def test_discovery_has_no_record_template_or_snapshot(self):
        self.assertFalse((DISCOVERY / "assets/discovery-template.json").exists())
        self.assertFalse((FIXTURES / "discovery/refund-record.json").exists())
        for path in (DISCOVERY / "SKILL.md", DISCOVERY / "references/interview.md"):
            text = path.read_text()
            for obsolete in ("discovery.json", "questions.json", "schemaVersion", "先保存原话", "focusRef", "viewRefs"):
                self.assertNotIn(obsolete, text)
            for disclaimed in ("不负责", "不记录原始", "Skill 上层"):
                self.assertNotIn(disclaimed, text)
            for responsibility in ("当前", "每轮", "术语", "等待", "控制"):
                self.assertIn(responsibility, text)

    def test_scope_report_preserves_decision_coverage_without_extra_records(self):
        discovery = (DISCOVERY / "SKILL.md").read_text()
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        for contract in ("报告并停止", "确认覆盖", "未决", "暂缓", "不另建第二套问题台账"):
            self.assertIn(contract, workflow)
        self.assertNotIn("第二份问题记录", discovery)


if __name__ == "__main__":
    unittest.main()
