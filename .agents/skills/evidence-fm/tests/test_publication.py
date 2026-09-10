"""Filesystem integration tests for standalone FM candidate publication."""

from __future__ import annotations

import fcntl
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

    def run_cli(
        self, *arguments: str, env: dict[str, str] | None = None, script: Path = PUBLISH
    ) -> tuple[subprocess.CompletedProcess[str], dict]:
        result = subprocess.run(
            [sys.executable, "-B", str(script), *arguments],
            cwd=self.root,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", **(env or {})},
            text=True,
            capture_output=True,
            check=False,
            timeout=120,
        )
        return result, json.loads(result.stdout) if result.stdout.strip() else {}

    def run_prepare(
        self, *, script: Path = PUBLISH, candidate: Path | None = None
    ) -> tuple[subprocess.CompletedProcess[str], dict]:
        return self.run_cli(
            "prepare",
            "--candidate",
            str(candidate or self.candidate),
            "--target",
            str(self.target),
            "--source",
            str(self.source),
            "--work-dir",
            str(self.work),
            script=script,
        )

    def prepare_success(self) -> Path:
        result, output = self.run_prepare()
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        return Path(output["receiptPath"])

    def run_apply(
        self, receipt: Path, *, report_dir: Path | None = None, env: dict[str, str] | None = None
    ) -> tuple[subprocess.CompletedProcess[str], dict]:
        return self.run_cli(
            "apply",
            "--receipt",
            str(receipt),
            "--report-dir",
            str(report_dir or self.root / "检查 reports"),
            env=env,
        )

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

    def test_apply_revalidates_and_replaces_the_complete_target(self):
        self.target.mkdir()
        (self.target / "obsolete.yaml").write_text("remove me", encoding="utf-8")
        receipt = self.prepare_success()

        result, output = self.run_apply(receipt)

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("applied", output["status"])
        self.assertTrue(Path(output["reportPath"]).is_file())
        self.assertFalse((self.target / "obsolete.yaml").exists())
        self.assertEqual(tree_digest(self.candidate), tree_digest(self.target))

    def test_apply_rejects_candidate_source_and_target_conflicts(self):
        for changed in ("candidate", "source", "target"):
            with self.subTest(changed=changed):
                receipt = self.prepare_success()
                prepared = json.loads(receipt.read_text(encoding="utf-8"))
                if changed == "candidate":
                    (Path(prepared["candidate"]["path"]) / "changed.txt").write_text("x")
                elif changed == "source":
                    self.source.write_text("更正后的来源", encoding="utf-8")
                else:
                    self.target.mkdir(exist_ok=True)
                    (self.target / "external.txt").write_text("x")

                result, output = self.run_apply(receipt)

                self.assertEqual(5, result.returncode)
                self.assertEqual("conflict", output["status"])
                shutil.rmtree(self.work)
                if self.target.exists():
                    shutil.rmtree(self.target)
                self.source.write_text("来源原话\n", encoding="utf-8")

    def test_repeated_apply_of_identical_candidate_is_noop_after_real_validation(self):
        shutil.copytree(self.candidate, self.target)
        receipt = self.prepare_success()

        result, output = self.run_apply(receipt)

        self.assertEqual(0, result.returncode)
        self.assertEqual("noop", output["status"])
        self.assertTrue(output["validation"]["valid"])

    def test_interruption_after_backup_is_recoverable(self):
        self.target.mkdir()
        (self.target / "previous.txt").write_text("previous", encoding="utf-8")
        previous = tree_digest(self.target)
        receipt = self.prepare_success()

        interrupted, _ = self.run_apply(
            receipt, env={"FM_PUBLICATION_FAILPOINT": "after_target_backup"}
        )
        self.assertEqual(97, interrupted.returncode)
        self.assertFalse(self.target.exists())

        result, output = self.run_cli("recover", "--target", str(self.target))

        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual("restored_previous_target", output["recoveryAction"])
        self.assertEqual(previous, tree_digest(self.target))

    def test_target_lock_prevents_competing_apply(self):
        receipt = self.prepare_success()
        lock_path = self.target.parent / f".{self.target.name}.fm.lock"
        with lock_path.open("a+") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            result, output = self.run_apply(receipt)

        self.assertEqual(5, result.returncode)
        self.assertEqual("conflict", output["status"])
        self.assertFalse(self.target.exists())

    def test_report_failure_distinguishes_an_already_replaced_target(self):
        receipt = self.prepare_success()
        report_file = self.root / "not-a-directory"
        report_file.write_text("occupied", encoding="utf-8")

        result, output = self.run_apply(receipt, report_dir=report_file)

        self.assertEqual(6, result.returncode)
        self.assertEqual("recovery_required", output["status"])
        self.assertTrue(output["targetChanged"])
        self.assertEqual(tree_digest(self.candidate), tree_digest(self.target))
        recovered, recovery = self.run_cli("recover", "--target", str(self.target))
        self.assertEqual(0, recovered.returncode)
        self.assertEqual("completed_replacement", recovery["recoveryAction"])


if __name__ == "__main__":
    unittest.main()
