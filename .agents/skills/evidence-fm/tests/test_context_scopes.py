from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

# Dependencies are installed in Evidence's isolated Python runtime.
from celpy import Environment  # pyright: ignore[reportMissingImports]
from celpy.adapter import json_to_cel  # pyright: ignore[reportMissingImports]
from context_samples import (
    domain_documents,
    precontract_documents,
    write_documents,
    write_model,
)
from jsonschema import Draft202012Validator
from referencing import Registry, Resource  # pyright: ignore[reportMissingImports]

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from fm_model import (  # type: ignore[import-not-found]  # noqa: E402
    compiled_document,
    load_model,
    validate_model,
)
from fm_traceability import (  # pyright: ignore[reportMissingImports]  # noqa: E402
    analyze_traceability,
)


class ContextScopeTests(unittest.TestCase):
    def assert_compiled_schema(self, document: dict) -> None:
        resources = []
        for path in (SKILL_DIR / "schemas").glob("*.schema.json"):
            schema = json.loads(path.read_text(encoding="utf-8"))
            resources.append((schema["$id"], Resource.from_contents(schema)))
        registry = Registry().with_resources(resources)
        schema = json.loads(
            (SKILL_DIR / "schemas" / "compiled-model.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            [],
            list(Draft202012Validator(schema, registry=registry).iter_errors(document)),
        )

    def test_domain_only_validates_compiles_and_traces_without_fulfillment_contexts(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory), domain_documents(), "context.customer-information"
            )
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            self.assertFalse(
                any(item["category"] == "evidence" for item in model.entities)
            )
            document = compiled_document(model)
            self.assertEqual({}, model.fulfillment_contexts_by_id)
            self.assert_compiled_schema(document)
            lineage, errors = analyze_traceability(model)
            self.assertEqual([], errors)
            self.assertEqual(
                {"thing.contact-method#enabled", "thing.contact-method#verified"},
                {edge["source"] for edge in lineage["edges"]},
            )
            self.assertEqual(
                {"thing.contact-method#usable"},
                {edge["target"] for edge in lineage["edges"]},
            )

    def test_domain_rule_examples_have_normal_and_boundary_results(self) -> None:
        rules = {
            item["id"]: item for item in domain_documents() if item["type"] == "rule"
        }
        cases = [
            (
                "rule.contact-usable",
                {"contact": {"enabled": True, "verified": True}},
                True,
            ),
            (
                "rule.contact-usable",
                {"contact": {"enabled": True, "verified": False}},
                False,
            ),
            (
                "rule.contact-usable",
                {"contact": {"enabled": False, "verified": True}},
                False,
            ),
            ("rule.profile-editable", {"profile": {"archived": False}}, True),
            ("rule.profile-editable", {"profile": {"archived": True}}, False),
            ("rule.profile-identity", {"profile": {"profile_id": "p1"}}, True),
            ("rule.profile-identity", {"profile": {"profile_id": ""}}, False),
        ]
        for rule_id, bindings, expected in cases:
            with self.subTest(rule=rule_id, bindings=bindings):
                env = Environment()
                program = env.program(env.compile(rules[rule_id]["expression"]))
                self.assertEqual(
                    expected,
                    bool(
                        program.evaluate(
                            {
                                name: json_to_cel(value)
                                for name, value in bindings.items()
                            }
                        )
                    ),
                )

    def test_precontract_only_has_responsible_evidence_but_no_contract_or_fulfillment(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory), precontract_documents(), "context.sales-inquiry"
            )
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            self.assertEqual(
                {"rfp", "proposal"},
                {
                    item["kind"]
                    for item in model.entities
                    if item["category"] == "evidence"
                },
            )
            self.assertEqual({}, model.fulfillment_contexts_by_id)
            self.assert_compiled_schema(compiled_document(model))

    def test_empty_optional_directories_do_not_change_compilation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory), domain_documents(), "context.customer-information"
            )
            before = compiled_document(load_model(root))
            (root / "business-patterns").mkdir()
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            self.assertEqual(before, compiled_document(model))

    def test_optional_document_path_must_not_silently_ignore_a_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(
                Path(directory), domain_documents(), "context.customer-information"
            )
            (root / "retired-objects").mkdir()
            self.assertIn(
                "unexpected model directory: retired-objects/",
                validate_model(load_model(root)),
            )

    def test_domain_still_rejects_invalid_identity_boundary_and_cel(self) -> None:
        cases = [
            (
                "party.customer",
                "contextRef",
                "context.customer-information",
                "Party must stay outside",
            ),
            (
                "thing.contact-method",
                "contextRef",
                "missing.context",
                "must belong to a Domain Context",
            ),
            (
                "relation.profile-contact",
                "targetRef",
                "thing.missing",
                "unknown targetRef",
            ),
            (
                "rule.profile-editable",
                "expression",
                "!profile.missing",
                "unknown attribute",
            ),
        ]
        for object_id, field, value, expected in cases:
            with (
                self.subTest(object=object_id),
                tempfile.TemporaryDirectory() as directory,
            ):
                documents = domain_documents()
                next(item for item in documents if item["id"] == object_id)[field] = (
                    value
                )
                root = write_model(
                    Path(directory), documents, "context.customer-information"
                )
                self.assertTrue(
                    any(expected in error for error in validate_model(load_model(root)))
                )

    def test_precontract_does_not_relax_evidence_or_relationship_constraints(
        self,
    ) -> None:
        for broken in ("responsibility", "context", "cross-context"):
            with (
                self.subTest(broken=broken),
                tempfile.TemporaryDirectory() as directory,
            ):
                documents = precontract_documents()
                proposal = next(
                    item
                    for item in documents
                    if item["id"] == "proposal.customer-quote"
                )
                if broken == "responsibility":
                    proposal["responsibleRoleRef"] = "role.unknown"
                    expected = "responsibleRoleRef must reference a Party Role"
                elif broken == "context":
                    documents.extend(domain_documents())
                    proposal["contextRef"] = "context.customer-information"
                    proposal["responsibleRoleRef"] = "role.profile-owner"
                    expected = "must belong to a Pre-contract Context"
                else:
                    documents.extend(domain_documents())
                    documents.append(
                        {
                            "type": "relationship",
                            "id": "relation.invalid-bridge",
                            "kind": "evidences",
                            "sourceRef": "proposal.customer-quote",
                            "targetRef": "thing.customer-profile",
                            "label": "错误的跨域证明",
                        }
                    )
                    expected = "requires Other Evidence -> Evidence"
                root = write_model(Path(directory), documents, "context.sales-inquiry")
                self.assertTrue(
                    any(expected in error for error in validate_model(load_model(root)))
                )

    def test_mixed_scope_preserves_local_models_and_existing_fulfillment_constraints(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "model"
            shutil.copytree(
                Path(__file__).resolve().parent / "fixtures/valid-subscription", root
            )
            before = load_model(root)
            precontract = [
                d for d in precontract_documents() if d.get("category") != "role"
            ]
            for document in precontract:
                if document["id"] == "context.sales-inquiry":
                    document["parentContextRef"] = "context.content-subscription"
                elif document.get("kind") == "rfp":
                    document["responsibleRoleRef"] = "role.subscriber"
                elif document.get("kind") == "proposal":
                    document["responsibleRoleRef"] = "role.platform-subscription"
            write_documents(root, domain_documents() + precontract)
            write_documents(
                root,
                [
                    {
                        "type": "relationship",
                        "id": "relation.quote-contract",
                        "kind": "precedes",
                        "sourceRef": "proposal.customer-quote",
                        "targetRef": "contract.content-subscription",
                        "label": "报价形成订阅合同",
                    }
                ],
            )
            model = load_model(root)
            self.assertEqual([], validate_model(model))
            self.assertEqual(
                before.fulfillment_contexts_by_id,
                model.fulfillment_contexts_by_id,
            )
            for item in domain_documents():
                collection = {
                    "entity": model.entities_by_id,
                    "rule": model.rules_by_id,
                    "relationship": model.relationships_by_id,
                }[item["type"]]
                self.assertEqual(item, collection[item["id"]])
            self.assert_compiled_schema(compiled_document(model))
            (
                root
                / "entities"
                / "evidence-fulfillment-confirmation--content-payment.yaml"
            ).unlink()
            errors = validate_model(load_model(root))
            self.assertTrue(
                any(
                    "must contain a Fulfillment Confirmation or Evidence Role" in error
                    for error in errors
                ),
                errors,
            )

    def test_absent_fulfillment_context_cannot_hide_an_orphan_request(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "model"
            shutil.copytree(
                Path(__file__).resolve().parent / "fixtures/valid-subscription", root
            )
            (root / "entities" / "context-fulfillment--content-payment.yaml").unlink()
            errors = validate_model(load_model(root))
            self.assertTrue(
                any("existing Fulfillment Context" in error for error in errors),
                errors,
            )

    def test_unknown_entry_and_empty_entities_remain_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), domain_documents(), "context.unknown")
            self.assertTrue(
                any(
                    "entryContextRefs" in error
                    for error in validate_model(load_model(root))
                )
            )
            shutil.rmtree(root / "entities")
            (root / "entities").mkdir()
            self.assertIn(
                "entities/ must contain at least one entity",
                validate_model(load_model(root)),
            )

    def test_cli_supports_pure_domain_and_precontract_scopes_deterministically(
        self,
    ) -> None:
        for documents, entry in (
            (domain_documents(), "context.customer-information"),
            (precontract_documents(), "context.sales-inquiry"),
        ):
            with self.subTest(entry=entry), tempfile.TemporaryDirectory() as directory:
                root = write_model(Path(directory), documents, entry)
                output = root / "generated" / "model.json"
                commands = [
                    ["validate_fm_model.py", str(root)],
                    [
                        "build_fm_lineage.py",
                        str(root),
                        "--output",
                        str(root / "generated" / "traceability.json"),
                    ],
                    ["compile_fm_model.py", str(root), "--output", str(output)],
                ]
                for arguments in commands:
                    result = subprocess.run(
                        [
                            sys.executable,
                            str(SKILL_DIR / "scripts" / arguments[0]),
                            *arguments[1:],
                        ],
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    self.assertEqual(
                        0, result.returncode, result.stdout + result.stderr
                    )
                first = output.read_bytes()
                result = subprocess.run(
                    [
                        sys.executable,
                        str(SKILL_DIR / "scripts" / "compile_fm_model.py"),
                        str(root),
                        "--output",
                        str(output),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertEqual(first, output.read_bytes())


if __name__ == "__main__":
    unittest.main()
