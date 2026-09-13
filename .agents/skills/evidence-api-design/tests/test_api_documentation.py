"""Skill-local documentation contracts, not agent behavior evidence."""

import re
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


class DocumentationTests(unittest.TestCase):
    def test_api_design_delivers_whole_model_without_selection_pipeline(self):
        skill = SKILL
        retired = re.compile(
            r"候选|candidate|exploration|unselected|scopeCapabilityRefs|require-complete|scope\.contextRefs",
            re.I,
        )
        for folder in ("scripts", "references", "schemas", "assets", "evals"):
            for path in (skill / folder).rglob("*"):
                if path.suffix in {".py", ".md", ".yaml", ".json"}:
                    self.assertNotRegex(path.read_text(), retired, str(path))
        entry = (skill / "SKILL.md").read_text()
        self.assertIn("已确认的整体 FM", entry)
        self.assertIn("每个接口都必须有契约", entry)
        self.assertIn("不重新组织业务确认", entry)
