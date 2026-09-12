"""Skill-local documentation contracts, not agent behavior evidence."""

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
