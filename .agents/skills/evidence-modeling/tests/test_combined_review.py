"""Joint modeling contracts and real offline projection; not agent/human approval evidence."""

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


def hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob("*") if p.is_file()}


class CombinedWorkflowContracts(unittest.TestCase):
    def test_entry_composes_model_api_and_one_review_with_narrow_permissions(self):
        entry = (SKILLS / "evidence-modeling/SKILL.md").read_text()
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        for phrase in ("evidence-fm", "evidence-api-design", "evidence-visualization",
                       "一次触发", "只修改 FM", "只校验", "不自动批准"):
            self.assertIn(phrase, entry)
        for phrase in ("FM → API → 联合审核", "--require-api", "不是原子事务",
                       "保留已有审核页", "modelDigest", "不反向修改 FM"):
            self.assertIn(phrase, workflow)
        self.assertLess(workflow.index("### 1. FM"), workflow.index("### 2. API"))
        self.assertLess(workflow.index("### 2. API"), workflow.index("### 3. 联合审核"))
        self.assertNotIn("完成当前分支后停止，不自动进入需求、API", entry)

    def test_current_project_entrypoints_describe_the_joint_workflow(self):
        for path in (REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md",
                     SKILLS / "README.md", REPO / ".pi/extensions/evidence-modeling/README.md"):
            with self.subTest(path=path):
                text = path.read_text()
                self.assertIn("联合审核", text)
                self.assertIn("API", text)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertNotIn("另行要求 API 时", guide)

    def test_eval_catalog_covers_joint_success_and_failure_boundaries(self):
        cases = json.loads((SKILLS / "evidence-modeling/evals/evals.json").read_text())["evals"]
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        for category in ("combined-model-api-review", "combined-api-blocked",
                         "combined-read-only", "fm-only-restriction", "combined-resource-missing"):
            case = next((c for c in cases if c.get("category") == category), None)
            self.assertIsNotNone(case, category)
            assert case is not None
            self.assertGreaterEqual(len(case["assertions"]), 3)


class JointReviewIntegrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="joint review ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        fixture = SKILLS / "evidence-api-design/tests/fixtures/full-lifecycle"
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
            "--api-skill", str(SKILLS / "evidence-api-design"), "--require-api",
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

    def test_missing_api_does_not_publish_an_fm_only_review(self):
        (self.root / ".evidence/api/api.json").unlink()
        before = hashes(self.root)
        result = self.generate()
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("联合审核需要", result.stderr)
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
