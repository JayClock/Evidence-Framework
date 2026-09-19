"""Composition and optional host integration checks owned by evidence-modeling."""

import json
import unittest
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[4]


class FMIntegrationTests(unittest.TestCase):
    def test_extension_only_registers_one_command_and_one_question_tool(self):
        extension = REPOSITORY / ".pi/extensions/evidence-modeling"
        commands = (extension / "commands.ts").read_text(encoding="utf-8")
        sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in extension.glob("*.ts")
            if not path.name.endswith(".spec.ts")
        )
        self.assertEqual(1, commands.count("registerCommand("))
        self.assertIn("registerCommand('evidence-model'", commands)
        self.assertEqual(1, sources.count("registerTool("))
        self.assertIn("name: 'evidence_ui_question'", sources)

    def test_project_extension_and_script_entrypoints_exist(self):
        extensions = REPOSITORY / ".pi/extensions"
        self.assertEqual(
            {"evidence-modeling"},
            {path.name for path in extensions.iterdir() if path.is_dir()},
        )
        package = json.loads((REPOSITORY / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        for command in scripts.values():
            import re

            for target in re.findall(r"npm run ([a-zA-Z0-9:_-]+)", command):
                self.assertIn(target, scripts, command)
            for target in re.findall(r"(?<![\w/])([.]pi/[\w./-]+)", command):
                self.assertTrue((REPOSITORY / target).exists(), target)
        config = json.loads((REPOSITORY / "pyrightconfig.json").read_text())
        for environment in config["executionEnvironments"]:
            for target in [environment["root"], *environment.get("extraPaths", [])]:
                self.assertTrue((REPOSITORY / target).is_dir(), target)

    def test_package_verification_covers_portable_fm_tests(self):
        package = json.loads((REPOSITORY / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        self.assertIn("evidence-modeling:verify", scripts)
        self.assertIn(
            ".agents/skills/evidence-modeling/tests/run_skill_tests.py",
            scripts["skills:test"],
        )
        self.assertIn("tools/python/python.mjs", scripts["skills:test"])
        self.assertEqual("npm run skills:test", scripts["skills:verify"])
        self.assertIn(".agents/skills/evidence-fm/tests", scripts["skills:test:fm"])
        self.assertIn("tools/python/python.mjs", scripts["skills:test:fm"])
        self.assertIn("python:test", scripts["test"])
        self.assertIn("tools/python/python.spec.mjs", scripts["python:test"])
        self.assertIn("schemas/*.json", scripts["evidence-modeling:format:check"])

    def test_composition_documents_use_only_current_fm_schema(self):
        files = [
            ".agents/skills/evidence-modeling/SKILL.md",
            ".agents/skills/evidence-modeling/references/workflow.md",
            ".agents/skills/evidence-modeling/evals/evals.json",
            "docs/evidence-modeling.md",
        ]
        retired = {
            "contractRef",
            "requestRef",
            "requestInterval",
            "confirmationRefs",
            "subjectRefs",
            "completionPolicy",
            "requestTrigger",
            "confirmationTriggers",
            "cross_context_reference",
        }
        for relative in files:
            text = (REPOSITORY / relative).read_text()
            for term in retired:
                self.assertNotIn(term, text, relative)

    def test_composition_exposes_fulfillment_analysis_before_schema_mapping(self):
        entry = (REPOSITORY / ".agents/skills/evidence-modeling/SKILL.md").read_text(
            encoding="utf-8"
        )
        workflow = (
            REPOSITORY / ".agents/skills/evidence-modeling/references/workflow.md"
        ).read_text(encoding="utf-8")
        evals = json.loads(
            (
                REPOSITORY / ".agents/skills/evidence-modeling/evals/evals.json"
            ).read_text(encoding="utf-8")
        )["evals"]

        for phrase in (
            "业务逻辑",
            "领域逻辑",
            "工具／胶水",
            "识别业务变化",
            "<category>-<kind>--<id-suffix>.json",
            "旧图例或简化分析不能覆盖现行约束",
        ):
            self.assertIn(phrase, entry)
        for phrase in (
            "找主要履约",
            "找未履约后果",
            "递归追踪责任",
            "合同前渠道",
            "简化视图必须附来源",
            "Evidence Role",
        ):
            self.assertIn(phrase, workflow)
        self.assertTrue({9, 10, 11, 12}.issubset({case["id"] for case in evals}))


if __name__ == "__main__":
    unittest.main()
