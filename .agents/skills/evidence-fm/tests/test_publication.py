"""Filesystem integration tests for standalone FM candidate publication."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
PUBLISH = SKILL_DIR / "scripts/publish_fm.py"


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    if not root.exists():
        return "absent"
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


class PublicationPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="FM 发布 中文 ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.candidate = self.root / "候选 model"
        self.target = self.root / "正式 model"
        self.work = self.root / ".fm-work"
        self.source = self.root / "业务 发现.md"
        self.source.write_text("来源原话\n", encoding="utf-8")
        shutil.copytree(SKILL_DIR / "assets/examples/domain", self.candidate)

    def run_prepare(
        self, *, script: Path = PUBLISH, candidate: Path | None = None
    ) -> tuple[subprocess.CompletedProcess[str], dict]:
        result = subprocess.run(
            [
                sys.executable,
                "-B",
                str(script),
                "prepare",
                "--candidate",
                str(candidate or self.candidate),
                "--target",
                str(self.target),
                "--source",
                str(self.source),
                "--work-dir",
                str(self.work),
            ],
            cwd=self.root,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            text=True,
            capture_output=True,
            check=False,
            timeout=120,
        )
        return result, json.loads(result.stdout)

    def test_prepare_freezes_valid_candidate_and_reports_real_domain_check_and_diff(self):
        self.target.mkdir()
        (self.target / "obsolete.yaml").write_text("old\n", encoding="utf-8")
        before = tree_digest(self.target)

        result, output = self.run_prepare()

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("prepared", output["status"])
        self.assertTrue(output["validation"]["valid"])
        self.assertIsNone(output["validation"]["simulationPassed"])
        self.assertEqual(0, output["validation"]["executedScenarioCount"])
        self.assertIn("obsolete.yaml", output["difference"]["deleted"])
        receipt = json.loads(Path(output["receiptPath"]).read_text(encoding="utf-8"))
        self.assertTrue(Path(receipt["candidate"]["path"]).is_dir())
        self.assertTrue(receipt["receiptDigest"].startswith("sha256:"))
        self.assertEqual(before, tree_digest(self.target))

    def test_invalid_candidate_fails_without_changing_target(self):
        (self.candidate / "model.yaml").unlink()
        self.target.mkdir()
        (self.target / "keep.txt").write_text("keep", encoding="utf-8")
        before = tree_digest(self.target)

        result, output = self.run_prepare()

        self.assertEqual(2, result.returncode)
        self.assertEqual("validation_failed", output["status"])
        self.assertFalse(output["validation"]["valid"])
        self.assertEqual(before, tree_digest(self.target))

    def test_checker_dependency_or_entrypoint_failure_is_never_reported_as_success(self):
        installed = self.root / "isolated skill"
        shutil.copytree(SKILL_DIR, installed, ignore=shutil.ignore_patterns("__pycache__"))
        (installed / "scripts/check_fm.py").unlink()

        result, output = self.run_prepare(script=installed / "scripts/publish_fm.py")

        self.assertEqual(3, result.returncode)
        self.assertEqual("checker_unavailable", output["status"])
        self.assertFalse(output["validation"]["valid"])

    def test_prepare_rejects_symlinked_candidate_tree(self):
        linked = self.candidate / "linked.yaml"
        linked.symlink_to(self.source)

        result, output = self.run_prepare()

        self.assertEqual(4, result.returncode)
        self.assertEqual("unsafe_path", output["status"])
        self.assertFalse(self.target.exists())


if __name__ == "__main__":
    unittest.main()
