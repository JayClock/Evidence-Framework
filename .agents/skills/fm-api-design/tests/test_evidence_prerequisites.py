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
    "payment": ("wechat-payment-confirmation", "payment_number"),
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

    def test_contract_roles_and_external_evidence_responsibility_stay_separate(
        self,
    ) -> None:
        entities = [load(p) for p in (self.root / "entities").glob("*.yaml")]
        parties = {
            e["label"]
            for e in entities
            if e["category"] == "participant" and e["kind"] == "party"
        }
        self.assertEqual(parties, {"甲方采购员", "乙方销售"})
        roles = {
            e["id"]: e["label"]
            for e in entities
            if e["category"] == "role"
            and e["contextRef"] == "context.product-procurement"
        }
        self.assertEqual(roles, {"role.buyer": "客户", "role.seller": "供应商"})
        contract = next(
            e for e in entities if e["id"] == "contract.product-procurement"
        )
        self.assertEqual(set(contract["roleRefs"]), set(roles))
        for evidence in entities:
            if (
                evidence["category"] == "evidence"
                and evidence["kind"] != "contract"
                and evidence["contextRef"] != "fulfillment.wechat-payment"
            ):
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
                if r["kind"] == "plays_role" and r["sourceRef"].startswith("party.")
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
                if name != "payment":
                    self.assertEqual(
                        resources[{
                            "invoice": "resource.invoice",
                            "delivery": "resource.delivery-note",
                        }[name]]["parentRef"],
                        {"invoice": "resource.invoicing", "delivery": "resource.delivery"}[name],
                    )
                else:
                    self.assertEqual(
                        steps[proof_id]["actingRoleRef"], "role.wechat-provider"
                    )
                    self.assertNotIn(
                        "role.payment-proof",
                        {resource["entityRef"] for resource in resources.values()},
                    )
                cap = caps[{
                    "payment": "capability.confirm-payment",
                    "invoice": "capability.confirm-invoicing",
                    "delivery": "capability.confirm-delivery",
                }[name]]
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
            target = instances[step["issueInstanceRef"]]["entityRef"]
            if mapped["mapping"] == "external":
                self.assertIn(
                    target,
                    {
                        "contract.wechat-payment",
                        "request.wechat-payment",
                        "confirmation.wechat-payment",
                    },
                )
                self.assertNotIn("capabilityRef", mapped)
            else:
                self.assertEqual(
                    target, caps[mapped["capabilityRef"]]["effect"]["targetRef"]
                )

    def test_existing_evidence_can_be_reused_without_reissuing(self) -> None:
        scenario = load(self.root / SCENARIO)
        scenario["givenInstanceRefs"] = [
            s["issueInstanceRef"] for s in scenario["steps"][:7]
        ]
        scenario["steps"] = scenario["steps"][7:]
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

    def test_external_confirmation_requires_explicit_role_registration(self) -> None:
        (
            self.root
            / "relationships"
            / "relation--wechat-confirmation-plays-payment-proof.yaml"
        ).unlink()
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(any("plays_role" in e for e in report["errors"]), report)

    def test_payment_role_cannot_be_issued_as_an_evidence_instance(self) -> None:
        path = (
            self.root
            / "validation/instances/instance--wechat-payment-confirmation.yaml"
        )
        instance = load(path)
        instance["entityRef"] = "role.payment-proof"
        save(path, instance)
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(report["errors"], report)

    def test_payment_confirmation_requires_visible_external_proof(self) -> None:
        scenario = load(self.root / SCENARIO)
        step = next(
            s
            for s in scenario["steps"]
            if s["issueInstanceRef"] == "instance.payment-confirmation"
        )
        step["availableInstanceRefs"] = ["instance.payment-request"]
        save(self.root / SCENARIO, scenario)
        code, report = check(self.root)
        self.assertNotEqual(code, 0)
        self.assertTrue(report["errors"], report)

    def test_external_proof_does_not_replace_customer_confirmation(self) -> None:
        scenario = load(self.root / SCENARIO)
        scenario["steps"] = scenario["steps"][:7]
        scenario["evaluations"] = [
            {
                "ruleRef": "rule.payment-evidence-ready",
                "bindings": {
                    "request": {"instanceRef": "instance.payment-request"},
                    "proofs": {
                        "instanceRefs": ["instance.wechat-payment-confirmation"]
                    },
                },
                "expectedResult": True,
            }
        ]
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

    def test_external_proof_must_match_request_amount_and_time(self) -> None:
        path = (
            self.root
            / "validation/instances/instance--wechat-payment-confirmation.yaml"
        )
        original = load(path)
        for field, value in (
            ("request_number", "UNRELATED-REQ-001"),
            ("paid_minor_units", 1),
            ("confirmed_at", "2026-11-04T10:06:00Z"),
        ):
            with self.subTest(field=field):
                changed = load(path)
                changed["values"][field] = value
                save(path, changed)
                code, report = check(self.root)
                self.assertNotEqual(code, 0)
                self.assertTrue(report["errors"], report)
                save(path, original)

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
