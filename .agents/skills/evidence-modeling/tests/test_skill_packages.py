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
    "evidence-handoff",
    "evidence-fm",
    "evidence-api",
    "evidence-requirements",
    "evidence-modeling",
    "evidence-visualization",
)
WORKFLOW_NAMES = (
    "evidence-task-planning",
    "evidence-delivery",
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
                with self.subTest(document=str(document.relative_to(ROOT))):
                    self.assertNotRegex(
                        document.read_text(encoding="utf-8"),
                        r"插件|\bPi\b|\bGate\b|\.pi/|evidence_ui_|/skill:|受控工作流|专用工具",
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

    def test_evidence_modeling_is_an_explicit_composition_entrypoint(self):
        entry = (ROOT / "evidence-modeling/SKILL.md").read_text(encoding="utf-8")
        self.assertRegex(entry, r"(?m)^disable-model-invocation: true$")
        self.assertIn("evidence-discovery", entry)
        self.assertIn("evidence-fm", entry)
        evaluations = json.loads(
            (ROOT / "evidence-modeling/evals/evals.json").read_text(encoding="utf-8")
        )
        self.assertEqual("evidence-modeling", evaluations["skill_name"])
        categories = {case["category"] for case in evaluations["evals"]}
        self.assertTrue({"discovery-before-model", "discovery-delegation-controls",
                         "combined-model-api-review", "combined-api-blocked",
                         "combined-read-only", "fm-only-restriction",
                         "combined-resource-missing"}.issubset(categories))

    def test_all_project_skills_use_canonical_root(self):
        self.assertEqual(
            set(ALL_NAMES),
            {
                path.name
                for path in ROOT.iterdir()
                if path.is_dir() and path.name.startswith("evidence-")
            },
        )
        for name in WORKFLOW_NAMES:
            entry = ROOT / name / "SKILL.md"
            self.assertTrue(entry.is_file(), f"Missing workflow skill: {name}")
            self.assertTrue(
                entry.read_text(encoding="utf-8").startswith(f"---\nname: {name}\n")
            )

    def test_skill_names_and_catalogs_share_the_evidence_namespace(self):
        index = (ROOT / "README.md").read_text(encoding="utf-8")
        for name in ALL_NAMES:
            with self.subTest(skill=name):
                self.assertRegex(name, r"^evidence-[a-z]+(?:-[a-z]+)*$")
                self.assertIn(f"[{name}]({name}/SKILL.md)", index)
                catalog = json.loads(
                    (ROOT / name / "evals/evals.json").read_text(encoding="utf-8")
                )
                self.assertEqual(name, catalog["skill_name"])
        for resource in (ROOT / "evidence-fm" / "scripts").glob("*.py"):
            self.assertNotIn(".pi/", resource.read_text(encoding="utf-8"))

    def test_evaluations_cover_discovery_controls_and_independent_entrypoints(self):
        cases = []
        for path in (
            ROOT / "evidence-discovery/evals/evals.json",
            ROOT / "evidence-discovery/evals/evidence-tracing.json",
            ROOT / "evidence-fm/evals/behavior.json",
            ROOT / "evidence-requirements/evals/evals.json",
        ):
            self.assertTrue(path.is_file(), f"Missing evaluation catalog: {path}")
            owned_cases = json.loads(path.read_text(encoding="utf-8"))["evals"]
            ids = [case["id"] for case in owned_cases]
            self.assertEqual(len(ids), len(set(ids)), path)
            self.assertEqual(len(owned_cases), len({case['category'] for case in owned_cases}), path)
            self.assertEqual(len(owned_cases), len({case['prompt'] for case in owned_cases}), path)
            cases.extend(owned_cases)
        self.assertTrue(
            {
                "fulfillment", "progressive-contract-with-open-sibling-obligation", "requirements",
                "recursive-responsibility-closure", "grouped-not-global-closure",
                "human-terminal-not-global-completion", "closure-invalidated-by-new-branch",
                "complete-contract-scope-with-pending-independent-contract",
                "responsibility-unknown-blocks-evidence-not-all-progress",
                "language-correction", "language-ambiguity",
                "cash-document-agreement-reconstruction", "key-value-lineage", "document-walkthrough",
                "variation-and-support-boundary", "domain-without-contract",
                "party-cross-context-identity", "party-identity-unresolved", "context-sufficiency-boundary",
                "cash-rights-obligations-discovery", "performance-without-variance",
                "operating-basis-unresolved", "payment-support-and-party-identity",
                "noncash-fulfillment-keeps-economic-anchor", "operating-context-navigation",
                "skill-only-complete-interview", "completed-context-not-selectable",
                "context-navigation-ambiguous-selection", "delivery-requirement-and-result",
                "amount-lineage-and-return", "cross-contract-local-control",
                "cycle-and-evidence-version", "trace-versus-generic-questionnaire",
            }.issubset(
                {case["category"] for case in cases}
            )
        )
        for case in cases:
            self.assertTrue(case["prompt"])
            self.assertTrue(case["expectations"])
            self.assertIn(case["skill"], PORTABLE_NAMES)
            for knowledge in case.get("knowledgeSkills", []):
                self.assertIn(knowledge, PORTABLE_NAMES)
