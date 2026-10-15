"""Independent, non-adjacent installs; not agent behavior or business approval."""

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

API = Path(__file__).resolve().parents[2]
FM = Path(os.environ.get("EVIDENCE_FM_SKILL", API.parent / "evidence-fm")).resolve()


def hashes(root):
    return {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in root.rglob("*") if path.is_file() and "__pycache__" not in path.parts}


class IsolatedAPITests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="portable api ")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.api = self.root / "installed api"
        self.fm = self.root / "separate dependencies/formal model"
        for source, target in ((API, self.api), (FM, self.fm)):
            shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", ".ruff_cache"))
        self.project = self.root / "business project"
        fixture = self.api / "examples/full-lifecycle"
        self.model = self.project / ".evidence/fm"
        shutil.copytree(fixture / "fm", self.model)
        self.source = self.project / ".evidence/api/api.json"
        self.source.parent.mkdir(parents=True)
        shutil.copy2(fixture / "api.json", self.source)
        result = self.run_python(self.fm / "scripts/check_fm.py", self.model,
                                 "--scope", "context.product-procurement", "--scope", "context.product-catalog")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.report = self.root / "fm-check.json"
        self.report.write_text(result.stdout)
        self.before = hashes(self.project), hashes(self.api), hashes(self.fm)

    def run_python(self, *args, env=None):
        environment = {k: v for k, v in os.environ.items()
                       if k not in {"PYTHONPATH", "EVIDENCE_FM_SKILL"}}
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        environment.update(env or {})
        return subprocess.run([sys.executable, "-B", *map(str, args)], cwd=self.root,
                              env=environment, capture_output=True, text=True,
                              timeout=120, check=False)

    def command(self, action, *args, fm=None, env=None):
        return self.run_python(self.api / "scripts/fm_api.py", action,
                               "--project-root", self.project, "--fm", self.model,
                               "--fm-check", self.report,
                               "--fm-skill", fm or self.fm, *args, env=env)

    def test_cli_works_without_maintenance_files_or_adjacent_fm(self):
        for package in (self.api, self.fm):
            for name in ("tests", "evals"):
                shutil.rmtree(package / name)
        before = hashes(self.model), self.source.read_bytes(), hashes(self.api), hashes(self.fm)
        for action in ("inspect", "check", "project"):
            args = [] if action == "inspect" else ["--api", self.source]
            result = self.command(action, *args)
            self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        generated = self.source.parent / "generated"
        self.assertTrue((generated / "openapi.json").is_file())
        self.assertEqual(before, (hashes(self.model), self.source.read_bytes(), hashes(self.api), hashes(self.fm)))

    def test_bundled_regressions_run_with_an_explicit_fm_install(self):
        result = self.run_python("-m", "unittest", "discover", "-s", self.api / "tests", "-v",
                                 env={"EVIDENCE_FM_SKILL": str(self.fm)})
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertRegex(result.stderr, r"Ran [1-9][0-9]* tests")
        self.assertEqual(self.before, (hashes(self.project), hashes(self.api), hashes(self.fm)))

    def test_missing_fm_dependency_fails_without_fallback_or_writes(self):
        result = self.command("check", "--api", self.source, fm=self.root / "missing fm")
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("FM_SKILL_INVALID", result.stdout)
        self.assertNotIn("Traceback", result.stderr)
        self.assertEqual(self.before, (hashes(self.project), hashes(self.api), hashes(self.fm)))

    def test_cli_does_not_discover_an_implicit_sibling_fm(self):
        result = self.run_python(self.api / "scripts/fm_api.py", "inspect",
                                 "--project-root", self.project, "--fm", self.model,
                                 "--fm-check", self.report)
        self.assertEqual(2, result.returncode)
        self.assertIn("--fm-skill", result.stderr)
        self.assertEqual(self.before, (hashes(self.project), hashes(self.api), hashes(self.fm)))

    def test_projection_cannot_replace_either_installed_skill(self):
        for package in (self.api, self.fm):
            result = self.run_python(self.api / "scripts/fm_api.py", "project",
                                     "--project-root", self.root, "--fm", self.model,
                                     "--fm-check", self.report, "--fm-skill", self.fm,
                                     "--api", self.source, "--out", package)
            self.assertEqual(1, result.returncode, result.stdout + result.stderr)
            self.assertIn("OUTPUT_INPUT_CONFLICT", result.stderr)
        self.assertEqual(self.before, (hashes(self.project), hashes(self.api), hashes(self.fm)))

    def test_stale_fm_result_does_not_publish_or_recheck(self):
        manifest = self.model / "model.json"
        manifest.write_text(manifest.read_text() + "\n")
        before = hashes(self.project)
        result = self.command("project", "--api", self.source)
        self.assertEqual(1, result.returncode, result.stdout + result.stderr)
        self.assertIn("FM_CHECK_STALE", result.stdout)
        self.assertEqual(before, hashes(self.project))
        self.assertFalse((self.source.parent / "generated").exists())


if __name__ == "__main__":
    unittest.main()
