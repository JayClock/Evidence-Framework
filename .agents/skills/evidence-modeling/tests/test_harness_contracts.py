"""Prompt/fixture separation and eval-loop contracts; not agent behavior evidence."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
EVALUATED = ("evidence-discovery", "evidence-fm", "evidence-api", "evidence-modeling")
LINK = re.compile(r"\[[^\]]+\]\(([^\s)]+)\)")


class PromptSourceSeparationTests(unittest.TestCase):
    def test_prompt_layer_does_not_route_to_synthetic_fixtures(self):
        for name in EVALUATED + ("evidence-visualization",):
            documents = [SKILLS / name / "SKILL.md"]
            documents += sorted((SKILLS / name / "references").rglob("*.md"))
            for document in documents:
                for href in LINK.findall(document.read_text(encoding="utf-8")):
                    if href.startswith(("https://", "http://", "#")):
                        continue
                    target = (document.parent / href.split("#", 1)[0]).resolve()
                    with self.subTest(document=document.relative_to(SKILLS), link=href):
                        self.assertNotIn("fixtures", target.parts)
                        self.assertNotIn("examples", target.parts)

    def test_samples_live_only_under_test_directories(self):
        for name in EVALUATED:
            package = SKILLS / name
            self.assertFalse((package / "examples").exists(), name)
            fixtures = package / "tests" / "fixtures"
            if not (package / "tests").is_dir():
                self.assertFalse(fixtures.exists(), f"{name} 不应分发夹具")
                continue
            self.assertTrue((package / "tests" / "README.md").is_file(), name)
            self.assertRegex(
                (package / "tests" / "README.md").read_text(encoding="utf-8"),
                r"夹具|测试数据",
                name,
            )
            if fixtures.is_dir():
                indexes = sorted(
                    path for path in fixtures.rglob("README.md") if path.parent == fixtures
                )
                self.assertEqual([fixtures / "README.md"], indexes, f"{name} 只保留一个夹具索引")
                self.assertRegex(
                    (fixtures / "README.md").read_text(encoding="utf-8"),
                    r"\]\([^)]+\)",
                    f"{name} 的夹具索引应链接到夹具",
                )


class EvalLoopContractTests(unittest.TestCase):
    def cases(self, name):
        return json.loads((SKILLS / name / "evals" / "cases.json").read_text(encoding="utf-8"))

    def test_each_skill_ships_runnable_cases_and_a_harness(self):
        for name in EVALUATED:
            evals = SKILLS / name / "evals"
            for required in ("README.md", "cases.json", "harness.py", "runner.py"):
                with self.subTest(skill=name, file=required):
                    self.assertTrue((evals / required).is_file(), (name, required))
            runner = (evals / "runner.py").read_text(encoding="utf-8")
            self.assertIn("from harness import", runner)
            self.assertIn("compare_with_baseline", runner)

    def test_cases_cover_content_trigger_and_a_negative_control(self):
        for name in EVALUATED:
            cases = self.cases(name)
            self.assertGreaterEqual(len(cases), 3, name)
            categories = {case.get("category") for case in cases}
            self.assertIn("trigger", categories, name)
            self.assertTrue(
                any(case.get("expect_trigger") is False for case in cases),
                f"{name} 缺少负面控制用例",
            )
            for case in cases:
                with self.subTest(skill=name, case=case.get("id")):
                    self.assertTrue(case.get("rubric"), "每条用例都要有可判定的评分标准")
                    self.assertTrue(case.get("deterministic_rule"))
                    self.assertNotIn("tests/fixtures", case.get("prompt", ""))

    def test_baselines_are_real_runs_not_mock_results(self):
        for name in EVALUATED:
            baseline = SKILLS / name / "evals" / "eval_results.json"
            if not baseline.is_file():
                continue
            data = json.loads(baseline.read_text(encoding="utf-8"))
            with self.subTest(skill=name):
                self.assertEqual("agent", data.get("mode"))
                self.assertIn("baseline", data)
                self.assertGreater(data.get("total_cases", 0), 0)


if __name__ == "__main__":
    unittest.main()
