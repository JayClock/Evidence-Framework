"""Business names are snake_case; FM protocol keys and CEL aliases are not renamed."""

from __future__ import annotations

import copy
import json
import re
import sys
import unittest
from pathlib import Path

from context_samples import (
    domain_documents,
    performance_documents,
    precontract_documents,
)

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    load_model,
    validate_against_schema,
    validate_entities,
)


def errors_for(document: dict, schema: str) -> list[str]:
    errors: list[str] = []
    validate_against_schema(document, schema + ".schema.json", "test.json", errors)
    return errors


def entity_with(name: str, category="participant", kind="thing") -> dict:
    return {
        "type": "entity",
        "id": "thing.sample",
        "category": category,
        "kind": kind,
        "label": "合成命名测试",
        "contextRef": "context.sample",
        "attributes": [
            {
                "name": name,
                "label": "属性",
                "valueType": "int",
                "required": True,
                "keyData": True,
                "meaning": "合成测试属性",
            }
        ],
    }


class AttributeNamingTests(unittest.TestCase):
    def test_entity_schema_accepts_only_lower_snake_case(self):
        for name in ("amount", "paid_minor_units", "sha256", "address_line_2"):
            with self.subTest(valid=name):
                self.assertEqual([], errors_for(entity_with(name), "entity"))
        for name in (
            "paidMinorUnits",
            "Paid",
            "_amount",
            "amount_",
            "a__b",
            "1st",
            "a-b",
            "金额",
            " amount",
        ):
            with self.subTest(invalid=name):
                self.assertTrue(errors_for(entity_with(name), "entity"))

    def test_in_memory_names_checked_for_all_categories_without_normalizing(self):
        for category, kind in (
            ("participant", "thing"),
            ("context", "domain"),
            ("role", "domain"),
            ("evidence", "other_evidence"),
        ):
            for name in ("paidMinorUnits", " amount", "a__b"):
                with self.subTest(category=category, name=name):
                    document = entity_with(name, category, kind)
                    before = copy.deepcopy(document)
                    errors: list[str] = []
                    validate_entities([document], {}, {}, errors)
                    self.assertTrue(
                        any("snake_case" in error for error in errors), errors
                    )
                    self.assertEqual(before, document)

    def test_rule_target_is_snake_case_but_cel_alias_and_protocol_stay_camel_case(self):
        rule = {
            "type": "rule",
            "id": "rule.amount",
            "kind": "derivation",
            "label": "计算金额",
            "description": "读取金额来源（thing.sample）的已付金额，并将其作为合成测试对象的总金额。",
            "contextRef": "context.sample",
            "bindings": {"amountSource": {"ref": "thing.sample"}},
            "expression": "amountSource.paid_minor_units",
            "resultType": "int",
            "target": {"entityRef": "thing.sample", "attribute": "total_amount"},
        }
        self.assertEqual([], errors_for(rule, "rule"))
        rule["target"]["attribute"] = "totalAmount"
        self.assertTrue(errors_for(rule, "rule"))

    def test_rule_description_is_required(self):
        rule = {
            "type": "rule",
            "id": "rule.editable",
            "kind": "precondition",
            "label": "未归档对象可编辑",
            "description": "对象（thing.sample）尚未归档时允许编辑；已经归档时拒绝编辑。",
            "contextRef": "context.sample",
            "bindings": {"item": {"ref": "thing.sample"}},
            "expression": "!item.archived",
            "resultType": "bool",
        }
        self.assertEqual([], errors_for(rule, "rule"))
        del rule["description"]
        self.assertTrue(errors_for(rule, "rule"))

    def test_bundled_rule_descriptions_reference_concrete_entities(self):
        fixture_roots = [
            Path(__file__).resolve().parent / "fixtures",
            SKILL / "evals" / "fixtures",
        ]
        for fixtures in fixture_roots:
            for manifest in fixtures.glob("*/model.json"):
                model = load_model(manifest.parent)
                entity_ids = {entity["id"] for entity in model.entities}
                for rule in model.rules:
                    with self.subTest(model=manifest.parent.name, rule=rule["id"]):
                        description = rule["description"]
                        self.assertNotRegex(
                            description,
                            r"（(?:Request|Confirmation|Contract|Fulfillment|Evidence Role)）",
                        )
                        refs = re.findall(r"（([a-z][a-z0-9.-]+)）", description)
                        self.assertTrue(refs, description)
                        self.assertTrue(
                            set(refs) <= entity_ids, (description, entity_ids)
                        )

    def test_instance_keys_are_snake_case_but_free_map_payload_is_unchanged(self):
        instance = {
            "type": "evidence_instance",
            "id": "instance.sample",
            "entityRef": "evidence.sample",
            "values": {
                "paid_minor_units": 100,
                "external_data": {"externalId": "original"},
            },
        }
        self.assertEqual([], errors_for(instance, "evidence-instance"))
        instance["values"]["paidMinorUnits"] = 100
        self.assertTrue(errors_for(instance, "evidence-instance"))

    def test_lineage_schema_checks_both_attribute_and_path_suffix(self):
        node = {
            "path": "thing.sample#paid_minor_units",
            "entityRef": "thing.sample",
            "attribute": "paid_minor_units",
            "valueType": "int",
            "keyData": True,
            "origin": "asserted",
        }
        report = {
            "schemaVersion": "3.0",
            "modelId": "sample",
            "nodes": [node],
            "edges": [],
            "constraints": [],
        }
        self.assertEqual([], errors_for(report, "traceability"))
        for patch in (
            {"attribute": "paidMinorUnits"},
            {"path": "thing.sample#paidMinorUnits"},
        ):
            bad = copy.deepcopy(report)
            bad["nodes"][0].update(patch)
            self.assertTrue(errors_for(bad, "traceability"))

    def test_bundled_examples_follow_attribute_key_order(self):
        order = [
            "name",
            "label",
            "valueType",
            "required",
            "keyData",
            "meaning",
            "derivedByRuleRef",
            "notes",
        ]
        documents = (
            domain_documents() + precontract_documents() + performance_documents(True)
        )
        for path in (Path(__file__).resolve().parent / "fixtures").glob(
            "valid-*/entities/*.json"
        ):
            documents.append(json.loads(path.read_text(encoding="utf-8")))
        for document in documents:
            for attribute in document.get("attributes", []):
                with self.subTest(entity=document["id"], attribute=attribute["name"]):
                    self.assertEqual(
                        [key for key in order if key in attribute], list(attribute)
                    )

    def test_mapping_key_order_is_not_a_semantic_constraint(self):
        document = entity_with("paid_minor_units")
        document["attributes"][0] = dict(reversed(document["attributes"][0].items()))
        self.assertEqual([], errors_for(document, "entity"))
