"""Composition and optional host integration checks owned by evidence-modeling."""

import json
import subprocess
import sys
import unittest
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[4]


class FMIntegrationTests(unittest.TestCase):
    def test_repository_glossary_has_no_parallel_model_definition(self):
        path = REPOSITORY / ".evidence/glossary.json"
        before = path.read_bytes()
        command = [sys.executable, "-B", str(REPOSITORY / ".agents/skills/evidence-fm/scripts/check_glossary.py"), str(path)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(0, run.returncode, run.stdout + run.stderr)
        result = json.loads(run.stdout)
        self.assertEqual(30, result["termCount"])
        self.assertEqual(26, sum(t["kind"] == "model" for t in result["resolvedTerms"]))
        refund = next(t for t in result["resolvedTerms"] if t["id"] == "term.refund-received-evidence")
        self.assertEqual("confirmation.refund", refund["target"]["objectRef"])
        self.assertIn("不是退款指令受理回执", refund["definition"])
        self.assertEqual(before, path.read_bytes())

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

    def test_composition_routes_analysis_and_keeps_method_ownership(self):
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
            "business-analysis.md",
            "domain-language.md",
            "先业务分析，再按当前 Schema 映射与校验",
            "定义拥有者",
            "将条目替换为 FM 引用",
            "目录、命名与结构以当前 FM Schema",
        ):
            self.assertIn(phrase, entry)
        for phrase in (
            "文件归属", "恢复一个分支", "不是原子事务", "modelDigest",
            "只校验请求不写任何项目文件", "不自动解除访谈停止状态",
        ):
            self.assertIn(phrase, workflow + entry)
        method = (REPOSITORY / ".agents/skills/evidence-fm/references/business-analysis.md").read_text()
        for phrase in ("合同与履约", "逐项、递归核对违约责任", "渠道协商", "Evidence Role"):
            self.assertIn(phrase, method)
        self.assertNotIn("## 分析路线", workflow)
        self.assertNotIn("## 组合流程", entry)
        self.assertTrue({9, 10, 11, 12}.issubset({case["id"] for case in evals}))


if __name__ == "__main__":
    unittest.main()
