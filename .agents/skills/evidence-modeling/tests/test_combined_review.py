"""Joint modeling contracts and real offline projection; not agent/human approval evidence."""

import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


def hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file()}


class CombinedWorkflowContracts(unittest.TestCase):
    def test_entry_composes_model_api_and_one_review_with_narrow_permissions(self):
        entry = (SKILLS / "evidence-modeling/SKILL.md").read_text()
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        for phrase in ("evidence-fm", "evidence-api", "evidence-visualization", "不重复 FM 检查",
                       "FM 渐进维护授权", "范围完整性检查", "只修改 FM", "只校验", "不自动批准"):
            self.assertIn(phrase, entry)
        for phrase in ("范围结束与下游接续", "--require-api", "不是原子事务",
                       "失败保留旧页", "modelDigest", "不反向修改 FM"):
            self.assertIn(phrase, workflow)
        self.assertLess(workflow.index("**检查整个范围。**"), workflow.index("**按授权接续 API。**"))
        self.assertLess(workflow.index("**按授权接续 API。**"), workflow.index("**核对联合审核。**"))
        self.assertNotIn("完成当前分支后停止，不自动进入需求、API", entry)

    def test_current_project_entrypoints_describe_the_joint_workflow(self):
        for path in (REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md",
                     SKILLS / "README.md", REPO / "README.md"):
            with self.subTest(path=path):
                text = path.read_text()
                self.assertIn("联合审核", text)
                self.assertIn("API", text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertNotIn("另行要求 API 时", guide)


class JointReviewIntegrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="joint review ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        fixture = SKILLS / "evidence-api/examples/full-lifecycle"
        shutil.copytree(fixture / "fm", self.root / ".evidence/fm")
        api = self.root / ".evidence/api"
        api.mkdir()
        shutil.copy2(fixture / "api.json", api / "api.json")
        (api / "generated").mkdir()
        (api / "generated/previous.json").write_text("previous output")
        self.page = self.root / ".evidence/views/index.html"
        self.page.parent.mkdir()
        self.page.write_text("<!-- evidence-object-workbench -->previous")

    def generate(self):
        return subprocess.run([
            sys.executable, "-B", str(SKILLS / "evidence-visualization/scripts/generate.py"),
            "--project-root", str(self.root), "--fm-skill", str(SKILLS / "evidence-fm"),
            "--api-skill", str(SKILLS / "evidence-api"), "--require-api",
            "--scope", "context.product-procurement", "--scope", "context.product-catalog",
        ], capture_output=True, text=True, timeout=120, check=False)

    def test_joint_page_contains_current_model_and_all_api_capabilities(self):
        before = hashes(self.root / ".evidence/fm"), hashes(self.root / ".evidence/api")
        result = self.generate()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        html = self.page.read_text()
        match = re.search(r'id="workbench-data">(.*?)</script>', html, re.S)
        self.assertIsNotNone(match)
        assert match is not None
        data = json.loads(match[1])
        self.assertTrue(data["validation"]["fm"])
        self.assertTrue(data["validation"]["api"])
        self.assertFalse(data["validation"]["runtime"])
        api_source = json.loads((self.root / ".evidence/api/api.json").read_text())
        ids = {n["id"] for n in data["nodes"]}
        self.assertTrue({c["id"] for c in api_source["capabilities"]}.issubset(ids))
        self.assertIn("contract.product-procurement", ids)
        self.assertTrue(any(e["from"].startswith("capability.") and e["to"] in ids
                            for e in data["edges"]))
        self.assertEqual(before, (hashes(self.root / ".evidence/fm"), hashes(self.root / ".evidence/api")))
        self.assertEqual([self.page], list(self.page.parent.iterdir()))

    def test_unrelated_runtime_failure_is_not_rerun_as_part_of_the_checked_scope(self):
        fm = self.root / ".evidence/fm"
        fixture = SKILLS / "evidence-fm/examples/valid-traceable-subscription"
        documents = [json.loads(path.read_text()) for path in fixture.rglob("*.json") if path.name != "model.json"]
        identities = {item["id"]: f"other.{item['id']}" for item in documents}

        def rename(value):
            if isinstance(value, dict):
                return {key: rename(item) for key, item in value.items()}
            if isinstance(value, list):
                return [rename(item) for item in value]
            return identities.get(value, value) if isinstance(value, str) else value

        for document in documents:
            value = rename(document)
            assert isinstance(value, dict)
            if value.get("type") == "rule" and value.get("kind") == "completion":
                value["expression"] = "false"
            document_type = value["type"]
            assert isinstance(document_type, str)
            folder = {"evidence_instance": "validation/instances", "fm_scenario": "validation/scenarios"}.get(document_type, "unrelated")
            identity = value["id"]
            assert isinstance(identity, str)
            path = fm / folder / (identity.replace(".", "--") + ".json")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value), encoding="utf-8")
        result = self.generate()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        match = re.search(r'id="workbench-data">(.*?)</script>', self.page.read_text(), re.S)
        assert match is not None
        data = json.loads(match[1])
        self.assertTrue(data["validation"]["complete"])
        unrelated = [node for node in data["nodes"] if node["id"].startswith("other.") and node["group"] == "scenario"]
        self.assertTrue(unrelated)
        self.assertTrue(all(node["passed"] is None for node in unrelated))

    def test_joint_projection_checks_fm_once_and_hands_result_to_api(self):
        spec = importlib.util.spec_from_file_location(
            "joint_review_generator", SKILLS / "evidence-visualization/scripts/generate.py"
        )
        assert spec is not None and spec.loader is not None
        generator = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(generator)
        before = hashes(self.root)
        with tempfile.TemporaryDirectory(dir=self.root) as directory:
            with patch.object(generator, "run", wraps=generator.run) as execute:
                data = generator.collect(
                    self.root, SKILLS / "evidence-fm", Path(directory),
                    api_skill=SKILLS / "evidence-api", require_api=True,
                    scope_refs=["context.product-procurement", "context.product-catalog"]
                )
            commands = [call.args[0] for call in execute.call_args_list]
            checks = [command for command in commands if command[2].endswith("check_fm.py")]
            api = [command for command in commands if command[2].endswith("fm_api.py")]
            self.assertEqual(1, len(checks))
            self.assertEqual(1, len(api))
            self.assertIn("--fm-check", api[0])
            self.assertIn("--fm-skill", api[0])
            self.assertEqual(str(SKILLS / "evidence-api/scripts/fm_api.py"), api[0][2])
            self.assertTrue(data["validation"]["api"])
        self.assertEqual(before, hashes(self.root))

    def test_missing_api_does_not_publish_an_fm_only_review(self):
        (self.root / ".evidence/api/api.json").unlink()
        before = hashes(self.root)
        result = self.generate()
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("联合审核需要", result.stderr)
        self.assertEqual(before, hashes(self.root))

    def test_missing_api_skill_does_not_fall_back_to_the_fm_package(self):
        before = hashes(self.root)
        result = subprocess.run([
            sys.executable, "-B", str(SKILLS / "evidence-visualization/scripts/generate.py"),
            "--project-root", str(self.root), "--fm-skill", str(SKILLS / "evidence-fm"),
            "--api-skill", str(self.root / "missing api skill"), "--require-api",
        ], capture_output=True, text=True, timeout=120, check=False)
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("独立 evidence-api 包", result.stderr)
        self.assertEqual(before, hashes(self.root))

    def test_invalid_api_keeps_previous_page_and_sources(self):
        (self.root / ".evidence/api/api.json").write_text("{}")
        before = hashes(self.root)
        result = self.generate()
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertNotIn("unrecognized arguments", result.stderr)
        self.assertEqual(before, hashes(self.root))

    def test_invalid_fm_keeps_previous_page_and_sources(self):
        (self.root / ".evidence/fm/model.json").write_text("{}")
        before = hashes(self.root)
        result = self.generate()
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertNotIn("unrecognized arguments", result.stderr)
        self.assertEqual(before, hashes(self.root))


if __name__ == "__main__":
    unittest.main()
