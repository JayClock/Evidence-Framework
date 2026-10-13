from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from context_samples import (
    domain_documents,
    performance_documents,
    performance_fulfillment,
    precontract_documents,
    write_model,
)

SKILL_DIR = Path(__file__).resolve().parents[1]
EVAL_DIR = SKILL_DIR / "evals"
sys.path.insert(0, str(SKILL_DIR / "scripts"))
sys.path.insert(0, str(EVAL_DIR))

from fm_model import (  # type: ignore[import-not-found]  # noqa: E402
    compiled_document,
    load_model,
    validate_model,
)
from run_modeling_evals import (  # type: ignore[import-not-found]  # noqa: E402
    eval_root,
    grade,
    grade_context_scope,
    prepare,
)


class ScopeEvalTests(unittest.TestCase):
    def item(self, eval_id: int) -> dict:
        payload = json.loads((EVAL_DIR / "evals.json").read_text(encoding="utf-8"))
        return next(item for item in payload["evals"] if item["id"] == eval_id)

    def grade_sample(
        self, workspace: Path, eval_id: int, documents: list[dict], entry: str
    ) -> dict:
        item = self.item(eval_id)
        root = eval_root(workspace, item) / "with_skill" / "outputs" / "fm-model"
        write_model(root, documents, entry)
        model = load_model(root)
        self.assertEqual([], validate_model(model))
        (root / "generated").mkdir()
        (root / "generated" / "model.json").write_text(
            json.dumps(compiled_document(model)), encoding="utf-8"
        )
        return grade(item, workspace, "with_skill")

    def test_domain_generation_passes_without_vacuous_fulfillment_requirement(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 15, domain_documents(), "context.customer-information"
            )
            self.assertEqual(result["total"], result["passed"], result["expectations"])

    def test_precontract_structure_remains_valid_independently_of_edit_admission(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory), precontract_documents(), "context.sales-inquiry"
            )
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            expectations = []
            grade_context_scope(16, model, expectations)
            self.assertTrue(expectations)
            self.assertTrue(all(item.passed for item in expectations), expectations)

    def blocked_output(self, workspace: Path, eval_id: int) -> Path:
        output = eval_root(workspace, self.item(eval_id)) / "with_skill" / "outputs"
        output.mkdir(parents=True)
        explanation = (
            "询价报价的截止依据未提供；合同双方角色与责任、完成确认凭证、履约期限和违约异常均缺依据。"
            "缺少合同级或相应分支的人类追责结束确认，未生成模型、规则或场景，未执行校验与编译。"
        )
        (output / "response.md").write_text(explanation, encoding="utf-8")
        return output

    def test_blocked_cases_accept_gap_explanations_without_discovery_artifacts(self) -> None:
        for eval_id in (13, 16):
            with self.subTest(eval_id=eval_id), tempfile.TemporaryDirectory() as directory:
                workspace = Path(directory)
                self.blocked_output(workspace, eval_id)
                result = grade(self.item(eval_id), workspace, "with_skill")
                self.assertEqual(result["total"], result["passed"], result["expectations"])

    def test_blocked_cases_reject_generated_models_even_without_review_status(self) -> None:
        for eval_id in (13, 16):
            with self.subTest(eval_id=eval_id), tempfile.TemporaryDirectory() as directory:
                workspace = Path(directory)
                output = self.blocked_output(workspace, eval_id)
                write_model(output / "fm-model", domain_documents(), "context.customer-information")
                (output / "discovery").mkdir()
                (output / "discovery/open-questions.md").write_text("合同责任确认期限违约")
                result = grade(self.item(eval_id), workspace, "with_skill")
                rejection = next(item for item in result["expectations"]
                                 if item["text"] == "Blocked scope produces no formal FM artifacts.")
                self.assertFalse(rejection["passed"])

    def test_blocked_cases_reject_partial_rules_scenarios_and_compiled_output(self) -> None:
        for relative, content in (
            ("rules/rule.json", {"type": "rule"}),
            ("loose-rule.json", {"type": "rule"}),
            ("validation/scenario.json", {}),
            ("generated/model.json", {}),
            ("model.json", {}),
        ):
            with self.subTest(path=relative), tempfile.TemporaryDirectory() as directory:
                workspace = Path(directory)
                output = self.blocked_output(workspace, 13)
                target = output / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(json.dumps(content))
                result = grade(self.item(13), workspace, "with_skill")
                rejection = next(item for item in result["expectations"]
                                 if item["text"] == "Blocked scope produces no formal FM artifacts.")
                self.assertFalse(rejection["passed"])

    def test_blocked_cases_require_an_explanation_not_only_empty_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = grade(self.item(16), Path(directory), "with_skill")
            self.assertLess(result["passed"], result["total"])

    def test_eval_preparation_preserves_current_prompt_and_outcome(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            item = self.item(16)
            prepare(item, workspace, "with_skill")
            root = eval_root(workspace, item)
            self.assertEqual(item["prompt"] + "\n", (root / "prompt.md").read_text())
            metadata = json.loads((root / "eval_metadata.json").read_text())
            self.assertEqual("blocked", metadata["outcome"])
            self.assertNotIn("$modeling", item["prompt"])

    def test_fulfillment_scenario_still_requires_actual_fulfillment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 17, precontract_documents(), "context.sales-inquiry"
            )
            presence = next(
                item
                for item in result["expectations"]
                if item["text"]
                == "This scenario includes at least one actual Fulfillment."
            )
            self.assertFalse(presence["passed"])

    def test_domain_eval_rejects_thing_list_without_relations_or_rules(self) -> None:
        documents = [item for item in domain_documents() if item["type"] == "entity"]
        for item in documents:
            for attribute in item.get("attributes", []):
                attribute.pop("derivedByRuleRef", None)
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 15, documents, "context.customer-information"
            )
            coverage = next(
                item
                for item in result["expectations"]
                if item["text"].startswith("Domain is more than")
            )
            self.assertFalse(coverage["passed"])

    def test_kpi_negotiation_and_change_use_same_fulfillment_schema(self) -> None:
        for eval_id, change in [(17, False), (18, True)]:
            with (
                self.subTest(eval_id=eval_id),
                tempfile.TemporaryDirectory() as directory,
            ):
                documents = performance_documents(change)
                result = self.grade_sample(
                    Path(directory), eval_id, documents, "context.performance"
                )
                self.assertEqual(
                    result["total"], result["passed"], result["expectations"]
                )
                fulfillments = [
                    item
                    for item in documents
                    if item.get("category") == "fulfillment"
                ]
                self.assertEqual(2 if change else 1, len(fulfillments))

    def test_manager_and_employee_target_initiation_reverse_only_target_roles(
        self,
    ) -> None:
        reviews = []
        for employee_initiates in (False, True):
            with (
                self.subTest(employee_initiates=employee_initiates),
                tempfile.TemporaryDirectory() as directory,
            ):
                root = write_model(
                    Path(directory),
                    performance_documents(True, employee_initiates),
                    "context.performance",
                )
                model = load_model(root)
                self.assertEqual([], validate_model(model))
                target = model.fulfillments_by_id["fulfillment.target-change"]
                members = [
                    item
                    for item in model.entities
                    if item.get("fulfillmentRef") == target["id"]
                ]
                request = next(
                    item for item in members if item["kind"] == "fulfillment_request"
                )
                confirmation = next(
                    item
                    for item in members
                    if item["kind"] == "fulfillment_confirmation"
                )
                self.assertEqual(
                    "role.employee" if employee_initiates else "role.manager",
                    request["responsibleRoleRef"],
                )
                self.assertEqual(
                    "role.manager" if employee_initiates else "role.employee",
                    confirmation["responsibleRoleRef"],
                )
                reviews.append(
                    model.fulfillments_by_id["fulfillment.progress-review"]
                )
        self.assertEqual(reviews[0], reviews[1])

    def test_target_initiation_eval_rejects_wrong_but_structurally_valid_direction(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory),
                18,
                performance_documents(True, False),
                "context.performance",
            )
            direction = next(
                item
                for item in result["expectations"]
                if item["text"].startswith("Target change reverses")
            )
            self.assertFalse(direction["passed"])

    def test_crm_composes_domain_inputs_without_fabricating_parties(self) -> None:
        documents = [
            item
            for item in domain_documents()
            if item["id"] not in {"party.customer", "relation.customer-owns-profile"}
        ]
        documents.extend(performance_documents(False, negotiate_before_signing=False))
        documents.append(
            {
                "type": "relationship",
                "id": "relation.progress-review-references-profile",
                "kind": "references",
                "sourceRef": "request.progress-review",
                "targetRef": "thing.customer-profile",
                "label": "进度检查请求涉及客户档案",
            }
        )
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 19, documents, "context.performance"
            )
            self.assertEqual(result["total"], result["passed"], result["expectations"])

    def test_membership_payment_uses_current_source_name_not_a_purchase_alias(self) -> None:
        documents = performance_documents(False, negotiate_before_signing=False)[:4]
        for suffix, label in (
            ("payment", "付款"), ("activation", "权益开通"), ("refund", "退款")
        ):
            documents.extend(
                performance_fulfillment(suffix, label, "role.manager", "role.employee")
            )
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 0, documents, "context.performance"
            )
            coverage = next(
                item for item in result["expectations"]
                if item["text"] == "Purchase, activation, and refund are explicit Fulfillments."
            )
            self.assertTrue(coverage["passed"])

    def test_automatic_trigger_does_not_turn_system_into_a_business_role(self) -> None:
        documents = json.loads(
            json.dumps(performance_documents(False, negotiate_before_signing=False))
            .replace("role.employee", "role.system")
        )
        next(item for item in documents if item["id"] == "role.system")["label"] = "系统"
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 8, documents, "context.performance"
            )
            restriction = next(
                item for item in result["expectations"]
                if item["text"].startswith("System/scheduler is not modeled")
            )
            self.assertFalse(restriction["passed"])

    def test_simple_tool_no_model_is_a_successful_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            item = self.item(6)
            output = eval_root(workspace, item) / "with_skill" / "outputs"
            output.mkdir(parents=True)
            (output / "analysis.md").write_text(
                "只是简单集成，无独立领域规则，不需要建模。", encoding="utf-8"
            )
            result = grade(item, workspace, "with_skill")
            self.assertEqual(result["total"], result["passed"])


if __name__ == "__main__":
    unittest.main()
