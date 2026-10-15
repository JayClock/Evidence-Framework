"""Confirmed method contracts and schema-valid teaching examples, not live agent evals."""

import copy
import json
import re
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError

SKILL = Path(__file__).resolve().parents[1]
SCHEMAS = {
    "fm_model": "model.schema.json",
    "entity": "entity.schema.json",
    "relationship": "relationship.schema.json",
    "rule": "rule.schema.json",
    "evidence_instance": "evidence-instance.schema.json",
    "fm_scenario": "scenario.schema.json",
}


def json_examples(path):
    """Check typed FM sources, not isolated field fragments."""
    for match in re.finditer(r"```json\s*\n(.*?)\n```", path.read_text(), re.S):
        document = json.loads(match[1])
        if isinstance(document, dict) and "type" in document:
            yield document


class ReferenceConsistencyTests(unittest.TestCase):
    def test_complete_markdown_json_examples_conform_to_their_schemas(self):
        count = 0
        for folder in ("references", "examples"):
            for path in sorted((SKILL / folder).rglob("*.md")):
                for document in json_examples(path):
                    count += 1
                    with self.subTest(path=str(path.relative_to(SKILL)), id=document.get("id")):
                        document_type = document["type"]
                        self.assertIn(document_type, SCHEMAS)
                        schema = json.loads((SKILL / "schemas" / SCHEMAS[document_type]).read_text())
                        Draft202012Validator(schema).validate(document)
        self.assertGreater(count, 0)

    def test_rule_schema_still_rejects_a_missing_business_description(self):
        rule = next(json_examples(SKILL / "references/cel-rules.md"))
        incomplete = copy.deepcopy(rule)
        incomplete.pop("description")
        schema = json.loads((SKILL / "schemas/rule.schema.json").read_text())
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema).validate(incomplete)

    def test_cel_example_separates_context_from_fulfillment_membership(self):
        rule = next(json_examples(SKILL / "references/cel-rules.md"))
        self.assertEqual("context.subscription", rule["contextRef"])
        self.assertEqual("fulfillment.payment", rule.get("fulfillmentRef"))

    def test_rule_explanations_keep_canonical_names_separate_from_ids(self):
        reference = (SKILL / "references/cel-rules.md").read_text()
        self.assertNotIn("中文名称（具体 Entity ID）", reference)
        self.assertIn("付款请求（Payment Request）[request.payment]", reference)
        for model_name in ("domain", "valid-traceable-subscription"):
            root = SKILL / "examples" / model_name
            entities = {item["id"]: item for path in (root / "entities").glob("*.json")
                        if (item := json.loads(path.read_text()))}
            for path in (root / "rules").glob("*.json"):
                rule = json.loads(path.read_text())
                with self.subTest(rule=rule["id"]):
                    description = rule["description"]
                    self.assertNotRegex(description, r"（(?:request|confirmation|contract|fulfillment|thing|role)\.[^）]+）")
                    refs = re.findall(r"\[([a-z][a-z0-9.-]+)\]", description)
                    self.assertTrue(refs, description)
                    for ref in refs:
                        label = entities[ref]["label"]
                        self.assertRegex(label, r".+（[A-Za-z][^（）]*）$")
                        self.assertIn(f"{label}[{ref}]", description)

    def test_independent_domain_eval_has_its_own_closure_not_a_global_blocker(self):
        catalog = json.loads((SKILL / "evals/behavior.json").read_text())
        cases = {case["id"]: case for case in catalog["evals"]}
        domain = cases[9]
        self.assertEqual("closed-domain-with-open-contract", domain["category"])
        self.assertIn("本分支澄清结束", domain["prompt"])
        self.assertIn("没有适用履约责任", domain["prompt"])
        expectations = "\n".join(domain["expectations"])
        self.assertIn("不等待", expectations)
        self.assertNotIn("档案部分也不进入正式建模", expectations)
        self.assertIn("合同级结束确认", "\n".join(cases[4]["expectations"]))

    def test_patterns_distinguish_capabilities_results_and_reference_direction(self):
        text = (SKILL / "references/patterns.md").read_text()
        for retired in ("不展开其合同内部结构时，建立独立 `third_party` Role",
                        "真正关闭当前责任的结果才是 Confirmation",
                        "分批履约仍只建一个 Confirmation 类型",
                        "建立 Proposal→Contract 审计追溯"):
            self.assertNotIn(retired, text)
        for phrase in ("不同 Confirmation 类型", "部分完成", "Contract→Proposal",
                       "外部能力不默认对应合同"):
            self.assertIn(phrase, text)

    def test_request_and_confirmation_responsibility_belongs_to_contract_parties(self):
        text = (SKILL / "references/business-analysis.md").read_text()
        self.assertIn("责任人就是所属合同的一方", text)
        self.assertIn("请求责任人：平台方（Platform Party），为合同一方", text)
        self.assertIn("确认责任人：按约定由作者（Author）", text)
        self.assertIn("经办人、上传人和证明提供方", text)
        self.assertIn("不在双方之外另寻凭证责任角色", text)

    def test_scope_review_warns_about_omissions_not_candidate_contracts(self):
        text = (SKILL / "references/responsibility-closure.md").read_text()
        self.assertNotIn("Agent 可以展示候选和遗漏风险", text)
        self.assertIn("责任遗漏", text)
        self.assertIn("不展示供用户筛选的候选合同", text)


if __name__ == "__main__":
    unittest.main()
