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


def file_hashes(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }


class IsolatedFMTests(unittest.TestCase):
    def setUp(self):
        source = SKILL
        self.assertTrue(
            source.is_dir(), "FM must be usable as an individually installed skill"
        )
        self.directory = tempfile.TemporaryDirectory(prefix="portable fm ")
        self.addCleanup(self.directory.cleanup)
        self.workspace = Path(self.directory.name).resolve()
        self.skill = self.workspace / "installed skill"
        shutil.copytree(
            source, self.skill, ignore=shutil.ignore_patterns("__pycache__")
        )
        self.model = self.workspace / "business model"

        self.samples = self.workspace / "prepared models"
        for name in ("domain", "payment"):
            source = (
                self.skill / "tests/fixtures/domain"
                if name == "domain"
                else self.skill / "tests/fixtures/valid-traceable-subscription"
            )
            shutil.copytree(source, self.samples / name)

    def example(self, name: str):
        shutil.copytree(self.samples / name, self.model)

    def run_script(self, script: str, *args: str) -> subprocess.CompletedProcess[str]:
        return self.run_python(
            str(self.skill / "scripts" / script), str(self.model), *args
        )

    def run_python(self, *args: str) -> subprocess.CompletedProcess[str]:
        env = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        return subprocess.run(
            [sys.executable, "-B", *args],
            cwd=self.workspace,
            env=env,
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )

    def check(self, expected_code: int) -> dict:
        before = file_hashes(self.model)
        result = self.run_script("check_fm.py")
        self.assertEqual(
            expected_code, result.returncode, result.stdout + result.stderr
        )
        self.assertEqual(
            before, file_hashes(self.model), "Checking must not change model sources"
        )
        return json.loads(result.stdout)

    def test_runtime_checks_work_without_tests_or_evals(self):
        for name in ("tests", "evals"):
            shutil.rmtree(self.skill / name)
        before = file_hashes(self.skill)
        for name in ("domain", "payment"):
            with self.subTest(example=name):
                self.example(name)
                report = self.check(0)
                if name == "domain":
                    self.assertIsNone(report["simulationPassed"])
                else:
                    self.assertTrue(report["simulationPassed"])
                    self.assertGreater(report["executedScenarioCount"], 0)
                shutil.rmtree(self.model)
        self.assertEqual(before, file_hashes(self.skill))

    def test_bundled_regressions_run_without_the_repository(self):
        before = file_hashes(self.skill)
        result = self.run_python(
            "-m", "unittest", "discover", "-s", str(self.skill / "tests"), "-v"
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertRegex(result.stderr, r"Ran [1-9][0-9]* tests")
        self.assertEqual(before, file_hashes(self.skill))

    def test_eval_preparation_resolves_bundled_fixtures_from_an_unrelated_cwd(self):
        before = file_hashes(self.skill)
        output = self.workspace / "eval output"
        result = self.run_python(
            str(self.skill / "evals/run_modeling_evals.py"),
            "--workspace",
            str(output),
            "--prepare-only",
        )
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        expected = json.loads((self.skill / "evals/evals.json").read_text())["evals"]
        self.assertEqual(
            len(expected), len(list(output.glob("eval-*/eval_metadata.json")))
        )
        fixture = (
            output
            / "eval-4-missing-confirmation-repair/inputs/missing-confirmation-model/model.yaml"
        )
        self.assertTrue(fixture.is_file())
        self.assertEqual(before, file_hashes(self.skill))

    def test_domain_checks_and_compiles_without_contract_or_fake_simulation(self):
        self.example("domain")
        report = self.check(0)
        self.assertTrue(report["valid"])
        self.assertIsNone(report["simulationPassed"])
        self.assertEqual(0, report["scenarioCount"])
        output = self.workspace / "compiled.json"
        result = self.run_script("compile_fm_model.py", "--output", str(output))
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        compiled = json.loads(output.read_text(encoding="utf-8"))
        self.assertNotIn("fulfillments", compiled)
        self.assertFalse(
            any(
                entity.get("kind") in {"contract", "fulfillment"}
                for entity in compiled["entities"]
            )
        )
        first = output.read_bytes()
        self.assertEqual(
            0,
            self.run_script("compile_fm_model.py", "--output", str(output)).returncode,
        )
        self.assertEqual(first, output.read_bytes())

    def test_empty_suite_does_not_claim_simulation_passed(self):
        self.example("domain")
        (self.model / "validation/scenarios").mkdir(parents=True)
        # A declared but empty validation suite is invalid in the existing FM contract.
        report = self.check(1)
        self.assertFalse(report["valid"])
        self.assertTrue(report["errors"])
        self.assertIsNone(report["simulationPassed"])

    def test_payment_runs_real_scenarios_and_preserves_expected_results(self):
        self.example("payment")
        report = self.check(0)
        self.assertTrue(report["simulationPassed"])
        self.assertGreater(report["scenarioCount"], 0)

    def test_missing_required_evidence_time_is_rejected_without_repair(self):
        self.example("payment")
        # Intentionally break a type definition, not a command or dependency.
        request = next(
            (self.model / "entities").glob("evidence-fulfillment-request--*.yaml")
        )
        text = request.read_text(encoding="utf-8")
        self.assertIn("name: started_at", text)
        request.write_text(
            text.replace("name: started_at", "name: old_start"), encoding="utf-8"
        )
        report = self.check(1)
        self.assertFalse(report["valid"])
        self.assertTrue(report["errors"])
        self.assertIsNone(report["simulationPassed"])

    def test_wrong_business_expectation_fails_instead_of_being_rewritten(self):
        self.example("payment")
        scenario = next((self.model / "validation/scenarios").glob("*.yaml"))
        text = scenario.read_text(encoding="utf-8")
        self.assertRegex(text, r"expectedResult: (true|false)")
        changed = re.sub(
            r"expectedResult: (true|false)",
            lambda match: (
                "expectedResult: " + ("false" if match[1] == "true" else "true")
            ),
            text,
            count=1,
        )
        scenario.write_text(changed, encoding="utf-8")
        report = self.check(1)
        self.assertFalse(report["simulationPassed"])
        self.assertTrue(report["errors"])

    def test_malformed_suite_cannot_be_treated_as_not_applicable(self):
        self.example("domain")
        scenario = self.model / "validation/scenarios/scenario--broken.yaml"
        scenario.parent.mkdir(parents=True)
        scenario.write_text("type: [invalid yaml", encoding="utf-8")
        self.assertFalse(self.check(1)["valid"])

    def test_missing_model_is_a_validation_error(self):
        report = self.check(1)
        self.assertFalse(report["valid"])
        self.assertTrue(report["errors"])

    def test_direct_edit_and_check_work_without_any_extension(self):
        for name in ("tests", "evals"):
            shutil.rmtree(self.skill / name)
        evidence = self.workspace / ".evidence"
        self.model = evidence / "fm"
        self.example("domain")
        notes = evidence / "discovery.md"
        notes.write_text("# Discovery\nKeep existing notes.\n", encoding="utf-8")
        notes_before = notes.read_bytes()
        first = self.check(0)
        manifest = self.model / "model.yaml"
        manifest.write_text(
            manifest.read_text() + "\n# direct edit\n", encoding="utf-8"
        )
        result = self.run_script("check_fm.py")
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        current = json.loads(result.stdout)
        self.assertNotEqual(first["modelDigest"], current["modelDigest"])
        self.assertFalse(current["inputChanged"])
        self.assertEqual({"fm", "discovery.md"}, {p.name for p in evidence.iterdir()})
        report = evidence / "checks/fm/run-001.json"
        report.parent.mkdir(parents=True)
        report.write_text(result.stdout, encoding="utf-8")
        self.assertEqual(current, json.loads(report.read_text()))
        self.assertEqual(current["modelDigest"], self.check(0)["modelDigest"])
        self.assertEqual(notes_before, notes.read_bytes())
