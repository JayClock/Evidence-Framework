"""Language and multi-lineage contracts; these tests do not measure live interviews."""

import json
import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]
FM = SKILLS / "evidence-fm"
DISCOVERY = SKILLS / "evidence-discovery"


class BilingualInterviewTests(unittest.TestCase):
    def test_canonical_name_has_one_owner_and_two_languages(self):
        text = (FM / "references/domain-language.md").read_text()
        for phrase in ("中文（英文）", "同一个稳定 ID", "name", "label", "不从 ID",
                       "英文名待明确", "每次使用", "不另建英文词典", "共同业务依据"):
            self.assertIn(phrase, text)
        for relative in ("AGENTS.md", "docs/guides/index.md", "docs/evidence-modeling.md"):
            self.assertIn("中文（英文）", (REPO / relative).read_text())

    def test_position_records_evidence_responsibility_not_the_beneficiary(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("责任人：", "实际主体", "证明提供方", "受益角色", "不自动等于责任人",
                       "责任人待明确", "凭证类型只作辅助标签"):
            self.assertIn(phrase, text)
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        self.assertIn("凭证责任人", workflow)
        self.assertIn("各关键数据项", workflow)

    def test_parallel_lineages_use_common_basis_and_local_frontiers(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("一个业务焦点可以并行追溯多个凭证", "共同业务依据", "多条来源链",
                       "不等待整组答完", "其他已判独立的分支", "不逐字段重复提问"):
            self.assertIn(phrase, text)
        for relative in ("references/business-analysis.md", "references/provenance.md"):
            method = (FM / relative).read_text()
            self.assertIn("多条来源链", method)
            self.assertNotIn("当前分支追到终点后回到兄弟分支", method)

    def test_goal_card_and_evidence_story_have_different_purposes(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        for phrase in ("业务目标", "凭证依据说明", "用户故事", "不必每轮重复",
                       "Given / When / Then", "不补造未知结果", "不是履约进度"):
            self.assertIn(phrase, text)
        self.assertIn("不附资料出处", text)
        for skill in (FM, DISCOVERY, SKILLS / "evidence-modeling"):
            frontmatter = skill.joinpath("SKILL.md").read_text().split("---", 2)[1]
            self.assertNotRegex(frontmatter, r"极客时间|直播版|徐昊|资料来源|参考文章|https?://")

    def test_parallel_examples_include_bilingual_position_and_responsibility(self):
        path = DISCOVERY / "examples/parallel-turn.md"
        self.assertTrue(path.is_file())
        text = path.read_text()
        self.assertIn("合成", text)
        displays = re.findall(r"```text\n(.*?)```", text, re.S)
        self.assertEqual([2, 2, 1], [display.count("？") for display in displays])
        for display in displays:
            self.assertEqual(1, display.count("当前位置："))
            self.assertEqual(1, display.count("责任人："))
            self.assertRegex(display, r"付款请求（Payment Request）")
            self.assertNotRegex(display, r"已明确：|尚缺依据：|https?://|资料来源：")
        self.assertIn("parallel-turn.md", (DISCOVERY / "examples/README.md").read_text())

    def test_behavior_catalog_covers_parallel_and_responsibility_boundaries(self):
        cases = json.loads((DISCOVERY / "evals/evals.json").read_text())["evals"]
        indexed = {case["category"]: case for case in cases}
        for category in ("bilingual-responsible-position", "parallel-common-basis",
                         "parallel-mixed-dependencies", "parallel-partial-answer",
                         "beneficiary-not-evidence-owner", "provenance-not-fulfillment-progress",
                         "bilingual-name-unresolved", "parallel-deferred-frontier"):
            self.assertIn(category, indexed)
            case = indexed[category]
            self.assertEqual(["evidence-fm"], case["knowledgeSkills"])
            self.assertGreaterEqual(len(case["expectations"]), 4)
        self.assertEqual(len(cases), len({case["id"] for case in cases}))


if __name__ == "__main__":
    unittest.main()
