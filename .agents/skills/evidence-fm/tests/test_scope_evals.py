from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from context_samples import (
    channel_documents,
    domain_documents,
    performance_documents,
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

    def test_non_fulfillment_scopes_pass_without_vacuous_fulfillment_requirement(
        self,
    ) -> None:
        for eval_id, documents, entry in [
            (15, domain_documents(), "context.customer-information"),
            (16, channel_documents(), "context.sales-channel"),
        ]:
            with (
                self.subTest(eval_id=eval_id),
                tempfile.TemporaryDirectory() as directory,
            ):
                result = self.grade_sample(Path(directory), eval_id, documents, entry)
                self.assertEqual(
                    result["total"], result["passed"], result["expectations"]
                )

    def test_fulfillment_scenario_still_requires_actual_fulfillment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 17, channel_documents(), "context.sales-channel"
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
                    item for item in documents if item["type"] == "fulfillment"
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
                request = model.entities_by_id[target["requestRef"]]
                confirmation = model.entities_by_id[target["confirmationRefs"][0]]
                self.assertEqual(
                    "role.employee" if employee_initiates else "role.manager",
                    request["responsibleRoleRef"],
                )
                self.assertEqual(
                    "role.manager" if employee_initiates else "role.employee",
                    confirmation["responsibleRoleRef"],
                )
                reviews.append(model.fulfillments_by_id["fulfillment.progress-review"])
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
        review = next(
            item for item in documents if item["id"] == "fulfillment.progress-review"
        )
        review["subjectRefs"] = ["thing.customer-profile"]
        with tempfile.TemporaryDirectory() as directory:
            result = self.grade_sample(
                Path(directory), 19, documents, "context.performance"
            )
            self.assertEqual(result["total"], result["passed"], result["expectations"])

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
