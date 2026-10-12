"""Responsibility admission contracts; not proof of human decisions or agent behavior."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class ResponsibilityClosureTests(unittest.TestCase):
    def test_fm_owns_recursive_closure_and_human_terminal_decisions(self):
        path = SKILLS / "evidence-fm/references/responsibility-closure.md"
        self.assertTrue(path.is_file())
        text = path.read_text()
        for phrase in (
            "所有主履约", "各层异常", "人类定义", "人类明确确认全部追责结束",
            "停止或暂缓不等于追责结束", "不限制递归深度", "不能自行缩小",
            "没有后续义务", "法律救济", "不自动认定", "重新核对",
            "只读校验", "纯领域", "业务批准",
        ):
            self.assertIn(phrase, text)

    def test_all_model_edit_routes_require_closure_before_admission(self):
        for relative in (
            "evidence-modeling/SKILL.md", "evidence-modeling/references/workflow.md",
            "evidence-fm/SKILL.md", "evidence-fm/references/input-review.md",
            "evidence-fm/references/batch-assessment.md",
        ):
            with self.subTest(path=relative):
                text = (SKILLS / relative).read_text()
                self.assertIn("追责结束", text)
                self.assertIn("人类", text)
                reference = (
                    "references/workflow.md"
                    if relative == "evidence-modeling/SKILL.md"
                    else "responsibility-closure.md"
                )
                self.assertIn(reference, text)
        fm = (SKILLS / "evidence-fm/SKILL.md").read_text()
        self.assertIn("references/editing-workflow.md", fm)
        flow = (SKILLS / "evidence-fm/references/editing-workflow.md").read_text()
        self.assertIn("admission -->|满足| mapping", flow)
        self.assertIn("mapping --> edit", flow)
        self.assertIn("admission -->|不满足或失效| blocked", flow)
        guide = (REPO / "docs/evidence-modeling.md").read_text()
        self.assertIn("人类明确确认全部追责结束", guide)
        self.assertIn("不绕过追责结束门槛", guide)

    def test_discovery_never_self_declares_completion(self):
        for relative in ("SKILL.md", "references/interview.md"):
            text = (SKILLS / "evidence-discovery" / relative).read_text()
            self.assertIn("人类", text)
            self.assertIn("追责结束", text)
            self.assertIn("每轮", text)
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        self.assertIn("停止或暂缓不等于追责结束", interview)
        self.assertIn("等待人类", interview)
        self.assertIn("不自动恢复", interview)

    def test_closure_evidence_lives_in_discovery_not_model_status(self):
        document = json.loads((SKILLS / "evidence-discovery/assets/discovery-template.json").read_text())
        closure = document["business"]["responsibilityClosure"]
        self.assertEqual(set(closure), {
            "scope", "scopeSourceRefs", "basisRefs", "mainFulfillmentRefs", "chainRefs",
            "terminalDecisions", "unresolvedRefs", "completionSourceRefs",
        })
        self.assertIn("humanSourceRefs", closure["terminalDecisions"][0])
        self.assertNotIn("status", closure)
        self.assertNotIn("approved", closure)
        self.assertIn("追责结束", json.dumps(document, ensure_ascii=False))

    def test_partial_admission_bypasses_are_removed(self):
        retired = (
            "不是首版模型或独立主履约产出的全局准入条件",
            "未明的下游补偿不自动阻塞独立主履约",
            "付款可以 ready，赔付 pending",
            "不要求本轮全部找到终点",
            "已获得足够材料时可以正常结束，不强制解决所有历史问题",
            "不把所有未知标成全局阻塞",
            "不把所有未知作为全局阻塞",
            "直接将来源充分的付款履约切片写入当前模型",
        )
        documents = [REPO / "docs/evidence-modeling.md", SKILLS / "README.md"]
        for name in ("evidence-modeling", "evidence-discovery", "evidence-fm"):
            documents.extend((SKILLS / name).rglob("*.md"))
            documents.extend((SKILLS / name / "evals").glob("*.json"))
        for path in documents:
            with self.subTest(path=str(path)):
                for phrase in retired:
                    self.assertNotIn(phrase, path.read_text())

    def test_evals_cover_recursive_and_human_controlled_admission(self):
        document = json.loads((SKILLS / "evidence-discovery/evals/evals.json").read_text())
        indexed = {case["category"]: case for case in document["evals"]}
        for category in (
            "recursive-responsibility-closure", "human-stop-not-completion",
            "human-terminal-not-global-completion", "closure-invalidated-by-new-branch",
        ):
            self.assertIn(category, indexed)
            self.assertGreaterEqual(len(indexed[category]["expectations"]), 3)
        modeling = json.loads((SKILLS / "evidence-modeling/evals/evals.json").read_text())
        partial = next(case for case in modeling["evals"] if case["id"] == 8)
        self.assertIn("不修改", partial["expected_output"])
        self.assertIn("追责结束", partial["expected_output"])
        behavior = json.loads((SKILLS / "evidence-fm/evals/behavior.json").read_text())
        for case in behavior["evals"]:
            self.assertTrue(any("追责结束" in item for item in case["expectations"]))


if __name__ == "__main__":
    unittest.main()
