"""Executable contracts and source navigation, not duplicated prose or live-agent evidence."""

from __future__ import annotations

import ast
import copy
import json
import re
import sys
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

from fm_model import (  # noqa: E402
    compiled_document,
    load_model,
    validate_against_schema,
    validate_model,
)

FORMAL_REFERENCES = tuple(
    SKILL / "references" / name
    for name in ("format.md", "semantics.md", "cel-rules.md", "patterns.md")
)
LINK = re.compile(r"\[([^\]]+)\]\(([^\s)]+)\)")


def local_links(document: Path):
    for label, href in LINK.findall(document.read_text(encoding="utf-8")):
        if href.startswith(("https://", "http://", "#")):
            continue
        path, _, anchor = href.partition("#")
        yield label, (document.parent / path).resolve(), anchor


def schemas():
    return {
        path.resolve(): json.loads(path.read_text(encoding="utf-8"))
        for path in (SKILL / "schemas").glob("*.schema.json")
    }


def validator(schema, documents):
    registry = Registry().with_resources(
        (document["$id"], Resource.from_contents(document))
        for document in documents.values()
    )
    return Draft202012Validator(schema, registry=registry)


class ExpressionSourceTests(unittest.TestCase):
    def test_format_routes_to_every_schema_instead_of_copying_definitions(self):
        targets = {target for _, target, _ in local_links(SKILL / "references/format.md")}
        self.assertEqual(set(schemas()), {path for path in targets if path.name.endswith(".schema.json")})
        for document in FORMAL_REFERENCES:
            with self.subTest(document=document.name):
                self.assertNotRegex(document.read_text(encoding="utf-8"), r"(?m)^```(?:json|jsonschema)\b")

    def test_formal_links_resolve_inside_the_portable_package(self):
        for document in FORMAL_REFERENCES:
            links = list(local_links(document))
            self.assertTrue(links, document)
            for _, target, anchor in links:
                with self.subTest(document=document.name, target=target, anchor=anchor):
                    self.assertTrue(target.is_relative_to(SKILL.resolve()), target)
                    self.assertTrue(target.is_file(), target)
                    if anchor and target.suffix == ".md":
                        headings = re.findall(r"(?m)^#+ (.+)$", target.read_text(encoding="utf-8"))
                        self.assertIn(anchor, {heading.lower().replace(" ", "-") for heading in headings})

    def test_validator_links_name_existing_symbols(self):
        count = 0
        for document in FORMAL_REFERENCES:
            for label, target, _ in local_links(document):
                if target.suffix != ".py" or label == target.name:
                    continue
                tree = ast.parse(target.read_text(encoding="utf-8"))
                names = {node.name for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef))}
                names.update(
                    name.id
                    for node in tree.body if isinstance(node, ast.Assign)
                    for name in node.targets if isinstance(name, ast.Name)
                )
                with self.subTest(document=document.name, symbol=label):
                    self.assertIn(label, names)
                count += 1
        self.assertGreater(count, 0)

    def test_patterns_link_runnable_models_and_rule_guidance_links_real_rules(self):
        roots = {
            path.parent for _, path, _ in local_links(SKILL / "references/patterns.md")
            if path.name == "model.json"
        }
        self.assertGreaterEqual(len(roots), 2)
        for root in roots:
            model = load_model(root)
            with self.subTest(model=root.name):
                self.assertEqual([], model.errors)
                self.assertEqual([], validate_model(model))
        rules = [path for _, path, _ in local_links(SKILL / "references/cel-rules.md") if path.suffix == ".json" and not path.name.endswith(".schema.json")]
        self.assertTrue(rules)
        for path in rules:
            self.assertEqual("rule", json.loads(path.read_text(encoding="utf-8"))["type"])


class ExpressionContractTests(unittest.TestCase):
    def test_schemas_and_complete_markdown_examples_are_valid(self):
        documents = schemas()
        by_type = {}
        for schema in documents.values():
            Draft202012Validator.check_schema(schema)
            document_type = schema.get("properties", {}).get("type", {}).get("const")
            if document_type:
                self.assertNotIn(document_type, by_type)
                by_type[document_type] = schema
        count = 0
        for folder in ("references", "examples"):
            for path in (SKILL / folder).rglob("*.md"):
                for block in re.findall(r"```json\s*\n(.*?)\n```", path.read_text(encoding="utf-8"), re.S):
                    example = json.loads(block)
                    if not isinstance(example, dict) or "type" not in example:
                        continue
                    with self.subTest(document=path.relative_to(SKILL), id=example.get("id")):
                        self.assertIn(example["type"], by_type)
                        validator(by_type[example["type"]], documents).validate(example)
                    count += 1
        self.assertGreater(count, 0)

    def test_linked_models_compile_to_the_output_contract(self):
        documents = schemas()
        schema = documents[(SKILL / "schemas/compiled-model.schema.json").resolve()]
        roots = {
            path.parent for _, path, _ in local_links(SKILL / "references/patterns.md")
            if path.name == "model.json"
        }
        self.assertTrue(roots)
        for root in roots:
            compiled = compiled_document(load_model(root))
            with self.subTest(model=root.name):
                validator(schema, documents).validate(compiled)
                with self.assertRaises(ValidationError):
                    validator(schema, documents).validate({**compiled, "unexpected": True})

    def test_schema_acceptance_does_not_replace_cross_object_validation(self):
        model = load_model(SKILL / "examples/valid-traceable-subscription")
        self.assertEqual([], validate_model(model))
        request = next(entity for entity in model.entities if entity.get("kind") == "fulfillment_request")
        request["responsibleRoleRef"] = "role.unknown"
        errors = []
        validate_against_schema(request, "entity.schema.json", "request.json", errors)
        self.assertEqual([], errors)
        self.assertTrue(validate_model(model))

    def test_progressive_omission_is_a_gap_but_incorrect_expressed_types_are_errors(self):
        model = load_model(SKILL / "examples/valid-traceable-subscription")
        self.assertEqual([], validate_model(model, complete=True))
        contract = next(entity for entity in model.entities if (entity.get("category"), entity.get("kind")) == ("evidence", "contract"))
        saved = copy.deepcopy(contract["attributes"])
        # This time is not read by a rule: omission must not create a dangling CEL access.
        contract["attributes"] = [attribute for attribute in saved if attribute["name"] != "signed_at"]
        self.assertEqual([], validate_model(model))
        self.assertTrue(validate_model(model, complete=True))
        contract["attributes"] = saved
        next(attribute for attribute in saved if attribute["name"] == "signed_at")["valueType"] = "string"
        self.assertTrue(validate_model(model))

    def test_rule_business_explanation_is_checked_at_the_structural_boundary(self):
        model = load_model(SKILL / "examples/domain")
        rule = copy.deepcopy(model.rules[0])
        errors = []
        validate_against_schema(rule, "rule.schema.json", "rule.json", errors)
        self.assertEqual([], errors)
        rule.pop("description")
        validate_against_schema(rule, "rule.schema.json", "rule.json", errors)
        self.assertTrue(errors)


if __name__ == "__main__":
    unittest.main()
