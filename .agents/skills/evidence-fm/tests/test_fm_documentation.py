"""Skill-local documentation contracts, not agent behavior evidence."""

import json
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]


class DocumentationTests(unittest.TestCase):
    def test_fm_exposes_model_review_branches_not_a_second_discovery_workshop(self):
        references = SKILL / "references"
        for name in ("input-review.md", "scenario-validation.md", "validation.md"):
            self.assertTrue((references / name).is_file(), name)
        for name in ("discovery-workshop.md", "scenario-replay.md"):
            self.assertFalse((references / name).exists(), name)

    def test_pattern_eval_contracts_do_not_require_retired_review_states(self):
        schema = json.loads((SKILL / "schemas/business-pattern.schema.json").read_text())
        self.assertFalse(schema["additionalProperties"])
        for field in ("reuseStatus", "stakeholderReview", "reviewStatus"):
            self.assertNotIn(field, schema["properties"])
        for name in ("format.md", "semantics.md", "business-pattern-extraction.md"):
            with self.subTest(reference=name):
                text = (SKILL / "references" / name).read_text()
                self.assertNotRegex(text, r"\b(candidate|supported|confirmed)\b")
                self.assertIn("不保存", text)
