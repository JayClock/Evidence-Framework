"""Skill composition and repository verification checks owned by evidence-modeling."""

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPOSITORY = Path(__file__).resolve().parents[4]


class FMIntegrationTests(unittest.TestCase):
    def test_repository_glossary_has_no_parallel_model_definition(self):
        path = REPOSITORY / ".evidence/glossary.json"
        before = path.read_bytes()
        command = [sys.executable, "-B", str(REPOSITORY / ".agents/skills/evidence-fm/scripts/check_glossary.py"), str(path)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(before, path.read_bytes())
        self.assertEqual(0, run.returncode, run.stdout + run.stderr)
        result = json.loads(run.stdout)
        registered = json.loads(before)["terms"]
        resolved = {term["id"]: term for term in result["resolvedTerms"]}
        self.assertEqual(len(registered), result["termCount"])
        self.assertCountEqual([term["id"] for term in registered], resolved)
        self.assertEqual(len(registered), len(result["resolvedTerms"]))
        for term in registered:
            if term["kind"] == "model":
                self.assertNotIn("name", term)
                self.assertNotIn("definition", term)
                self.assertEqual(term["target"], resolved[term["id"]]["target"])

    def test_registry_evolution_does_not_lock_counts_or_a_business_term(self):
        fm = REPOSITORY / ".agents/skills/evidence-fm"
        with tempfile.TemporaryDirectory() as directory:
            repository = Path(directory)
            shutil.copytree(
                fm, repository / ".agents/skills/evidence-fm",
                ignore=shutil.ignore_patterns("tests", "evals", "examples", "__pycache__"),
            )
            evidence = repository / ".evidence"
            shutil.copytree(fm / "tests/fixtures/valid-subscription", evidence / "fm")
            source = next(
                path for path in (evidence / "fm").rglob("*.json")
                if json.loads(path.read_text()).get("id") == "contract.content-subscription"
            )
            document = json.loads(source.read_text())
            document["label"] = "内容产品订阅合同（Content Subscription Contract）"
            document["notes"] = "本次隔离合成测试中的内容订阅协议。"
            source.write_text(json.dumps(document, ensure_ascii=False))
            terms = [{
                "id": "term.synthetic-contract", "kind": "model",
                "target": {"objectRef": "contract.content-subscription"},
            }]
            for identity in ("first", "second"):
                terms.append({
                    "id": f"term.synthetic-{identity}", "kind": "standalone",
                    "name": f"合成概念-{identity}（Synthetic Concept {identity}）", "definition": "隔离测试中的未建模概念。",
                })
                (evidence / "glossary.json").write_text(json.dumps(
                    {"schemaVersion": "2.0", "terms": terms}, ensure_ascii=False,
                ))
                with self.subTest(terms=len(terms)), patch(f"{__name__}.REPOSITORY", repository):
                    self.test_repository_glossary_has_no_parallel_model_definition()

    def test_modeling_is_exclusively_skill_driven(self):
        self.assertFalse((REPOSITORY / ".pi/extensions/evidence-modeling").exists())
        constitution = (REPOSITORY / "AGENTS.md").read_text()
        self.assertIn("建模只通过 Skill 执行", constitution)
        self.assertNotIn("可选 UI 包装", constitution)

    def test_project_script_entrypoints_exist(self):
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
        self.assertFalse(any(name.startswith("evidence-modeling:") for name in scripts))
        self.assertIn(
            ".agents/skills/evidence-modeling/tests/run_skill_tests.py",
            scripts["skills:test"],
        )
        self.assertIn("tools/python/python.mjs", scripts["skills:test"])
        self.assertEqual("npm run skills:test && npm run skills:format:check", scripts["skills:verify"])
        self.assertIn(".agents/skills/evidence-fm/tests", scripts["skills:test:fm"])
        self.assertIn("tools/python/python.mjs", scripts["skills:test:fm"])
        self.assertIn("python:test", scripts["test"])
        self.assertIn("tools/python/python.spec.mjs", scripts["python:test"])
        self.assertIn("schemas/*.json", scripts["skills:format:check"])

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

        for delegate in ("evidence-discovery", "evidence-fm", "evidence-visualization"):
            self.assertIn(delegate, entry)
        self.assertIn("references/workflow.md", entry)
        fm_entry = (REPOSITORY / ".agents/skills/evidence-fm/SKILL.md").read_text()
        for reference in ("business-analysis.md", "domain-language.md", "format.md", "semantics.md"):
            self.assertIn(reference, fm_entry)
        language = (REPOSITORY / ".agents/skills/evidence-fm/references/domain-language.md").read_text()
        for phrase in ("定义拥有者", "保留原 `term.*`", "model 引用"):
            self.assertIn(phrase, language)
        method = (REPOSITORY / ".agents/skills/evidence-fm/references/business-analysis.md").read_text()
        self.assertIn("领域对象", method)
        self.assertIn("工具／胶水", method)
        for phrase in (
            "文件归属", "恢复一个分支", "不是原子事务", "modelDigest",
            "只校验请求不写任何项目文件", "不自动解除访谈停止状态",
        ):
            self.assertIn(phrase, workflow + entry)
        for phrase in ("合同与履约", "逐项、递归核对违约责任", "渠道协商", "Evidence Role"):
            self.assertIn(phrase, method)
        self.assertNotIn("## 分析路线", workflow)
        self.assertNotIn("## 组合流程", entry)
        categories = {case["category"] for case in evals}
        self.assertTrue({"discovery-before-model", "discovery-delegation-controls",
                         "edit-without-global-admission", "unclosed-scope-blocks-generation"}
                        .issubset(categories))


if __name__ == "__main__":
    unittest.main()
