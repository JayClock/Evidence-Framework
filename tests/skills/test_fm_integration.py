"""Repository integration checks stay outside the independently installed FM skill."""

import json
import unittest
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]


class FMIntegrationTests(unittest.TestCase):
    def test_extension_only_registers_one_command_and_one_question_tool(self):
        extension = REPOSITORY / ".pi/extensions/fm-modeling"
        commands = (extension / "commands.ts").read_text(encoding="utf-8")
        sources = "\n".join(
            path.read_text(encoding="utf-8")
            for path in extension.glob("*.ts")
            if not path.name.endswith(".spec.ts")
        )
        self.assertEqual(1, commands.count("registerCommand("))
        self.assertIn("registerCommand('fm-model'", commands)
        self.assertEqual(1, sources.count("registerTool("))
        self.assertIn("name: 'fm_ui_question'", sources)
        self.assertNotIn("/evidence/", sources)
        self.assertNotIn(".evidence/state", sources)

    def test_package_verification_covers_portable_fm_tests(self):
        package = json.loads((REPOSITORY / "package.json").read_text(encoding="utf-8"))
        scripts = package["scripts"]
        self.assertIn("fm-modeling:verify", scripts)
        self.assertIn(".agents/skills/evidence-fm/tests", scripts["skills:test:fm"])
        self.assertIn("schemas/*.json", scripts["fm-modeling:format:check"])

    def test_composition_documents_use_only_current_fm_schema(self):
        files = [
            ".agents/skills/fm-modeling/SKILL.md",
            ".agents/skills/fm-modeling/references/workflow.md",
            ".agents/skills/fm-modeling/evals/evals.json",
            "docs/fm-modeling.md",
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
        entry = (REPOSITORY / ".agents/skills/fm-modeling/SKILL.md").read_text(
            encoding="utf-8"
        )
        workflow = (
            REPOSITORY / ".agents/skills/fm-modeling/references/workflow.md"
        ).read_text(encoding="utf-8")
        evals = json.loads(
            (REPOSITORY / ".agents/skills/fm-modeling/evals/evals.json").read_text(
                encoding="utf-8"
            )
        )["evals"]

        for phrase in (
            "业务逻辑",
            "领域逻辑",
            "工具／胶水",
            "识别业务变化",
            "<category>-<kind>--<id-suffix>.yaml",
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
