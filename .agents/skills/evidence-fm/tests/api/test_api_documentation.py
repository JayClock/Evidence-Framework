"""API documentation contracts inside the FM package, not agent behavior evidence."""

import re
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]


class DocumentationTests(unittest.TestCase):
    def test_api_design_delivers_whole_model_without_selection_pipeline(self):
        retired = re.compile(
            r"候选|candidate|exploration|unselected|scopeCapabilityRefs|require-complete|scope\.contextRefs",
            re.I,
        )
        documents = [
            SKILL / "scripts/fm_api.py",
            *sorted((SKILL / "scripts/fm_api_core").glob("*.py")),
            *sorted((SKILL / "references").glob("api-*.md")),
            *sorted((SKILL / "schemas").glob("api*.json")),
            SKILL / "evals/api.json",
        ]
        for path in documents:
            self.assertNotRegex(path.read_text(), retired, str(path))
        entry = (SKILL / "references/api-design.md").read_text()
        self.assertIn("上游是整体 FM", entry)
        self.assertIn("每个接口都必须有契约", entry)
        self.assertIn("不重复业务确认", entry)
        self.assertIn("--fm-check", entry)
        self.assertNotIn("--fm-skill", entry)
        self.assertIn("自动接续 API", (SKILL / "SKILL.md").read_text())
        self.assertFalse((SKILL.parent / "evidence-api-design").exists())
