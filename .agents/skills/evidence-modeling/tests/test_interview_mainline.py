"""Static mainline contracts; these checks do not prove interview quality."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class InterviewMainlineTests(unittest.TestCase):
    def test_entrypoints_route_to_analysis_not_only_glossary(self):
        for name in ("evidence-discovery", "evidence-fm"):
            text = (SKILLS / name / "SKILL.md").read_text()
            with self.subTest(skill=name):
                for reference in ("business-analysis.md", "domain-language.md", "scenario-validation.md"):
                    self.assertIn(reference, text)
        composition = (SKILLS / "evidence-modeling/SKILL.md").read_text()
        for delegate in ("evidence-discovery", "evidence-fm"):
            self.assertIn(delegate, composition)
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        for judgment in ("单据推演", "参与者与角色扮演", "变化点"):
            self.assertIn(judgment, method)
        guide = (REPO / "docs/guides/index.md").read_text()
        self.assertIn("evidence-fm/references/business-analysis.md", guide)

    def test_method_covers_materials_lineage_walkthrough_and_boundaries(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        for phrase in (
            "现金权责／目标—实际约束及来源 → 识别合同上下文与双方 → 全部主履约清单",
            "请求—确认骨架 → 履约内凭证追溯",
            "不是逐项问卷", "业务专家或法务专家", "口头约定", "从一件真实业务",
            "新业务设计分开", "不是法律结论", "关键金额", "可读的业务视图",
            "当时已有的凭证", "不伪造已发生事件", "不要求展开所有供应商内部业务",
            "不直接决定部署方案",
        ):
            self.assertIn(phrase, method)
        interview = (SKILLS / "evidence-discovery/references/interview.md").read_text()
        for phrase in ("每轮一个业务焦点，可问多个独立问题", "材料已提供就直接读取", "正常和争议单据推演",
                       "领域上下文 → 当前对象", "任一写入失败就停止", "未执行保持未执行"):
            self.assertIn(phrase, interview)

    def test_manual_handoff_preserves_business_progress_and_controls(self):
        text = (SKILLS / "evidence-handoff/SKILL.md").read_text()
        for phrase in ("全部主履约", "关键数据追溯", "异常责任", "暂缓项", "真实保存与执行结果"):
            self.assertIn(phrase, text)

    def test_party_discovery_is_explicit_and_source_bound(self):
        method = (SKILLS / "evidence-fm/references/business-analysis.md").read_text()
        self.assertLess(method.index("## 6. 用单据推演"), method.index("## 7. 寻找参与者"))
        self.assertLess(method.index("## 7. 寻找参与者"), method.index("## 8. 从实际差异"))
        for phrase in ("从责任定位角色", "寻找实际主体", "核对跨上下文同一性",
                       "区分代表与责任主体", "形成有来源的对应关系", "同名不能证明同一",
                       "不等 API 设计再补", "不以合同或单据推演为前提",
                       "影响责任闭合时，整个已确认业务范围不能进入正式建模"):
            self.assertIn(phrase, method)
        self.assertIn("核对主体、角色、同一性及代表依据的对应关系", method)

    def test_behavior_evals_cover_mainline_and_negative_cases(self):
        document = json.loads((SKILLS / "evidence-discovery/evals/evals.json").read_text())
        cases = document["evals"]
        self.assertEqual(len(cases), len({case["id"] for case in cases}))
        indexed = {case["category"]: case for case in cases}
        for category in (
            "agreement-material-first", "evidence-based-fallback", "key-value-lineage",
            "document-walkthrough", "variation-and-support-boundary", "domain-without-contract",
            "party-cross-context-identity", "party-identity-unresolved", "party-representative-boundary",
        ):
            case = indexed[category]
            self.assertIn("evidence-fm", case["knowledgeSkills"])
            self.assertGreaterEqual(len(case["expectations"]), 3)
        instructions = (SKILLS / "evidence-discovery/evals/README.md").read_text()
        self.assertIn("没有实际执行就保持未执行", instructions)

    def test_no_retired_local_gap_only_flow_in_active_guidance(self):
        paths = [REPO / "AGENTS.md", REPO / "docs/evidence-modeling.md", SKILLS / "README.md"]
        for name in ("evidence-discovery", "evidence-modeling", "evidence-fm"):
            paths.extend((SKILLS / name).rglob("*.md"))
        retired = (
            "单据推演 → 变化点与边界", "单据推演、变化点与边界",
            "划分领域输入**：识别稳定参与主体",
            "问题优先顺序跟随当前责任链", "每轮访谈 → 保存原话与来源 → 当轮沉淀明确术语",
            "先解析定义拥有者，再指出模糊词", "再由当前判断的重要性决定下一问",
            "在本批次源模型生成或修订后，核对每项受影响规则的已有案例",
        )
        for path in paths:
            with self.subTest(path=str(path)):
                text = path.read_text()
                for phrase in retired:
                    self.assertNotIn(phrase, text)
        scenarios = (SKILLS / "evidence-fm/references/scenario-validation.md").read_text()
        self.assertIn("不需要 model.json、Python 或 validation 文件", scenarios)
        self.assertIn("用户另行授权模型编辑后", scenarios)


if __name__ == "__main__":
    unittest.main()
