"""Existing FM semantics support an unbound Context Role, not invented proof."""

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from context_samples import entity, write_model
from fm_model import load_model, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from test_fulfillment_structure import documents

SKILL = Path(__file__).resolve().parents[1]


class ContextRoleBoundaryTests(unittest.TestCase):
    def role(self):
        text = (SKILL / "examples/contract-batch.md").read_text()
        block = re.search(r"```json\n(.*?)```", text, re.S)
        self.assertIsNotNone(block)
        assert block is not None
        return json.loads(block[1])

    def errors(self, values):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            return validate_model(load_model(root))

    def test_unclarified_contract_has_only_an_unbound_role(self):
        values = documents() + [self.role()]
        self.assertEqual([], self.errors(values))
        self.assertEqual(["context.agreement"], [v["id"] for v in values if v.get("category") == "context"])
        self.assertFalse(any(v.get("kind") == "plays_role" for v in values))

    def test_role_is_not_an_evidence_reference_or_completion_confirmation(self):
        values = documents() + [self.role()]
        values.append({"type": "relationship", "id": "relation.invalid-proof", "kind": "references",
                       "sourceRef": "request.delivery", "targetRef": self.role()["id"], "label": "错误证明"})
        self.assertTrue(any("Evidence references must target" in error for error in self.errors(values)))
        values = documents() + [self.role()]
        values = [v for v in values if v["id"] != "confirmation.delivery"]
        self.assertTrue(self.errors(values), "A context boundary must not fill a missing fulfillment confirmation")

    def test_later_explicit_context_player_preserves_role_identity(self):
        role = self.role()
        values = documents() + [role, entity("context.support", "context", "external", "外部支撑边界")]
        values.append({"type": "relationship", "id": "relation.support-player", "kind": "plays_role",
                       "sourceRef": "context.support", "targetRef": role["id"], "label": "支撑边界扮演"})
        self.assertEqual([], self.errors(values))
        values[-1]["sourceRef"] = "context.not-modeled"
        self.assertTrue(self.errors(values), "A player cannot be fabricated by writing only a relationship")


if __name__ == "__main__":
    unittest.main()
