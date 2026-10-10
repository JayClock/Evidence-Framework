"""Contracts for the offline object workbench; no repository fixtures required."""
import base64
import hashlib
import importlib.util
import io
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SKILL = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("workbench", SKILL / "scripts/generate.py")
assert SPEC and SPEC.loader
wb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wb)


def fixture():
    return {
        "model": {"name": "测试模型"},
        "entities": [
            {"id": "context.a", "category": "context", "kind": "contract", "label": "约定"},
            {"id": "contract.a", "category": "evidence", "kind": "contract", "contextRef": "context.a", "label": "协议"},
            {"id": "fulfillment.a", "category": "context", "kind": "fulfillment", "parentContextRef": "context.a", "label": "付款"},
            {"id": "request.a", "category": "evidence", "kind": "fulfillment_request", "contextRef": "fulfillment.a", "label": "付款请求", "sourceRefs": ["SECRET"], "notes": "SECRET"},
            {"id": "role.proof", "category": "role", "kind": "evidence", "contextRef": "fulfillment.a", "label": "付款证明"},
            {"id": "confirmation.other", "category": "evidence", "kind": "fulfillment_confirmation", "label": "外部扣款"},
        ],
        "relationships": [
            {"id": "relation.use", "kind": "uses_role", "sourceRef": "request.a", "targetRef": "role.proof", "label": "采信"},
            {"id": "relation.play", "kind": "plays_role", "sourceRef": "confirmation.other", "targetRef": "role.proof", "label": "提供证明"},
        ],
        "rules": [{"id": "rule.a", "label": "已付款", "kind": "completion", "contextRef": "fulfillment.a", "description": "以外部付款证明判断完成。", "expression": "proof.success", "bindings": {"proof": {"ref": "role.proof"}}, "sourceRefs": ["SECRET"]}],
    }


class WorkbenchTests(unittest.TestCase):
    def project(self, model=None, **kwargs):
        return wb.project(model or fixture(), [], [], {"scenarioResults": []}, None, **kwargs)

    def test_contract_count_excludes_contract_evidence(self):
        self.assertEqual(1, self.project()["counts"]["contracts"])

    def test_external_proof_is_not_a_missing_confirmation(self):
        data = self.project()
        obligation = next(n for n in data["nodes"] if n["id"] == "fulfillment.a")
        self.assertEqual(["role.proof"], obligation["proofRoles"])
        self.assertEqual(["confirmation.other"], obligation["proofPlayers"])
        self.assertEqual([], obligation["confirmations"])

    def test_shared_confirmation_and_proof_roles_are_both_preserved(self):
        model = fixture()
        model["relationships"].append({"id": "relation.shared", "kind": "precedes", "sourceRef": "request.a", "targetRef": "confirmation.other"})
        data = self.project(model)
        node = next(n for n in data["nodes"] if n["id"] == "fulfillment.a")
        self.assertEqual(["confirmation.other"], node["confirmations"])
        self.assertEqual(["role.proof"], node["proofRoles"])

    def test_patterns_and_binding_scope_use_explicit_links(self):
        model = fixture()
        model["businessPatterns"] = [{"id": "pattern.a", "label": "证明替换", "operationInvariant": "履约独立于支付方式", "variationPointRefs": ["role.proof"]}]
        api = {"bindings": [{"id": "binding.a", "scopeResourceRef": "resource.a", "basis": {"sourceRefs": ["SECRET"]}}], "resources": [{"id": "resource.a", "entityRef": "request.a"}]}
        data = wb.project(model, [], [], {}, api)
        self.assertTrue(any(e["from"] == "pattern.a" and e["to"] == "role.proof" for e in data["edges"]))
        self.assertTrue(any(e["from"] == "binding.a" and e["to"] == "resource.a" for e in data["edges"]))
        self.assertNotIn("SECRET", json.dumps(data))

    def test_inverse_links_and_business_rule_description(self):
        data = self.project()
        proof = next(n for n in data["nodes"] if n["id"] == "role.proof")
        self.assertIn("rule.a", [e["from"] for e in data["edges"] if e["to"] == proof["id"]])
        rule = next(n for n in data["nodes"] if n["id"] == "rule.a")
        self.assertEqual("以外部付款证明判断完成。", rule["description"])

    def test_projection_does_not_embed_provenance_or_raw_inputs(self):
        data = self.project()
        encoded = json.dumps(data)
        for forbidden in ["SECRET", "sourceRefs", "modelDigest", "inputFiles", "executions", "locations", "notes"]:
            self.assertNotIn(forbidden, encoded)
        self.assertNotIn("files", data)

    def test_dangling_refs_are_not_silently_omitted(self):
        model = fixture()
        model["rules"][0]["bindings"]["missing"] = {"ref": "unknown.object"}
        data = self.project(model)
        self.assertIn("unknown.object", data["unresolved"])

    def test_duplicate_ids_fail_instead_of_overwriting(self):
        model = fixture()
        model["entities"].append(model["entities"][0])
        with self.assertRaisesRegex(ValueError, "重复"):
            self.project(model)

    def test_false_result_is_a_successful_counterexample(self):
        scenario = {"id": "scenario.no", "label": "未完成", "evaluations": [{"ruleRef": "rule.a", "expectedResult": False}]}
        simulation = {"scenarioResults": [{"scenarioId": "scenario.no", "simulationPassed": True, "evaluations": [{"ruleRef": "rule.a", "result": False, "passed": True}]}]}
        data = wb.project(fixture(), [scenario], [], simulation, None)
        node = next(n for n in data["nodes"] if n["id"] == "scenario.no")
        self.assertIs(node["evaluations"][0]["expected"], False)
        self.assertIs(node["evaluations"][0]["actual"], False)
        self.assertIs(node["evaluations"][0]["passed"], True)

    def test_api_rule_binding_links_are_navigable_without_basis(self):
        api = {"capabilities": [{"id": "capability.a", "businessCapability": "登记", "actorRoleRef": "role.proof", "effect": {"targetRef": "request.a"}, "ruleBindings": [{"ruleRef": "rule.a"}], "basis": {"sourceRefs": ["SECRET"]}}], "http": {"operations": [], "representations": [], "journeys": []}}
        data = wb.project(fixture(), [], [], {}, api)
        self.assertTrue(any(e["from"] == "capability.a" and e["to"] == "rule.a" for e in data["edges"]))
        self.assertNotIn("SECRET", json.dumps(data))

    def test_html_escapes_payload_and_hashes_exact_script(self):
        data = self.project()
        data["title"] = '</script><img src=x onerror=alert(1)>@@APP@@'
        html = wb.render(data)
        self.assertNotIn('</script><img', html)
        scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
        self.assertEqual(1, len(scripts))
        digest = base64.b64encode(hashlib.sha256(scripts[0].encode()).digest()).decode()
        self.assertIn("'sha256-" + digest + "'", html)
        self.assertIn("connect-src 'none'", html)
        self.assertNotIn("@@CSP@@", html)
        match = re.search(r'id="workbench-data">(.*?)</script>', html, re.S)
        assert match is not None
        self.assertEqual(data, json.loads(match[1]))

    def test_publish_refuses_foreign_file_and_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            page = Path(temp) / "index.html"
            page.write_text("unrelated")
            with self.assertRaises(ValueError):
                wb.publish(page, "anything")
            self.assertEqual("unrelated", page.read_text())
            page.unlink()
            page.symlink_to(Path(temp) / "elsewhere")
            with self.assertRaises(ValueError):
                wb.publish(page, "anything")

    def test_input_mutation_during_render_preserves_existing_page(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / ".evidence/fm/model.json"
            source.parent.mkdir(parents=True)
            source.write_text("{}")
            page = root / ".evidence/views/index.html"
            page.parent.mkdir()
            page.write_text(wb.MARKER + "previous")
            def mutate(_data):
                source.write_text('{"changed":true}')
                return "new page"
            with patch.object(wb.sys, "argv", ["generate.py", "--project-root", temp]), patch.object(wb, "collect", return_value={}), patch.object(wb, "render", side_effect=mutate), patch.object(wb.sys, "stderr", io.StringIO()):
                self.assertEqual(1, wb.main())
            self.assertEqual(wb.MARKER + "previous", page.read_text())
            self.assertEqual([page], list(page.parent.iterdir()))

    def test_checker_failure_stops_collection(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve()
            with patch.object(wb, "run", return_value={"valid": False}) as command:
                with self.assertRaisesRegex(ValueError, "未通过"):
                    wb.collect(root, root, root, root)
                self.assertEqual(1, command.call_count)

    def test_source_fingerprint_ignores_generated_but_detects_inputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            fm = root / ".evidence/fm"
            fm.mkdir(parents=True)
            (fm / "model.json").write_text("{}")
            before = wb.fingerprint(root)
            (fm / "generated").mkdir()
            (fm / "generated/model.json").write_text("changed")
            self.assertEqual(before, wb.fingerprint(root))
            (fm / "model.json").write_text('{"changed":true}')
            self.assertNotEqual(before, wb.fingerprint(root))


if __name__ == "__main__":
    unittest.main()
