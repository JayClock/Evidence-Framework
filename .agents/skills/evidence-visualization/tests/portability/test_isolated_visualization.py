"""Portable distribution contracts; not an LLM behavior or stakeholder evaluation."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
FM_SKILL = Path(
    os.environ.get("EVIDENCE_FM_SKILL", SKILL.parent / "evidence-fm")
).resolve()


def file_hashes(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }


class IsolatedVisualizationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="portable visual ")
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve()
        self.skill = self.workspace / "installed visual"
        shutil.copytree(
            SKILL,
            self.skill,
            ignore=shutil.ignore_patterns("__pycache__"),
        )

    def run_python(self, *args):
        return subprocess.run(
            [sys.executable, "-B", *map(str, args)],
            cwd=self.workspace,
            env={k: v for k, v in os.environ.items() if k != "PYTHONPATH"},
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

    def test_bundled_tests_do_not_need_the_repository(self):
        before = file_hashes(self.skill)
        result = self.run_python(
            "-m", "unittest", "discover", "-s", self.skill / "tests", "-v"
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(before, file_hashes(self.skill))

    def test_generation_uses_installed_fm_and_keeps_project_inputs_unchanged(self):
        fm_skill = self.workspace / "separate dependencies" / "formal model"
        shutil.copytree(
            FM_SKILL, fm_skill, ignore=shutil.ignore_patterns("__pycache__")
        )
        project = self.workspace / "business project"
        model = project / ".evidence/fm"
        shutil.copytree(fm_skill / "tests/fixtures/domain", model)
        for name in ("tests", "evals"):
            shutil.rmtree(self.skill / name)
        before_model, before_skill = file_hashes(model), file_hashes(self.skill)
        before_dependency = file_hashes(fm_skill)
        result = self.run_python(
            self.skill / "scripts/generate.py",
            "--project-root",
            project,
            "--fm-skill",
            fm_skill,
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        page = project / ".evidence/views/index.html"
        self.assertEqual(str(page), json.loads(result.stdout)["output"])
        match = re.search(
            r'<script type="application/json" id="review-data">(.*?)</script>',
            page.read_text(),
            re.DOTALL,
        )
        if match is None:
            self.fail("Generated page has no embedded review data")
        data = json.loads(match[1])
        self.assertTrue(data["check"]["valid"])
        self.assertIsNone(data["api"])
        self.assertIsNone(data["simulation"]["simulationPassed"])
        self.assertEqual(before_model, file_hashes(model))
        self.assertEqual(before_skill, file_hashes(self.skill))
        self.assertEqual(before_dependency, file_hashes(fm_skill))
        self.assertFalse((project / "tools").exists())
        self.assertFalse((project / ".agents").exists())
        self.assertFalse((project / ".evidence/api").exists())
