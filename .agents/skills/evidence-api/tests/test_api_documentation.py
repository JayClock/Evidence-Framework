"""Independent API documentation contracts, not agent behavior evidence."""

import re
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


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
            SKILL / "evals/evals.json",
        ]
        for path in documents:
            self.assertNotRegex(path.read_text(), retired, str(path))
        entry = (SKILL / "references/api-design.md").read_text()
        self.assertIn("上游是整体 FM", entry)
        self.assertIn("每个接口都必须有契约", entry)
        self.assertIn("不重复业务确认", entry)
        self.assertIn("--fm-check", entry)
        self.assertIn("--fm-skill", entry)
        self.assertTrue((SKILL / "SKILL.md").read_text().startswith("---\nname: evidence-api\n"))
        self.assertFalse((SKILL / "scripts/check_fm.py").exists())
