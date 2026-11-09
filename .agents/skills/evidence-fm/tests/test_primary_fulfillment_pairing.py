"""A Contract keeps both obligation directions: one sided content is never deliverable."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

import check_fm  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import load_model, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_scope import completeness_gaps, pairing_gaps  # pyright: ignore[reportMissingImports]  # noqa: E402

EXAMPLE = SKILL / "tests/fixtures/models/valid-traceable-subscription"
CONTRACT_CONTEXT = "context.content-subscription"
ACCESS_FILES = (
    "entities/evidence-fulfillment-request--content-access.json",
    "entities/evidence-fulfillment-confirmation--content-access.json",
    "relationships/relation--content-subscription-precedes-content-access-request.json",
    "rules/rule--content-access-completed.json",
    "validation/instances/instance--content-access-request.json",
    "validation/instances/instance--content-access-confirmation.json",
    "validation/scenarios/scenario--content-access-after-payment.json",
)


class PrimaryFulfillmentPairingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "fm"
        shutil.copytree(EXAMPLE, self.root)

    def edit(self, relative, mutate):
        path = self.root / relative
        value = json.loads(path.read_text())
        mutate(value)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def test_both_parties_hold_a_main_fulfillment(self):
        model = load_model(self.root)
        self.assertEqual([], validate_model(model))
        self.assertEqual([], pairing_gaps(model))
        report = check_fm.check_model(self.root, scope_refs=[CONTRACT_CONTEXT])
        self.assertTrue(report["complete"], report)

    def test_one_direction_is_a_scope_gap_not_a_consistency_error(self):
        for relative in ACCESS_FILES:
            (self.root / relative).unlink()
        model = load_model(self.root)
        self.assertEqual([], validate_model(model))
        gaps = pairing_gaps(model)
        self.assertEqual(1, len(gaps), gaps)
        self.assertIn(f"{CONTRACT_CONTEXT}:", gaps[0])
        self.assertIn("role.subscriber", gaps[0])
        self.assertNotIn("role.platform-subscription", gaps[0])
        report = check_fm.check_model(self.root, scope_refs=[CONTRACT_CONTEXT])
        self.assertTrue(report["consistent"], report)
        self.assertEqual([], report["errors"], report)
        self.assertFalse(report["complete"], report)
        self.assertFalse(report["valid"], report)
        self.assertIn(gaps[0], report["gaps"])

    def test_same_party_cannot_stand_for_both_obligation_directions(self):
        self.edit(
            "entities/evidence-fulfillment-request--content-access.json",
            lambda value: value.update(responsibleRoleRef="role.platform-subscription"),
        )
        model = load_model(self.root)
        self.assertEqual([], validate_model(model))
        self.assertEqual(1, len(pairing_gaps(model)), pairing_gaps(model))
        self.assertIn("role.subscriber", pairing_gaps(model)[0])

    def test_scope_end_gaps_reuse_the_same_direction_check(self):
        for relative in ACCESS_FILES:
            (self.root / relative).unlink()
        gaps = completeness_gaps(load_model(self.root))
        self.assertTrue(any("role.subscriber" in gap for gap in gaps), gaps)
        self.assertFalse(any("primary Fulfillment before scope completion" in gap for gap in gaps), gaps)

    def test_parties_are_not_invented_to_satisfy_the_direction_check(self):
        self.edit(
            "entities/evidence-fulfillment-request--content-access.json",
            lambda value: value.pop("responsibleRoleRef"),
        )
        report = check_fm.check_model(self.root, scope_refs=[CONTRACT_CONTEXT])
        self.assertFalse(report["consistent"], report)
        self.assertTrue(any("responsibleRoleRef" in error for error in report["errors"]), report)
        self.assertEqual(
            {"role.platform-subscription", "role.subscriber"},
            set(
                json.loads((self.root / "entities/evidence-contract--content-subscription.json").read_text())[
                    "roleRefs"
                ]
            ),
        )


if __name__ == "__main__":
    unittest.main()
