"""Run canonical teaching models; this does not approve real business or agent behavior."""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
EXAMPLES = SKILL / "examples"


def hashes(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob("*") if path.is_file()}


class ExampleBaselineTests(unittest.TestCase):
    def check(self, root):
        return subprocess.run([
            sys.executable, "-B", str(SKILL / "scripts/check_fm.py"), str(root),
        ], capture_output=True, text=True, timeout=60, check=False)

    def test_entry_routes_current_action_to_flow_and_selected_examples(self):
        entry = (SKILL / "SKILL.md").read_text()
        self.assertIn("references/editing-workflow.md", entry)
        self.assertIn("examples/README.md", entry)
        index = (EXAMPLES / "README.md").read_text()
        for name in ("valid-traceable-subscription", "domain"):
            self.assertIn(f"]({name}/README.md)", index)
            self.assertTrue((EXAMPLES / name / "README.md").is_file())
        self.assertIn("](structural-contrasts.md)", index)
        self.assertIn("合成", index)
        self.assertIn("责任范围方法", index)
        self.assertIn("不提供人类追责结束依据或编辑授权", index)

    def test_edit_flow_pairs_responsibility_then_separates_consistency_and_scope_completion(self):
        text = (SKILL / "references/editing-workflow.md").read_text()
        graph = re.search(r"```mermaid\n(.*?)```", text, re.S)
        self.assertIsNotNone(graph)
        assert graph is not None
        edges = set(re.findall(r"(?m)^\s*(\w+) -->\s*(?:\|[^|]+\|\s*)?(\w+)", graph[1]))
        self.assertTrue({
            ("input", "permission"), ("permission", "mapping"),
            ("permission", "handoff"), ("mapping", "pair"), ("pair", "edit"),
            ("edit", "difference"), ("difference", "check"),
            ("check", "consistent"), ("consistent", "handoff"),
            ("consistent", "finish"), ("finish", "scope"),
            ("finish", "handoff"), ("scope", "ready"), ("ready", "downstream"),
        }.issubset(edges), edges)
        self.assertFalse(any(start in {"blocked", "handoff"} for start, _ in edges))
        self.assertEqual({"permission"}, {start for start, end in edges if end == "mapping"})
        self.assertEqual({"pair"}, {start for start, end in edges if end == "edit"})
        self.assertIn("不等追责结束", text)
        self.assertIn("--scope", text)
        self.assertIn("--fm-check", text)
        self.assertIn("不重复", text)

    def test_teaching_models_are_single_owned_and_really_check_without_writes(self):
        self.assertFalse((SKILL / "tests/fixtures/valid-traceable-subscription").exists())
        self.assertFalse((SKILL / "tests/fixtures/domain").exists())
        self.assertFalse((SKILL / "tests/api/fixtures/full-lifecycle").exists())
        before = hashes(EXAMPLES)
        for name, simulation in (("domain", None), ("valid-traceable-subscription", True)):
            with self.subTest(example=name):
                run = self.check(EXAMPLES / name)
                self.assertEqual(0, run.returncode, run.stdout + run.stderr)
                result = json.loads(run.stdout)
                self.assertTrue(result["valid"])
                self.assertFalse(result["inputChanged"])
                self.assertIs(simulation, result["simulationPassed"])
        self.assertEqual(before, hashes(EXAMPLES))

    def test_subscription_sample_has_contract_owned_fulfillment_and_consumption_direction(self):
        root = EXAMPLES / "valid-traceable-subscription"
        entities = {document["id"]: document for path in (root / "entities").glob("*.json")
                    if (document := json.loads(path.read_text()))}
        self.assertTrue(entities)
        request = entities["request.content-payment"]
        fulfillment = entities["fulfillment.content-payment"]
        self.assertEqual("context.content-subscription", fulfillment["contextRef"])
        self.assertEqual(fulfillment["id"], request["fulfillmentRef"])
        self.assertNotIn("kind", fulfillment)
        relations = [json.loads(path.read_text()) for path in (root / "relationships").glob("*.json")]
        edges = {(relation["sourceRef"], relation["kind"], relation["targetRef"]) for relation in relations}
        self.assertIn(("confirmation.content-payment", "references", "request.content-payment"), edges)
        self.assertIn(("request.content-payment", "references", "contract.content-subscription"), edges)
        domain = [json.loads(path.read_text()) for path in (EXAMPLES / "domain/entities").glob("*.json")]
        self.assertTrue(domain)
        self.assertFalse(any(entity.get("category") == "fulfillment" for entity in domain))
        self.assertFalse(any(entity.get("kind") == "contract" for entity in domain))

    def test_missing_required_time_is_rejected_without_changing_example_or_expectations(self):
        source = EXAMPLES / "valid-traceable-subscription"
        self.assertTrue(source.is_dir())
        before = hashes(source)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "model"
            shutil.copytree(source, root)
            path = root / "entities/evidence-fulfillment-request--content-payment.json"
            request = json.loads(path.read_text())
            request["attributes"] = [a for a in request["attributes"] if a["name"] != "expired_at"]
            path.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
            run = self.check(root)
            self.assertNotEqual(0, run.returncode)
            self.assertFalse(json.loads(run.stdout)["valid"])
            self.assertIn("expired_at", run.stdout)
        self.assertEqual(before, hashes(source))


if __name__ == "__main__":
    unittest.main()
