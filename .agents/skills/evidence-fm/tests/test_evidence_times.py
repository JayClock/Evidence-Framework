"""Evidence-kind time contracts: explicit YAML definitions, never injected defaults."""

from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

import yaml
from context_samples import attribute, performance_documents, write_model
from context_samples import entity as sample_entity
from jsonschema import Draft202012Validator

# Dependencies run in Evidence's isolated Python environment.
from referencing import Registry, Resource  # pyright: ignore[reportMissingImports]

SKILL = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(SKILL / "scripts"))
from fm_model import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    LoadedModel,
    compiled_document,
    load_model,
    validate_against_schema,
    validate_entities,
    validate_model,
)
from fm_simulation import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    ValidationSuite,
    validate_validation_suite,
)
from fm_traceability import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    analyze_traceability,
)

# Independent acceptance table, not imported from the implementation.
TIMES = {
    "rfp": ("started_at", "expired_at"),
    "proposal": ("started_at", "expired_at"),
    "fulfillment_request": ("started_at", "expired_at"),
    "contract": ("signed_at",),
    "fulfillment_confirmation": ("confirmed_at",),
    "other_evidence": ("created_at",),
}


def evidence(kind: str) -> dict:
    return {
        "type": "entity",
        "id": "evidence.test",
        "category": "evidence",
        "kind": kind,
        "label": "合成时间凭证",
        "contextRef": "context.test",
        **(
            {"roleRefs": ["role.one", "role.two"]}
            if kind == "contract"
            else {"responsibleRoleRef": "role.one"}
        ),
        "attributes": [
            {
                "name": name,
                "label": name,
                "valueType": "timestamp",
                "required": True,
                "keyData": True,
                "meaning": "合成测试明确的业务时间",
            }
            for name in TIMES[kind]
        ],
    }


def schema_errors(doc: dict, schema="entity.schema.json") -> list[str]:
    errors: list[str] = []
    validate_against_schema(doc, schema, "test.yaml", errors)
    return errors


def compiled_validator() -> Draft202012Validator:
    registry = Registry()
    for path in (SKILL / "schemas").glob("*.schema.json"):
        schema = json.loads(path.read_text())
        registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
    schema = json.loads((SKILL / "schemas/compiled-model.schema.json").read_text())
    return Draft202012Validator(schema, registry=registry)


class EvidenceTimeTests(unittest.TestCase):
    def test_all_kinds_require_explicit_time_definitions(self):
        for kind, names in TIMES.items():
            with self.subTest(kind=kind):
                doc = evidence(kind)
                self.assertEqual([], schema_errors(doc))
                for name in names:
                    missing = copy.deepcopy(doc)
                    missing["attributes"] = [
                        a for a in doc["attributes"] if a["name"] != name
                    ]
                    self.assertTrue(schema_errors(missing), (kind, name))
                del doc["attributes"]
                self.assertTrue(schema_errors(doc), kind)

    def test_all_six_kinds_allow_non_derived_times_through_model_lineage_and_compile(
        self,
    ):
        documents = performance_documents(target_change=False)
        documents.append(
            sample_entity(
                "evidence.contact-note",
                "evidence",
                "other_evidence",
                "联系记录",
                contextRef="context.performance",
                responsibleRoleRef="role.employee",
                attributes=[
                    attribute(
                        "created_at",
                        "timestamp",
                        "该联系凭证的形成时间",
                        keyData=True,
                    )
                ],
            )
        )
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), documents, "context.performance")
            before = {p: p.read_bytes() for p in root.rglob("*.yaml")}
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            report, errors = analyze_traceability(model)
            self.assertEqual([], errors)
            nodes = {node["path"]: node for node in report["nodes"]}
            compiled = compiled_document(model)
            self.assertEqual([], list(compiled_validator().iter_errors(compiled)))
            evidences = [e for e in compiled["entities"] if e["category"] == "evidence"]
            self.assertEqual(set(TIMES), {e["kind"] for e in evidences})
            for doc in evidences:
                with self.subTest(kind=doc["kind"]):
                    attributes = {a["name"]: a for a in doc["attributes"]}
                    for name in TIMES[doc["kind"]]:
                        self.assertNotIn("derivedByRuleRef", attributes[name])
                        self.assertEqual("timestamp", attributes[name]["valueType"])
                        self.assertTrue(attributes[name]["required"])
                        self.assertTrue(attributes[name]["keyData"])
                        self.assertEqual(
                            "asserted", nodes[f"{doc['id']}#{name}"]["origin"]
                        )
                    if doc["kind"] in (
                        "contract",
                        "fulfillment_confirmation",
                        "other_evidence",
                    ):
                        self.assertNotIn("started_at", attributes)
                        self.assertNotIn("expired_at", attributes)
            self.assertEqual(before, {p: p.read_bytes() for p in root.rglob("*.yaml")})

    def test_instances_accept_each_kinds_own_times_without_generation_rules(self):
        for kind, names in TIMES.items():
            with self.subTest(kind=kind):
                doc = evidence(kind)
                model = LoadedModel(root=Path("."), entities=[doc])
                values = {
                    name: "2026-01-02T00:00:00Z"
                    if name == "expired_at"
                    else "2026-01-01T00:00:00Z"
                    for name in names
                }
                suite = ValidationSuite(
                    root=Path("."),
                    instances=[
                        {
                            "id": "instance.test",
                            "entityRef": doc["id"],
                            "values": values,
                        }
                    ],
                )
                self.assertEqual([], validate_validation_suite(model, suite))
                # A different kind's valid timestamp cannot fill a missing required field.
                replacement = (
                    "created_at" if kind != "other_evidence" else "confirmed_at"
                )
                values[replacement] = values.pop(names[0])
                self.assertTrue(validate_validation_suite(model, suite))
                del doc["attributes"][0]
                doc["attributes"].append(
                    attribute(
                        replacement,
                        "timestamp",
                        "另一类型的时间不是本类型必备时间",
                        keyData=True,
                    )
                )
                self.assertTrue(schema_errors(doc))

    def test_request_deadline_can_be_non_derived_without_a_fixed_duration(self):
        # A synthetic alternative model, not a change to a real agreement.
        # The request supplies time values; there is no deadline-generation rule.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "model"
            shutil.copytree(FIXTURES / "valid-traceable-subscription", root)
            path = root / "entities/evidence-fulfillment-request--content-payment.yaml"
            doc = yaml.safe_load(path.read_text())
            deadline = next(a for a in doc["attributes"] if a["name"] == "expired_at")
            del deadline["derivedByRuleRef"]
            path.write_text(yaml.safe_dump(doc, allow_unicode=True))
            (root / "rules/rule--payment-deadline.yaml").unlink()
            before = path.read_bytes()
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            report, errors = analyze_traceability(model)
            self.assertEqual([], errors)
            self.assertFalse(
                any(
                    edge["target"] == "request.content-payment#expired_at"
                    for edge in report["edges"]
                )
            )
            compiled = compiled_document(model)
            request = next(e for e in compiled["entities"] if e["id"] == doc["id"])
            attributes = {a["name"]: a for a in request["attributes"]}
            for name in ("started_at", "expired_at"):
                self.assertNotIn("derivedByRuleRef", attributes[name])
                self.assertEqual("timestamp", attributes[name]["valueType"])
                self.assertTrue(attributes[name]["required"])
                self.assertTrue(attributes[name]["keyData"])
            self.assertEqual(before, path.read_bytes())

    def test_time_definitions_cannot_be_optional_nullable_nonkey_or_renamed(self):
        mutations = (
            {"valueType": "string"},
            {"required": False},
            {"keyData": False},
            {"name": "legacyTime"},
            {"valueType": None},
        )
        for kind in TIMES:
            for patch in mutations:
                with self.subTest(kind=kind, patch=patch):
                    doc = evidence(kind)
                    doc["attributes"][0].update(patch)
                    self.assertTrue(schema_errors(doc), doc)
            doc = evidence(kind)
            doc["attributes"].append(copy.deepcopy(doc["attributes"][0]))
            self.assertTrue(schema_errors(doc), kind)

    def test_in_memory_validation_cannot_bypass_time_contract(self):
        for kind, names in TIMES.items():
            doc = evidence(kind)
            del doc["attributes"]
            errors: list[str] = []
            validate_entities([doc], {}, {}, errors)
            for name in names:
                self.assertTrue(
                    any(name in error for error in errors), (kind, name, errors)
                )

    def test_request_interval_is_owned_by_request_evidence(self):
        path = (
            FIXTURES
            / "valid-subscription/entities/evidence-fulfillment-request--content-payment.yaml"
        )
        doc = yaml.safe_load(path.read_text())
        self.assertEqual([], schema_errors(doc, "entity.schema.json"))
        attributes = {item["name"]: item for item in doc["attributes"]}
        self.assertEqual({"started_at", "expired_at"}, set(attributes))
        for name in ("started_at", "expired_at"):
            self.assertEqual("timestamp", attributes[name]["valueType"])
            self.assertTrue(attributes[name]["required"])
            self.assertTrue(attributes[name]["keyData"])

        fulfillment = yaml.safe_load(
            (
                FIXTURES
                / "valid-subscription/entities/context-fulfillment--content-payment.yaml"
            ).read_text()
        )
        fulfillment["requestInterval"] = {
            "startAttribute": "started_at",
            "endAttribute": "expired_at",
        }
        self.assertTrue(schema_errors(fulfillment, "entity.schema.json"))

    def test_instances_require_concrete_rfc3339_values_for_all_time_fields(self):
        for kind, names in TIMES.items():
            model = LoadedModel(root=Path("."), entities=[evidence(kind)])
            for name in names:
                for invalid in (
                    None,
                    "",
                    "无期限",
                    "2026-01-01",
                    "2026-01-01T00:00:00",
                ):
                    with self.subTest(kind=kind, name=name, invalid=invalid):
                        values: dict[str, Any] = dict.fromkeys(
                            names, "2026-01-01T00:00:00Z"
                        )
                        values[name] = invalid
                        suite = ValidationSuite(
                            root=Path("."),
                            instances=[
                                {
                                    "id": "instance.test",
                                    "entityRef": "evidence.test",
                                    "values": values,
                                }
                            ],
                        )
                        self.assertTrue(validate_validation_suite(model, suite))
                values = dict.fromkeys(names, "2026-01-01T00:00:00Z")
                del values[name]
                suite = ValidationSuite(
                    root=Path("."),
                    instances=[
                        {
                            "id": "instance.test",
                            "entityRef": "evidence.test",
                            "values": values,
                        }
                    ],
                )
                self.assertTrue(validate_validation_suite(model, suite))

    def test_compiled_schema_enforces_the_same_entity_time_contract(self):
        validator = compiled_validator()
        model = load_model(FIXTURES / "valid-traceable-subscription")
        document = compiled_document(model)
        # Replace just entities, so this test isolates compiled time requirements.
        document["entities"] = [evidence(kind) for kind in TIMES]
        self.assertEqual([], list(validator.iter_errors(document)))
        for entity in document["entities"]:
            entity.pop("attributes")
        self.assertTrue(list(validator.iter_errors(document)))

    def test_cli_preserves_explicit_fields_and_refuses_missing_source_without_rewriting(
        self,
    ):
        source = FIXTURES / "valid-traceable-subscription"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "model"
            shutil.copytree(source, root)
            self.assertEqual([], validate_model(load_model(root)))
            output = Path(directory) / "compiled.json"
            command = [
                sys.executable,
                str(SKILL / "scripts/compile_fm_model.py"),
                str(root),
                "--output",
                str(output),
            ]
            result = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            self.assertEqual(0, result.returncode, result.stderr)
            compiled = json.loads(output.read_text())
            for entity in compiled["entities"]:
                if entity["category"] == "evidence":
                    attributes = {a["name"]: a for a in entity["attributes"]}
                    for name in TIMES[entity["kind"]]:
                        self.assertIn(name, attributes)
            path = (
                root
                / "entities/evidence-fulfillment-confirmation--content-payment.yaml"
            )
            doc = yaml.safe_load(path.read_text())
            doc["attributes"] = [
                a for a in doc["attributes"] if a["name"] != "confirmed_at"
            ]
            path.write_text(yaml.safe_dump(doc, allow_unicode=True))
            before = path.read_bytes(), output.read_bytes()
            result = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            self.assertNotEqual(0, result.returncode)
            self.assertEqual(before, (path.read_bytes(), output.read_bytes()))
