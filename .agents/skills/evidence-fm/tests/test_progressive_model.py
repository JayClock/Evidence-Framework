"""Progressive FM: source consistency is not scope completion or human approval."""
from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
import check_fm  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import load_model  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_scope import ready_scope  # pyright: ignore[reportMissingImports]  # noqa: E402


class ProgressiveModelTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "fm"
        self.root.mkdir()
        self.save("model.json", {
            "type": "fm_model", "schemaVersion": "5.0", "id": "progressive-example",
            "name": "合成渐进模型", "version": "1.0.0", "ruleLanguage": "CEL",
            "entryContextRefs": ["context.inquiry"],
        })
        self.save("context.json", {
            "type": "entity", "id": "context.inquiry", "category": "context",
            "kind": "pre_contract", "label": "询价协商（Sales Inquiry）",
        })
        self.save("role.json", {
            "type": "entity", "id": "role.requester", "category": "role", "kind": "party",
            "label": "询价方（Requester）", "contextRef": "context.inquiry",
        })
        self.receipt: dict[str, Any] = {
            "type": "entity", "id": "request.inquiry", "category": "evidence", "kind": "rfp",
            "label": "询价请求（Inquiry Request）", "notes": "询价方向报价方提出的真实业务请求。",
            "contextRef": "context.inquiry", "responsibleRoleRef": "role.requester",
        }
        self.save("receipt.json", self.receipt)

    def save(self, name, value):
        (self.root / name).write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def test_receipt_and_known_role_can_grow_before_time_and_rules_are_known(self):
        before = {p.name: p.read_bytes() for p in self.root.iterdir()}
        result = check_fm.check_model(self.root)
        self.assertTrue(result["valid"], result)
        self.assertTrue(result["consistent"])
        self.assertIsNone(result["complete"])
        self.assertTrue(result["gaps"])
        self.assertIsNone(result["simulationPassed"])
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir()})

    def test_unknown_attribute_type_is_not_guessed(self):
        self.receipt["attributes"] = [{
            "name": "requested_amount", "label": "请求金额（Requested Amount）",
            "meaning": "询价请求中提出的金额，类型与是否必需尚待澄清。",
        }]
        self.save("receipt.json", self.receipt)
        result = check_fm.check_model(self.root)
        self.assertTrue(result["valid"], result)
        self.assertNotIn("valueType", json.loads((self.root / "receipt.json").read_text())["attributes"][0])

    def test_receipt_without_responsibility_is_an_error_not_a_gap(self):
        del self.receipt["responsibleRoleRef"]
        self.save("receipt.json", self.receipt)
        result = check_fm.check_model(self.root)
        self.assertFalse(result["valid"])
        self.assertTrue(any("responsibleRoleRef" in error for error in result["errors"]))

    def test_dangling_responsibility_is_never_accepted_as_progressive(self):
        self.receipt["responsibleRoleRef"] = "role.unidentified"
        self.save("receipt.json", self.receipt)
        result = check_fm.check_model(self.root)
        self.assertFalse(result["valid"])
        self.assertTrue(any("responsibleRoleRef" in error for error in result["errors"]))

    def finish_receipt_times(self):
        self.receipt["attributes"] = [
            {"name": name, "label": name, "meaning": "合成询价的已知有效期间。",
             "valueType": "timestamp", "required": True, "keyData": True}
            for name in ("started_at", "expired_at")
        ]
        self.save("receipt.json", self.receipt)

    def test_scope_gaps_do_not_make_known_facts_inconsistent(self):
        result = check_fm.check_model(self.root, scope_refs=["context.inquiry"])
        self.assertTrue(result["consistent"], result)
        self.assertFalse(result["complete"])
        self.assertFalse(result["valid"])
        self.assertEqual([], result["errors"])
        self.assertTrue(any("started_at" in gap for gap in result["gaps"]))

    def test_independent_scope_is_not_blocked_by_unrelated_incompleteness(self):
        self.finish_receipt_times()
        self.save("unrelated.json", {
            "type": "entity", "id": "context.other-domain", "category": "context",
            "kind": "domain", "label": "其他档案领域（Other Profile Domain）",
            "rootRefs": ["thing.other-profile"],
        })
        self.save("other-profile.json", {
            "type": "entity", "id": "thing.other-profile", "category": "participant", "kind": "thing",
            "label": "其他档案（Other Profile）", "contextRef": "context.other-domain",
            "attributes": [{"name": "profile_id", "label": "档案标识（Profile ID）",
                            "meaning": "区分该领域内的档案，类型及必填性仍待澄清。"}],
        })
        whole = check_fm.check_model(self.root)
        self.assertTrue(whole["consistent"], whole)
        self.assertTrue(whole["gaps"])
        selected = check_fm.check_model(self.root, scope_refs=["context.inquiry"])
        self.assertTrue(selected["complete"], selected)
        self.assertIsNone(selected["simulationPassed"])
        self.assertEqual("not-applicable", selected["scenarioRequirement"])
        projection = ready_scope(load_model(self.root), selected)
        self.assertNotIn("context.other-domain", projection.entities_by_id)
        self.assertEqual("not-asserted-by-machine", selected["humanConfirmation"])

    def test_consistency_only_result_cannot_be_consumed_as_delivery_ready(self):
        self.finish_receipt_times()
        report = check_fm.check_model(self.root)
        self.assertTrue(report["valid"])
        with self.assertRaises(ValueError):
            ready_scope(load_model(self.root), report)

    def test_scope_must_not_be_a_child_stage_or_a_receipt(self):
        self.save("child.json", {
            "type": "entity", "id": "context.child", "category": "context", "kind": "pre_contract",
            "label": "子阶段（Child Stage）", "parentContextRef": "context.inquiry",
        })
        for ref in ("context.child", "request.inquiry", "context.missing"):
            result = check_fm.check_model(self.root, scope_refs=[ref])
            self.assertFalse(result["valid"], result)
            self.assertTrue(any("independent Context" in error for error in result["errors"]))

    def test_invalid_cel_is_not_hidden_by_missing_times(self):
        self.save("rule.json", {
            "type": "rule", "id": "rule.broken", "kind": "invariant", "label": "坏表达式（Broken Expression）",
            "description": "合成错误，不是业务事实。", "contextRef": "context.inquiry",
            "bindings": {}, "expression": "true &&", "resultType": "bool",
        })
        result = check_fm.check_model(self.root)
        self.assertFalse(result["consistent"])
        self.assertTrue(any("invalid CEL" in error for error in result["errors"]))

    def test_contract_and_both_roles_are_stored_without_inventing_actual_people(self):
        self.save("context.json", {
            "type": "entity", "id": "context.inquiry", "category": "context", "kind": "contract",
            "label": "买卖合同（Sales Contract）", "rootRefs": ["contract.sale"],
        })
        other_role = json.loads((self.root / "role.json").read_text())
        other_role["id"] = "role.seller"
        self.save("seller.json", other_role)
        contract = copy.deepcopy(self.receipt)
        contract.update(id="contract.sale", kind="contract", roleRefs=["role.requester", "role.seller"])
        del contract["responsibleRoleRef"]
        self.save("receipt.json", contract)
        result = check_fm.check_model(self.root)
        self.assertTrue(result["consistent"], result)
        self.assertTrue(result["gaps"])
        del contract["roleRefs"]
        self.save("receipt.json", contract)
        self.assertFalse(check_fm.check_model(self.root)["consistent"])

    def test_shared_actual_participant_does_not_pull_an_unrelated_scope(self):
        self.finish_receipt_times()
        self.save("other.json", {"type": "entity", "id": "context.other", "category": "context", "kind": "domain", "label": "其他（Other）", "rootRefs": ["thing.other-profile"]})
        self.save("other-profile.json", {"type": "entity", "id": "thing.other-profile", "category": "participant", "kind": "thing", "label": "其他档案（Other Profile）", "contextRef": "context.other"})
        self.save("other-role.json", {"type": "entity", "id": "role.other", "category": "role", "kind": "party", "label": "另一角色（Other Role）", "contextRef": "context.other"})
        self.save("party.json", {"type": "entity", "id": "party.shared", "category": "participant", "kind": "party", "label": "同一主体（Shared Party）"})
        for name, role in (("inquiry", "role.requester"), ("other", "role.other")):
            self.save(f"plays-{name}.json", {"type": "relationship", "id": f"relation.plays-{name}", "kind": "plays_role", "sourceRef": "party.shared", "targetRef": role, "label": "承担角色（Plays Role）"})
        report = check_fm.check_model(self.root, scope_refs=["context.inquiry"])
        self.assertTrue(report["complete"], report)
        selected = ready_scope(load_model(self.root), report)
        self.assertIn("party.shared", selected.entities_by_id)
        self.assertNotIn("context.other", selected.entities_by_id)
        self.assertEqual(["relation.plays-inquiry"], [item["id"] for item in selected.relationships])

    def test_context_parent_cycle_is_an_error_before_scope_completion(self):
        self.save("context.json", {"type": "entity", "id": "context.inquiry", "category": "context", "kind": "pre_contract", "label": "询价（Inquiry）", "parentContextRef": "context.other"})
        self.save("other.json", {"type": "entity", "id": "context.other", "category": "context", "kind": "pre_contract", "label": "其他（Other）", "parentContextRef": "context.inquiry"})
        report = check_fm.check_model(self.root)
        self.assertFalse(report["consistent"], report)
        self.assertTrue(any("cycle" in error for error in report["errors"]))

    def test_malformed_partial_attribute_returns_a_report_not_a_traceback(self):
        self.receipt["attributes"] = [42]
        self.save("receipt.json", self.receipt)
        report = check_fm.check_model(self.root)
        self.assertFalse(report["consistent"])
        self.assertTrue(report["errors"])

    def test_unknown_type_does_not_reject_an_asserted_value_or_invent_a_type(self):
        from fm_simulation import ValidationSuite, validate_validation_suite  # pyright: ignore[reportMissingImports]
        self.receipt["attributes"] = [{"name": "amount", "label": "金额（Amount）", "meaning": "类型尚未明确的金额。"}]
        self.save("receipt.json", self.receipt)
        suite = ValidationSuite(root=self.root, instances=[{"id": "instance.inquiry", "entityRef": "request.inquiry", "values": {"amount": 100}}])
        self.assertEqual([], validate_validation_suite(load_model(self.root), suite))

    def test_domain_rules_do_not_require_fake_evidence_to_complete_a_scope(self):
        root = SKILL / "examples/domain"
        model = load_model(root)
        scopes = [item["id"] for item in model.entities if item.get("category") == "context" and not item.get("parentContextRef")]
        report = check_fm.check_model(root, scope_refs=scopes)
        self.assertTrue(report["complete"], report)
        self.assertEqual("not-applicable", report["scenarioRequirement"])
        self.assertIsNone(report["simulationPassed"])
        self.assertTrue(report["simulationLimitations"])

    def test_scope_keeps_historical_basis_instances_without_inventing_scenario_inputs(self):
        from fm_scope import scope_suite, select_scope  # pyright: ignore[reportMissingImports]
        from fm_simulation import ValidationSuite  # pyright: ignore[reportMissingImports]
        selected = select_scope(load_model(self.root), ["context.inquiry"])
        suite = ValidationSuite(root=self.root, instances=[
            {"id": "instance.current", "entityRef": "request.inquiry", "basedOn": ["instance.history"]},
            {"id": "instance.history", "entityRef": "request.inquiry"},
        ], scenarios=[{"id": "scenario.synthetic", "givenInstanceRefs": ["instance.current"]}])
        projection = scope_suite(selected, suite)
        self.assertEqual({"instance.current", "instance.history"}, set(projection.instances_by_id))
        self.assertEqual(["instance.current"], projection.scenarios[0]["givenInstanceRefs"])

    def test_empty_sibling_wrapper_is_an_error_not_a_completeness_gap(self):
        import shutil
        root = self.root.parent / "contract"
        shutil.copytree(SKILL / "examples/valid-traceable-subscription", root)
        model = load_model(root)
        context = next(item["id"] for item in model.entities if item.get("category") == "context" and item.get("kind") == "contract")
        (root / "refund.json").write_text(json.dumps({"type": "entity", "id": "fulfillment.refund", "category": "fulfillment", "label": "退款（Refund）", "contextRef": context}), encoding="utf-8")
        report = check_fm.check_model(root, scope_refs=[context])
        self.assertFalse(report["consistent"], report)
        self.assertFalse(report["complete"])
        self.assertTrue(any("fulfillment.refund" in error for error in report["errors"]))

    def test_precontract_rules_execute_without_inventing_a_fulfillment(self):
        self.finish_receipt_times()
        self.receipt["attributes"].append({"name": "amount", "label": "金额（Amount）", "meaning": "合成询价金额。", "valueType": "int", "required": True})
        self.save("receipt.json", self.receipt)
        self.save("amount-rule.json", {"type": "rule", "id": "rule.amount", "kind": "precondition", "label": "正金额（Positive Amount）", "description": "询价金额大于零。", "contextRef": "context.inquiry", "bindings": {"request": {"ref": "request.inquiry"}}, "expression": "request.amount > 0", "resultType": "bool"})
        for folder in ("instances", "scenarios"):
            (self.root / "validation" / folder).mkdir(parents=True)
        for name, amount, expected in (("positive", 1, True), ("negative", -1, False)):
            ref = f"instance.inquiry-{name}"
            self.save(f"validation/instances/{ref.replace('.', '--')}.json", {"type": "evidence_instance", "id": ref, "entityRef": "request.inquiry", "values": {"started_at": "2025-01-01T00:00:00Z", "expired_at": "2025-01-02T00:00:00Z", "amount": amount}})
            self.save(f"validation/scenarios/scenario--inquiry-{name}.json", {"type": "fm_scenario", "id": f"scenario.inquiry-{name}", "label": name, "asOf": "2025-01-01T00:00:00Z", "steps": [{"sequence": 1, "actingRoleRef": "role.requester", "issueInstanceRef": ref}], "evaluations": [{"ruleRef": "rule.amount", "bindings": {"request": {"instanceRef": ref}}, "expectedResult": expected}], "expectations": {"fulfillmentStatuses": []}})
        report = check_fm.check_model(self.root, scope_refs=["context.inquiry"])
        self.assertTrue(report["complete"], report)
        self.assertTrue(report["simulationPassed"], report)
        self.assertEqual(2, report["executedScenarioCount"])
        self.assertEqual({}, load_model(self.root).fulfillments_by_id)

    def test_consumer_rejects_scope_and_simulation_claims_that_do_not_match(self):
        root = SKILL / "examples/valid-traceable-subscription"
        model = load_model(root)
        context = next(item["id"] for item in model.entities if item.get("category") == "context" and item.get("kind") == "contract")
        report = check_fm.check_model(root, scope_refs=[context])
        self.assertTrue(report["valid"], report)
        for changes in ({"contextRefs": []}, {"scenarioRequirement": "not-applicable", "simulationPassed": None}, {"executedScenarioCount": 0}, {"scenarioCount": True}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                ready_scope(model, dict(report, **changes))


if __name__ == "__main__":
    unittest.main()
