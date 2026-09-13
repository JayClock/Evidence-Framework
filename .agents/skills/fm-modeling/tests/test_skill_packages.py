"""Portable distribution contracts; not an LLM behavior or stakeholder evaluation."""

from __future__ import annotations

import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
ROOT = Path(__file__).resolve().parents[2]
PORTABLE_NAMES = (
    "evidence-discovery",
    "evidence-fm",
    "evidence-requirements",
    "fm-api-design",
    "fm-modeling",
    "evidence-visualization",
)
WORKFLOW_NAMES = (
    "smart-domain-task-planning",
    "smart-domain-delivery",
)
ALL_NAMES = PORTABLE_NAMES + WORKFLOW_NAMES


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
                self.assertNotIn("/Users/", text)

    def test_portable_distribution_does_not_describe_plugins_or_host_workflows(self):
        for name in PORTABLE_NAMES:
            for document in (ROOT / name).rglob("*.md"):
                # Integration test instructions describe the optional UI adapter.
                if document == ROOT / "fm-modeling/tests/README.md":
                    continue
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
        self.assertNotRegex(entry, r"fm_model_(?:submit|ask)")
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
        ):
            self.assertTrue(path.is_file(), f"Missing evaluation catalog: {path}")
            cases.extend(json.loads(path.read_text(encoding="utf-8"))["evals"])
        self.assertEqual({1, 2, 3, 4, 5, 6, 8, 9}, {case["id"] for case in cases})
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
