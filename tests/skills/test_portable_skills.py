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

REPO_ROOT = Path(__file__).resolve().parents[2]
ROOT = REPO_ROOT / ".agents/skills"
PORTABLE_NAMES = (
    "evidence-discovery",
    "evidence-fm",
    "evidence-requirements",
    "fm-api-design",
    "fm-modeling",
    "evidence-visualization",
)
WORKFLOW_NAMES = (
    "evidence-architecture",
    "evidence-planning",
    "evidence-review",
    "evidence-tdd",
)
ALL_NAMES = PORTABLE_NAMES + WORKFLOW_NAMES


def file_hashes(root: Path) -> dict[str, str]:
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }


class SkillPackageTests(unittest.TestCase):
    def test_each_skill_has_portable_frontmatter_and_bounded_entrypoint(self):
        for name in PORTABLE_NAMES:
            with self.subTest(skill=name):
                entry = ROOT / name / "SKILL.md"
                self.assertTrue(entry.is_file(), f"Missing standalone skill: {name}")
                text = entry.read_text(encoding="utf-8")
                self.assertTrue(text.startswith(f"---\nname: {name}\n"))
                self.assertRegex(text, r"(?m)^description: .+")
                self.assertLess(len(text.splitlines()), 180)
                self.assertNotRegex(text, r"evidence_(?:ask|save|finalize|submit)_")
                self.assertNotIn("/Users/", text)

    def test_portable_distribution_does_not_describe_plugins_or_host_workflows(self):
        for name in PORTABLE_NAMES:
            for document in (ROOT / name).rglob("*.md"):
                with self.subTest(document=str(document.relative_to(ROOT))):
                    self.assertNotRegex(
                        document.read_text(encoding="utf-8"),
                        r"插件|\bPi\b|\bGate\b|\.pi/|受控工作流|专用工具",
                    )

    def test_links_resolve_inside_each_individually_copied_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            for name in PORTABLE_NAMES:
                source = ROOT / name
                self.assertTrue(source.is_dir(), f"Missing standalone skill: {name}")
                package = Path(directory).resolve() / name
                shutil.copytree(source, package)
                for doc in package.rglob("*.md"):
                    for link in re.findall(
                        r"\]\(([^\s)]+)\)", doc.read_text(encoding="utf-8")
                    ):
                        if link.startswith(("https://", "http://", "#")):
                            continue
                        target = (doc.parent / link.split("#", 1)[0]).resolve()
                        self.assertTrue(target.is_relative_to(package), (doc, link))
                        self.assertTrue(target.exists(), (doc, link))
                self.assertFalse(any(path.is_symlink() for path in package.rglob("*")))

    def test_fm_modeling_is_an_explicit_composition_entrypoint(self):
        entry = (ROOT / "fm-modeling/SKILL.md").read_text(encoding="utf-8")
        self.assertRegex(entry, r"(?m)^disable-model-invocation: true$")
        self.assertIn("evidence-discovery", entry)
        self.assertIn("evidence-fm", entry)
        self.assertNotRegex(
            entry, r"fm_model_(?:submit|ask)|evidence_(?:ask|save|finalize|submit)_"
        )
        evaluations = json.loads(
            (ROOT / "fm-modeling/evals/evals.json").read_text(encoding="utf-8")
        )
        self.assertEqual("fm-modeling", evaluations["skill_name"])
        self.assertGreaterEqual(len(evaluations["evals"]), 4)

    def test_all_project_skills_use_canonical_root(self):
        self.assertEqual(
            set(ALL_NAMES),
            {
                path.name
                for path in ROOT.iterdir()
                if path.is_dir() and not path.name.startswith(".")
            },
        )
        for name in WORKFLOW_NAMES:
            entry = ROOT / name / "SKILL.md"
            self.assertTrue(entry.is_file(), f"Missing workflow skill: {name}")
            self.assertTrue(
                entry.read_text(encoding="utf-8").startswith(f"---\nname: {name}\n")
            )

    def test_skills_are_canonical_without_legacy_runtime_or_sync_infrastructure(self):
        for path in (
            REPO_ROOT / ".pi/skills/evidence-modeling",
            REPO_ROOT / ".pi/skills",
            REPO_ROOT / "skills",
            ROOT / "evidence-modeling",
            ROOT / "evidence-fm/UPSTREAM.md",
            REPO_ROOT / "tools/skills",
        ):
            self.assertFalse(path.exists(), f"Retired maintenance source: {path}")
        for resource in (ROOT / "evidence-fm" / "scripts").glob("*.py"):
            self.assertNotIn(".pi/", resource.read_text(encoding="utf-8"))

    def test_evaluations_cover_discovery_controls_and_independent_entrypoints(self):
        cases = []
        for path in (
            ROOT / "evidence-discovery/evals/evals.json",
            ROOT / "evidence-fm/evals/behavior.json",
            ROOT / "evidence-requirements/evals/evals.json",
            REPO_ROOT / "tests/skills/host-controls/evals.json",
        ):
            self.assertTrue(path.is_file(), f"Missing evaluation catalog: {path}")
            cases.extend(json.loads(path.read_text(encoding="utf-8"))["evals"])
        self.assertEqual(set(range(1, 10)), {case["id"] for case in cases})
        ids = [case["id"] for case in cases]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(
            {"domain", "fulfillment", "resume", "partial-fm", "requirements"}.issubset(
                {case["category"] for case in cases}
            )
        )
        for case in cases:
            self.assertTrue(case["prompt"])
            self.assertTrue(case["expectations"])
            self.assertIn(case["skill"], PORTABLE_NAMES)
            for knowledge in case.get("knowledgeSkills", []):
                self.assertIn(knowledge, PORTABLE_NAMES)


class IsolatedVisualizationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="portable visual ")
        self.addCleanup(temporary.cleanup)
        self.workspace = Path(temporary.name).resolve()
        self.skill = self.workspace / "installed visual"
        shutil.copytree(
            ROOT / "evidence-visualization",
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

    def test_generation_uses_installed_assets_and_keeps_project_inputs_unchanged(self):
        fm_skill = self.workspace / "separate dependencies" / "formal model"
        shutil.copytree(
            ROOT / "evidence-fm", fm_skill, ignore=shutil.ignore_patterns("__pycache__")
        )
        project = self.workspace / "business project"
        model = project / ".evidence/fm"
        shutil.copytree(fm_skill / "assets/examples/domain", model)
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


class IsolatedFMTests(unittest.TestCase):
    def setUp(self):
        source = ROOT / "evidence-fm"
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

    def example(self, name: str):
        shutil.copytree(self.skill / "assets/examples" / name, self.model)

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
        self.assertEqual("pending", report["stakeholderReview"]["status"])
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
        self.assertEqual("draft", report["modelStatus"])
        self.assertEqual("pending", report["stakeholderReview"]["status"])

    def test_missing_required_evidence_time_is_rejected_without_repair(self):
        self.example("payment")
        # Intentionally break a type definition, not a command or dependency.
        request = next((self.model / "entities").glob("request--*.yaml"))
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
        state = evidence / "state.json"
        state.write_text('{"owner": "host"}\n', encoding="utf-8")
        state_before = state.read_bytes()
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
        self.assertEqual({"fm", "state.json"}, {p.name for p in evidence.iterdir()})
        report = evidence / "checks/fm/run-001.json"
        report.parent.mkdir(parents=True)
        report.write_text(result.stdout, encoding="utf-8")
        self.assertEqual(current, json.loads(report.read_text()))
        self.assertEqual(current["modelDigest"], self.check(0)["modelDigest"])
        self.assertEqual(state_before, state.read_bytes())


if __name__ == "__main__":
    unittest.main()
