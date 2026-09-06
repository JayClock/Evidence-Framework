from __future__ import annotations

import copy
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import yaml

SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = SKILL_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

from build_fm_business_patterns import render_business_patterns  # noqa: E402
from fm_model import (  # type: ignore[import-not-found]  # noqa: E402
    compiled_document,
    load_model,
    validate_model,
)


class FulfillmentModelTests(unittest.TestCase):
    def fixture(self, name: str) -> Path:
        return Path(__file__).resolve().parent / "fixtures" / name

    def copied_fixture(self, name: str, directory: str) -> Path:
        root = Path(directory) / "model"
        shutil.copytree(self.fixture(name), root)
        return root

    def read_yaml(self, path: Path) -> dict[str, Any]:
        return yaml.safe_load(path.read_text(encoding="utf-8"))

    def write_yaml(self, path: Path, document: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            yaml.safe_dump(document, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )

    def test_valid_subscription_preserves_explicit_customer_subscriber_binding(
        self,
    ) -> None:
        model = load_model(self.fixture("valid-subscription"))
        self.assertEqual([], validate_model(model))
        self.assertIn("party.customer", model.entities_by_id)
        self.assertNotIn("party.subscriber", model.entities_by_id)
        self.assertNotIn("party.platform", model.entities_by_id)
        relation = model.relationships_by_id["relation.customer-plays-subscriber"]
        self.assertEqual("party.customer", relation["sourceRef"])
        self.assertEqual("role.subscriber", relation["targetRef"])

    def test_contract_is_valid_without_any_materialized_party(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            (root / "entities" / "party--customer.yaml").unlink()
            (
                root / "relationships" / "relation--customer-plays-subscriber.yaml"
            ).unlink()
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            self.assertEqual(
                ["role.subscriber", "role.platform-subscription"],
                model.entities_by_id["contract.content-subscription"]["roleRefs"],
            )

    def test_all_role_subtypes_can_exist_without_players(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            roles = {
                "role.entitlement-calculator": ("domain", "权益计算者"),
                "role.tax-platform": ("third_party", "外部税务平台"),
                "role.payment-context": ("context", "支付上下文"),
                "role.payment-proof": ("evidence", "付款凭证角色"),
            }
            for role_id, (kind, label) in roles.items():
                self.write_yaml(
                    root / "entities" / f"{role_id.replace('.', '--')}.yaml",
                    {
                        "type": "entity",
                        "id": role_id,
                        "category": "role",
                        "kind": kind,
                        "label": label,
                        "contextRef": "context.content-subscription",
                    },
                )
            self.assertEqual([], validate_model(load_model(root)))

    def test_roleized_confirmation_core_is_valid_without_registered_player(
        self,
    ) -> None:
        model = load_model(self.fixture("valid-roleized-payment-core"))
        self.assertEqual([], validate_model(model))
        role_id = "role.content-payment-confirmation"
        fulfillment = model.fulfillments_by_id["fulfillment.content-payment"]
        self.assertEqual([role_id], fulfillment["confirmationRefs"])
        incoming = [
            relation
            for relation in model.relationships
            if relation.get("kind") == "plays_role"
            and relation.get("targetRef") == role_id
        ]
        self.assertEqual([], incoming)

    def test_roleized_payment_extension_keeps_provider_unmaterialized(self) -> None:
        model = load_model(self.fixture("valid-roleized-payment"))
        self.assertEqual([], validate_model(model))
        self.assertNotIn("party.external-payment-provider", model.entities_by_id)
        customer_targets = {
            relation["targetRef"]
            for relation in model.relationships
            if relation.get("kind") == "plays_role"
            and relation.get("sourceRef") == "party.customer"
        }
        self.assertTrue(
            {"role.subscriber", "role.external-payment-customer"}.issubset(
                customer_targets
            )
        )
        payment_players = {
            relation["sourceRef"]
            for relation in model.relationships
            if relation.get("kind") == "plays_role"
            and relation.get("targetRef") == "role.content-payment-confirmation"
        }
        self.assertEqual(
            {"confirmation.external-payment", "confirmation.prepaid-payment"},
            payment_players,
        )

    def test_adding_payment_channels_does_not_mutate_core_objects(self) -> None:
        core = load_model(self.fixture("valid-roleized-payment-core"))
        extended = load_model(self.fixture("valid-roleized-payment"))
        self.assertEqual([], validate_model(core))
        self.assertEqual([], validate_model(extended))
        for object_id, document in core.entities_by_id.items():
            self.assertEqual(document, extended.entities_by_id[object_id], object_id)
        for object_id, document in core.fulfillments_by_id.items():
            self.assertEqual(
                document, extended.fulfillments_by_id[object_id], object_id
            )
        for object_id, document in core.relationships_by_id.items():
            self.assertEqual(
                document, extended.relationships_by_id[object_id], object_id
            )
        for object_id, document in core.rules_by_id.items():
            self.assertEqual(document, extended.rules_by_id[object_id], object_id)

    def test_multi_contract_content_platform_fixture_has_three_contracts_and_nine_fulfillments(
        self,
    ) -> None:
        model = load_model(self.fixture("valid-content-platform"))
        self.assertEqual([], validate_model(model))
        contracts = [
            entity
            for entity in model.entities
            if (entity.get("category"), entity.get("kind")) == ("evidence", "contract")
        ]
        self.assertEqual(3, len(contracts))
        self.assertEqual(9, len(model.fulfillments))
        fulfillment_contexts = [
            entity
            for entity in model.entities
            if (entity.get("category"), entity.get("kind"))
            == ("context", "fulfillment")
        ]
        self.assertEqual(9, len(fulfillment_contexts))
        self.assertEqual(1, len(model.business_patterns))
        self.assertIn("party.customer", model.entities_by_id)
        self.assertNotIn("party.subscriber", model.entities_by_id)

    def test_missing_confirmation_fails(self) -> None:
        model = load_model(self.fixture("invalid-missing-confirmation"))
        errors = validate_model(model)
        self.assertTrue(
            any(
                "confirmationRef 'confirmation.content-payment' must reference "
                "Fulfillment Confirmation or Evidence Role" in error
                for error in errors
            ),
            errors,
        )

    def test_request_cannot_play_evidence_role(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-roleized-payment-core", directory)
            self.write_yaml(
                root / "relationships" / "relation--request-plays-payment.yaml",
                {
                    "type": "relationship",
                    "id": "relation.request-plays-payment",
                    "kind": "plays_role",
                    "sourceRef": "request.content-payment",
                    "targetRef": "role.content-payment-confirmation",
                    "label": "错误地让请求扮演确认",
                },
            )
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("invalid plays_role" in error for error in errors), errors
            )

    def test_evidence_role_player_must_come_from_another_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-roleized-payment-core", directory)
            self.write_yaml(
                root / "entities" / "confirmation--local-payment.yaml",
                {
                    "type": "entity",
                    "id": "confirmation.local-payment",
                    "category": "evidence",
                    "kind": "fulfillment_confirmation",
                    "label": "本上下文付款确认",
                    "contextRef": "context.content-payment-fulfillment",
                    "responsibleRoleRef": "role.subscriber",
                },
            )
            self.write_yaml(
                root / "relationships" / "relation--local-payment-plays-payment.yaml",
                {
                    "type": "relationship",
                    "id": "relation.local-payment-plays-payment",
                    "kind": "plays_role",
                    "sourceRef": "confirmation.local-payment",
                    "targetRef": "role.content-payment-confirmation",
                    "label": "本上下文确认错误扮演同上下文角色",
                },
            )
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("must come from another Context" in error for error in errors),
                errors,
            )

    def test_evidence_role_rejects_redundant_source_evidence_refs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-roleized-payment-core", directory)
            path = root / "entities" / "role--content-payment-confirmation.yaml"
            evidence_role = self.read_yaml(path)
            evidence_role["sourceEvidenceRefs"] = ["confirmation.external-payment"]
            self.write_yaml(path, evidence_role)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("sourceEvidenceRefs" in error for error in errors), errors
            )

    def test_participant_place_can_be_a_fulfillment_subject(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            self.write_yaml(
                root / "entities" / "place--reading-site.yaml",
                {
                    "type": "entity",
                    "id": "place.reading-site",
                    "category": "participant",
                    "kind": "place",
                    "label": "阅读场所",
                    "contextRef": "context.cms",
                },
            )
            path = root / "fulfillments" / "fulfillment--content-payment.yaml"
            payment = self.read_yaml(path)
            payment["subjectRefs"] = ["place.reading-site"]
            self.write_yaml(path, payment)
            self.assertEqual([], validate_model(load_model(root)))

    def test_contract_requires_exactly_two_roles(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "entities" / "contract--content-subscription.yaml"
            contract = self.read_yaml(path)
            contract["roleRefs"] = ["role.subscriber"]
            self.write_yaml(path, contract)
            errors = validate_model(load_model(root))
            self.assertTrue(any("roleRefs" in error for error in errors), errors)

    def test_cel_assignment_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "rules" / "rule--payment-deadline.yaml"
            rule = self.read_yaml(path)
            rule["expression"] = 'expiresAt = self.startedAt + duration("30m")'
            self.write_yaml(path, rule)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("must not contain assignment" in error for error in errors), errors
            )

    def test_automatic_trigger_must_act_for_expected_business_role(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "fulfillments" / "fulfillment--content-payment.yaml"
            payment = self.read_yaml(path)
            payment["requestTrigger"]["actsForRoleRef"] = "role.subscriber"
            self.write_yaml(path, payment)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("requestTrigger.actsForRoleRef" in error for error in errors),
                errors,
            )

    def test_shared_confirmation_requires_rationale_on_every_owner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            request_path = root / "entities" / "request--content-payment.yaml"
            second_request = copy.deepcopy(self.read_yaml(request_path))
            second_request["id"] = "request.content-payment-audit"
            second_request["label"] = "内容产品付款审计请求"
            for item in second_request.get("attributes", []):
                item.pop("derivedByRuleRef", None)
            self.write_yaml(
                root / "entities" / "request--content-payment-audit.yaml",
                second_request,
            )

            fulfillment_path = (
                root / "fulfillments" / "fulfillment--content-payment.yaml"
            )
            first = self.read_yaml(fulfillment_path)
            second = copy.deepcopy(first)
            second["id"] = "fulfillment.content-payment-audit"
            second["label"] = "内容产品付款审计履约"
            second["requestRef"] = "request.content-payment-audit"
            self.write_yaml(
                root / "fulfillments" / "fulfillment--content-payment-audit.yaml",
                second,
            )

            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "requires sharedConfirmationRationale" in error for error in errors
                ),
                errors,
            )
            rationale = "同一不可变付款凭证等价证明付款和付款审计责任。"
            first["sharedConfirmationRationale"] = rationale
            second["sharedConfirmationRationale"] = rationale
            self.write_yaml(fulfillment_path, first)
            self.write_yaml(
                root / "fulfillments" / "fulfillment--content-payment-audit.yaml",
                second,
            )
            self.assertEqual([], validate_model(load_model(root)))

    def test_count_completion_accepts_repeated_confirmation_instances(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            fulfillment_path = (
                root / "fulfillments" / "fulfillment--content-payment.yaml"
            )
            payment = self.read_yaml(fulfillment_path)
            payment["completionPolicy"] = {
                "mode": "count",
                "minimumConfirmations": 3,
                "completionRuleRef": "rule.three-payment-confirmations",
            }
            self.write_yaml(fulfillment_path, payment)
            rule_path = root / "rules" / "rule--three-payment-confirmations.yaml"
            self.write_yaml(
                rule_path,
                {
                    "type": "rule",
                    "id": "rule.three-payment-confirmations",
                    "kind": "completion",
                    "label": "三次付款确认完成履约",
                    "contextRef": "context.content-payment-fulfillment",
                    "expression": "confirmations.filter(c, c.accepted).size() >= 3",
                    "resultType": "bool",
                    "bindings": {"confirmations": {"type": "list"}},
                },
            )
            self.assertEqual([], validate_model(load_model(root)))
            rule = self.read_yaml(rule_path)
            rule["expression"] += " && c.accepted"
            self.write_yaml(rule_path, rule)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("identifiers ['c']" in error for error in errors), errors
            )

    def test_fulfillment_requires_child_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "fulfillments" / "fulfillment--content-payment.yaml"
            payment = self.read_yaml(path)
            payment["contextRef"] = "context.content-subscription"
            self.write_yaml(path, payment)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "contextRef must reference a Fulfillment Context" in error
                    for error in errors
                ),
                errors,
            )

    def test_fulfillment_rules_stay_in_child_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            for filename in (
                "rule--payment-deadline.yaml",
                "rule--payment-expired.yaml",
            ):
                path = root / "rules" / filename
                rule = self.read_yaml(path)
                rule["contextRef"] = "context.content-subscription"
                self.write_yaml(path, rule)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "derivation Rule must belong to the target Entity Context" in error
                    for error in errors
                ),
                errors,
            )
            self.assertTrue(
                any("breach Rule must belong" in error for error in errors), errors
            )

    def test_request_interval_requires_timestamp_key_data(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            request_path = root / "entities" / "request--content-payment.yaml"
            request = self.read_yaml(request_path)
            started_at = next(
                attribute
                for attribute in request["attributes"]
                if attribute["name"] == "startedAt"
            )
            started_at["keyData"] = False
            self.write_yaml(request_path, request)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "requestInterval.startAttribute must reference keyData" in error
                    for error in errors
                ),
                errors,
            )

    def test_open_ended_request_interval_requires_explicit_reason(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "fulfillments" / "fulfillment--content-payment.yaml"
            payment = self.read_yaml(path)
            payment["requestInterval"] = {
                "startAttribute": "startedAt",
                "openEndedReason": "合同约定持续履行，直到一方发出终止通知。",
            }
            self.write_yaml(path, payment)
            self.assertEqual([], validate_model(load_model(root)))

            payment["requestInterval"] = {"startAttribute": "startedAt"}
            self.write_yaml(path, payment)
            errors = validate_model(load_model(root))
            self.assertTrue(any("requestInterval" in error for error in errors), errors)

    def test_participant_thing_must_belong_to_domain_context(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "entities" / "thing--content.yaml"
            thing = self.read_yaml(path)
            thing["contextRef"] = "context.content-subscription"
            self.write_yaml(path, thing)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "Participant Thing must belong to a Domain Context" in error
                    for error in errors
                ),
                errors,
            )

    def test_business_pattern_needs_two_domains_before_supported(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-content-platform", directory)
            pattern_path = (
                root / "business-patterns" / "pattern--paid-content-operation.yaml"
            )
            pattern = self.read_yaml(pattern_path)
            pattern["reuseStatus"] = "supported"
            self.write_yaml(pattern_path, pattern)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "requires at least two Domain Context examples" in error
                    for error in errors
                ),
                errors,
            )

            self.write_yaml(
                root / "entities" / "context--video-domain.yaml",
                {
                    "type": "entity",
                    "id": "context.video-domain",
                    "category": "context",
                    "kind": "domain",
                    "label": "视频领域上下文",
                    "rootRefs": ["thing.video"],
                },
            )
            pattern["domainExampleContextRefs"].append("context.video-domain")
            self.write_yaml(pattern_path, pattern)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "Domain examples lack referenced Domain inputs" in error
                    for error in errors
                ),
                errors,
            )

            self.write_yaml(
                root / "entities" / "thing--video.yaml",
                {
                    "type": "entity",
                    "id": "thing.video",
                    "category": "participant",
                    "kind": "thing",
                    "label": "视频",
                    "contextRef": "context.video-domain",
                },
            )
            pattern["domainInputRefs"].append("thing.video")
            self.write_yaml(pattern_path, pattern)
            self.assertEqual([], validate_model(load_model(root)))

            pattern["reuseStatus"] = "confirmed"
            self.write_yaml(pattern_path, pattern)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("confirmed reuse requires" in error for error in errors), errors
            )

            pattern["stakeholderReview"] = {
                "status": "confirmed",
                "reviewer": "业务平台主管",
                "reviewedAt": "2026-09-04T12:00:00+08:00",
            }
            self.write_yaml(pattern_path, pattern)
            self.assertEqual([], validate_model(load_model(root)))

    def test_optional_empty_directories_may_be_absent(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            shutil.rmtree(root / "relationships")
            shutil.rmtree(root / "rules")
            request_path = root / "entities" / "request--content-payment.yaml"
            request = self.read_yaml(request_path)
            for attribute in request["attributes"]:
                attribute.pop("derivedByRuleRef", None)
            self.write_yaml(request_path, request)
            fulfillment_path = (
                root / "fulfillments" / "fulfillment--content-payment.yaml"
            )
            fulfillment = self.read_yaml(fulfillment_path)
            fulfillment.pop("breaches", None)
            self.write_yaml(fulfillment_path, fulfillment)
            self.assertEqual([], validate_model(load_model(root)))

    def test_schema_v2_manifest_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "model.yaml"
            manifest = self.read_yaml(path)
            manifest["schemaVersion"] = "2.0"
            self.write_yaml(path, manifest)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("'3.0' was expected" in error for error in errors), errors
            )

    def test_confirmed_model_requires_named_stakeholder_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copied_fixture("valid-subscription", directory)
            path = root / "model.yaml"
            manifest = self.read_yaml(path)
            manifest["modelStatus"] = "confirmed"
            self.write_yaml(path, manifest)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "confirmed status requires stakeholderReview" in error
                    for error in errors
                ),
                errors,
            )

            manifest["stakeholderReview"] = {
                "status": "confirmed",
                "reviewer": "业务负责人",
                "reviewedAt": "not-a-timestamp",
            }
            self.write_yaml(path, manifest)
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("must be an RFC 3339 timestamp" in error for error in errors),
                errors,
            )

            manifest["stakeholderReview"]["reviewedAt"] = "2026-09-04T12:00:00+08:00"
            self.write_yaml(path, manifest)
            self.assertEqual([], validate_model(load_model(root)))

    def test_business_pattern_markdown_is_deterministic(self) -> None:
        model = load_model(self.fixture("valid-content-platform"))
        self.assertEqual([], validate_model(model))
        first = render_business_patterns(model)
        second = render_business_patterns(model)
        self.assertEqual(first, second)
        self.assertIn("付费内容运营模式", first)
        self.assertIn("<!-- Generated by build_fm_business_patterns.py", first)

    def test_compiled_document_is_deterministic(self) -> None:
        model = load_model(self.fixture("valid-content-platform"))
        self.assertEqual([], validate_model(model))
        first_document = compiled_document(model)
        self.assertEqual("3.0", first_document["schemaVersion"])
        self.assertEqual(1, len(first_document["businessPatterns"]))
        first = json.dumps(first_document, ensure_ascii=False, sort_keys=True)
        second = json.dumps(
            compiled_document(model), ensure_ascii=False, sort_keys=True
        )
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
