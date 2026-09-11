from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml
from test_support import API_ROOT, FM_SKILL

EXAMPLE = API_ROOT / "assets" / "examples" / "full-lifecycle"
SCENARIO = "validation/scenarios/scenario--product-procurement.yaml"
PROOFS = {
    "payment": ("payment-voucher", "voucher_number"),
    "invoice": ("invoice", "invoice_number"),
    "delivery": ("delivery-note", "delivery_note_number"),
}


def load(path: Path):
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def save(path: Path, value) -> None:
    path.write_text(yaml.safe_dump(value, allow_unicode=True), encoding="utf-8")


def check(root: Path):
    result = subprocess.run(
        [sys.executable, str(FM_SKILL / "scripts" / "check_fm.py"), str(root)],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    return result.returncode, json.loads(result.stdout)


class EvidencePrerequisiteTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "fm"
        shutil.copytree(EXAMPLE / "fm", self.root)

    def test_all_evidence_and_api_actors_use_the_two_contract_roles(self) -> None:
        entities = [load(p) for p in (self.root / "entities").glob("*.yaml")]
        parties = {
            e["label"]
            for e in entities
            if e["category"] == "participant" and e["kind"] == "party"
        }
        self.assertEqual(parties, {"甲方采购员", "乙方销售"})
        roles = {e["id"]: e["label"] for e in entities if e["category"] == "role"}
        self.assertEqual(roles, {"role.buyer": "客户", "role.seller": "供应商"})
        contract = next(
            e
            for e in entities
            if e["kind"] == "contract" and e["category"] == "evidence"
        )
        self.assertEqual(set(contract["roleRefs"]), set(roles))
        for evidence in entities:
            if evidence["category"] == "evidence" and evidence["kind"] != "contract":
                self.assertIn(evidence["responsibleRoleRef"], contract["roleRefs"])
        design = load(EXAMPLE / "design.yaml")
        for cap in design["capabilities"]:
            self.assertIn(cap["actorRoleRef"], contract["roleRefs"])
        self.assertFalse(
            any(r["entityRef"].startswith("party.") for r in design["resources"])
        )
        plays = [load(p) for p in (self.root / "relationships").glob("*.yaml")]
        self.assertEqual(
            {
                (r["sourceRef"], r["targetRef"])
                for r in plays
                if r["kind"] == "plays_role"
            },
            {
                ("party.buyer-agent", "role.buyer"),
                ("party.seller-sales", "role.seller"),
            },
        )

    def test_dependencies_and_api_steps_match_for_each_responsibility(self) -> None:
        scenario = load(self.root / SCENARIO)
        design = load(EXAMPLE / "design.yaml")
        steps = {s["issueInstanceRef"]: s for s in scenario["steps"]}
        journey = design["journeys"][0]["steps"]
        caps = {c["id"]: c for c in design["capabilities"]}
        resources = {r["id"]: r for r in design["resources"]}
        self.assertEqual(design["sources"], [])
        for name, (proof, _) in PROOFS.items():
            with self.subTest(name=name):
                request_id = f"instance.{name}-request"
                proof_id = f"instance.{proof}"
                confirmation_id = f"instance.{name}-confirmation"
                step = steps[confirmation_id]
                self.assertLess(
                    steps[request_id]["sequence"], steps[proof_id]["sequence"]
                )
                self.assertLess(steps[proof_id]["sequence"], step["sequence"])
                self.assertIn(proof_id, step["availableInstanceRefs"])
                confirmation = load(
                    self.root
                    / f"validation/instances/instance--{name}-confirmation.yaml"
                )
                self.assertEqual(confirmation["basedOn"], [request_id, proof_id])
                self.assertEqual(
                    resources[f"resource.{name}-evidence"]["parentRef"],
                    f"resource.{name}-request",
                )
                cap = caps[f"capability.create-{name}-confirmation"]
                self.assertIn(
                    {
                        "ruleRef": f"rule.{name}-evidence-ready",
                        "purpose": "precondition",
                    },
                    cap["ruleBindings"],
                )
        instances = {
            obj["id"]: obj
            for obj in (
                load(p) for p in (self.root / "validation/instances").glob("*.yaml")
            )
        }
        for step, mapped in zip(scenario["steps"], journey, strict=True):
            self.assertEqual(step["sequence"], mapped["sourceStepSequence"])
            self.assertEqual(
                instances[step["issueInstanceRef"]]["entityRef"],
                caps[mapped["capabilityRef"]]["effect"]["targetRef"],
            )

    def test_existing_evidence_can_be_reused_without_reissuing(self) -> None:
        scenario = load(self.root / SCENARIO)
        scenario["givenInstanceRefs"] = [
            s["issueInstanceRef"] for s in scenario["steps"][:5]
        ]
        scenario["steps"] = scenario["steps"][5:]
        for i, step in enumerate(scenario["steps"], 1):
            step["sequence"] = i
        save(self.root / SCENARIO, scenario)
        code, report = check(self.root)
        self.assertEqual(code, 0, report)
        self.assertTrue(report["simulationPassed"])

    def test_missing_required_evidence_prevents_confirmation(self) -> None:
        scenario = load(self.root / SCENARIO)
        scenario["steps"] = [
            s for s in scenario["steps"] if s["issueInstanceRef"] != "instance.invoice"
        ]
        for i, step in enumerate(scenario["steps"], 1):
            step["sequence"] = i
        save(self.root / SCENARIO, scenario)
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(any("instance.invoice" in e for e in report["errors"]), report)

    def test_required_evidence_must_be_visible_to_confirmation_role(self) -> None:
        scenario = load(self.root / SCENARIO)
        step = next(
            s
            for s in scenario["steps"]
            if s["issueInstanceRef"] == "instance.invoice-confirmation"
        )
        step["availableInstanceRefs"] = ["instance.invoice-request"]
        save(self.root / SCENARIO, scenario)
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(report["errors"], report)

    def test_late_required_evidence_is_rejected(self) -> None:
        path = self.root / "validation/instances/instance--invoice.yaml"
        evidence = load(path)
        evidence["values"]["created_at"] = "2026-11-05T09:06:00Z"
        save(path, evidence)
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(report["errors"], report)

    def test_confirmation_requires_matching_evidence_number(self) -> None:
        for name, (_, number) in PROOFS.items():
            with self.subTest(name=name):
                path = (
                    self.root
                    / f"validation/instances/instance--{name}-confirmation.yaml"
                )
                original = load(path)
                changed = load(path)
                changed["values"][number] = "UNRELATED-001"
                save(path, changed)
                code, report = check(self.root)
                self.assertNotEqual(code, 0)
                self.assertTrue(report["errors"], report)
                save(path, original)

    def test_evidence_must_belong_to_the_requested_instance(self) -> None:
        path = self.root / "validation/instances/instance--invoice.yaml"
        evidence = load(path)
        evidence["values"]["request_number"] = "UNRELATED-REQ-001"
        save(path, evidence)
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(report["errors"], report)

    def test_no_evidence_keeps_request_pending(self) -> None:
        scenario = load(self.root / SCENARIO)
        scenario["steps"] = scenario["steps"][:4]
        scenario["evaluations"] = []
        scenario["expectations"]["fulfillmentStatuses"] = [
            {
                "fulfillmentRef": "fulfillment.payment",
                "requestInstanceRef": "instance.payment-request",
                "status": "pending",
            }
        ]
        save(self.root / SCENARIO, scenario)
        code, report = check(self.root)
        self.assertEqual(code, 0, report)
        self.assertTrue(report["simulationPassed"])


if __name__ == "__main__":
    unittest.main()
