"""Progressive content is legal; named Context shells are not."""
from __future__ import annotations

import copy
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from context_samples import domain_documents, entity, precontract_documents, write_model
from test_fulfillment_structure import documents

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

import check_fm  # pyright: ignore[reportMissingImports]  # noqa: E402
from fm_model import load_model, validate_entities, validate_model  # pyright: ignore[reportMissingImports]  # noqa: E402


class ContextContentTests(unittest.TestCase):
    def errors(self, values, entry):
        with tempfile.TemporaryDirectory() as directory:
            return validate_model(load_model(write_model(Path(directory), values, entry)))

    def contract_without_fulfillments(self):
        return [v for v in documents() if v["id"] in {
            "context.agreement", "contract.agreement", "role.customer", "role.provider",
        }]

    def test_each_named_shell_is_inconsistent_not_a_scope_gap(self):
        for kind in ("contract", "domain", "pre_contract"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as directory:
                root = write_model(Path(directory), [entity(
                    "context.shell", "context", kind, "仅有名称的边界",
                )], "context.shell")
                before = {p: p.read_bytes() for p in root.rglob("*.json")}
                report = check_fm.check_model(root)
                self.assertFalse(report["consistent"], report)
                self.assertFalse(report["valid"], report)
                self.assertTrue(report["errors"], report)
                self.assertEqual(before, {p: p.read_bytes() for p in root.rglob("*.json")})

    def test_semantic_checks_reject_shells_without_relying_on_schema(self):
        for kind in ("contract", "domain", "pre_contract"):
            with self.subTest(kind=kind):
                context = entity("context.shell", "context", kind, "空壳边界")
                errors = []
                validate_entities([context], {context["id"]: context}, {}, errors, complete=False)
                self.assertTrue(any("context.shell" in error for error in errors), errors)

    def test_contract_with_real_agreement_and_parties_needs_no_fulfillment_yet(self):
        values = self.contract_without_fulfillments()
        self.assertEqual([], self.errors(values, "context.agreement"))
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            report = check_fm.check_model(root, scope_refs=["context.agreement"])
            self.assertTrue(report["consistent"], report)
            self.assertFalse(report["complete"])
            self.assertTrue(any("primary Fulfillment" in gap for gap in report["gaps"]), report)

    def test_contract_root_cannot_be_a_role_or_unrelated_evidence(self):
        values = self.contract_without_fulfillments()
        values = [v for v in values if v["id"] not in {"contract.agreement", "role.customer", "role.provider"}]
        for category, kind in (("role", "context"), ("evidence", "other_evidence")):
            with self.subTest(category=category):
                candidate = entity("object.root", category, kind, "非合同根", contextRef="context.agreement")
                if category == "evidence":
                    candidate["responsibleRoleRef"] = "role.author"
                mutated = copy.deepcopy(values)
                mutated[0]["rootRefs"] = [candidate["id"]]
                errors = []
                index = {v["id"]: v for v in mutated + [candidate]}
                validate_entities(mutated, index, {}, errors, complete=False)
                self.assertTrue(any("root Contract" in error for error in errors), errors)

    def test_domain_root_requires_an_actual_local_business_object(self):
        for signature in (("context", "domain"), ("role", "context"), ("role", "domain")):
            with self.subTest(signature=signature):
                context = entity("context.domain", "context", "domain", "领域", rootRefs=["object.root"])
                root = entity("object.root", *signature, "非领域根", contextRef="context.domain")
                errors = []
                validate_entities([context], {v["id"]: v for v in (context, root)}, {}, errors, complete=False)
                self.assertTrue(any("business object" in error for error in errors), errors)
        self_root = entity("context.domain", "context", "domain", "自引用边界", rootRefs=["context.domain"])
        self.assertTrue(self.errors([self_root], "context.domain"))

    def test_roots_cannot_borrow_business_content_from_another_context(self):
        for kind, signature in (("contract", ("evidence", "contract")),
                                ("domain", ("participant", "thing")),
                                ("pre_contract", ("evidence", "rfp"))):
            with self.subTest(kind=kind):
                context = entity("context.local", "context", kind, "本地边界", rootRefs=["object.foreign"])
                root = entity("object.foreign", *signature, "其他边界的对象", contextRef="context.foreign")
                errors = []
                validate_entities([context], {v["id"]: v for v in (context, root)}, {}, errors, complete=False)
                self.assertTrue(any("must belong to this Context" in error for error in errors), errors)

    def test_negotiation_root_cannot_be_just_a_collaboration_role(self):
        values = precontract_documents()
        values[0]["rootRefs"] = ["role.buyer"]
        role = entity("role.buyer", "role", "context", "协作占位", contextRef=values[0]["id"])
        errors = []
        validate_entities([values[0]], {v["id"]: v for v in values + [role]}, {}, errors, complete=False)
        self.assertTrue(any("negotiation Evidence" in error for error in errors), errors)

    def test_real_domain_object_can_grow_before_its_attributes_are_known(self):
        values = domain_documents()[:1] + [entity(
            "thing.customer-profile", "participant", "thing", "客户档案", contextRef="context.customer-information",
        )]
        self.assertEqual([], self.errors(values, "context.customer-information"))

    def test_negotiation_requires_a_real_local_voucher_not_only_roles_or_rules(self):
        values = precontract_documents()
        for kind in ("rfp", "proposal"):
            with self.subTest(kind=kind):
                partial = [v for v in values if v.get("category") in {"context", "role"} or v.get("kind") == kind]
                self.assertEqual([], self.errors(partial, "context.sales-inquiry"))
        shell = [v for v in values if v.get("category") in {"context", "role"}]
        self.assertTrue(self.errors(shell, "context.sales-inquiry"))
        shell.append({"type": "rule", "id": "rule.placeholder", "kind": "invariant", "label": "占位规则",
                      "contextRef": "context.sales-inquiry", "description": "规则不能证明实际协商存在",
                      "expression": "true", "bindings": {}, "resultType": "bool"})
        self.assertTrue(self.errors(shell, "context.sales-inquiry"))

    def test_empty_child_cannot_be_justified_by_its_parent_contract(self):
        values = self.contract_without_fulfillments() + [entity(
            "context.stage", "context", "pre_contract", "未展开阶段", parentContextRef="context.agreement",
        )]
        self.assertTrue(any("context.stage" in e for e in self.errors(values, "context.agreement")))

    def test_unselected_shell_still_blocks_whole_model_consistency(self):
        values = documents() + [entity("context.shell", "context", "domain", "无内容领域")]
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory), values, "context.agreement")
            report = check_fm.check_model(root, scope_refs=["context.agreement"])
            self.assertFalse(report["consistent"], report)
            self.assertFalse(report["complete"], report)

    def test_rejected_shell_cannot_replace_an_existing_compiled_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = write_model(Path(directory) / "fm", [entity(
                "context.shell", "context", "domain", "无内容领域",
            )], "context.shell")
            output = Path(directory) / "model.json"
            output.write_text("existing compiled evidence", encoding="utf-8")
            result = subprocess.run([sys.executable, "-B", str(SKILL / "scripts/compile_fm_model.py"),
                                     str(root), "--output", str(output)], capture_output=True, text=True, timeout=30)
            self.assertNotEqual(0, result.returncode, result.stdout + result.stderr)
            self.assertEqual("existing compiled evidence", output.read_text())


if __name__ == "__main__":
    unittest.main()
