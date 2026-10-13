"""Instruction-shape contracts, not measured agent behavior or business approval."""

import re
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
NAMES = (
    "evidence-discovery",
    "evidence-fm",
    "evidence-api",
    "evidence-modeling",
    "evidence-handoff",
    "evidence-visualization",
)


def section(text: str, heading: str) -> str:
    return text.split(f"## {heading}\n", 1)[1].split("\n## ", 1)[0]


class SkillWritingTests(unittest.TestCase):
    def test_each_entry_has_ordered_actions_with_local_completion_criteria(self):
        for name in NAMES:
            with self.subTest(skill=name):
                text = (SKILLS / name / "SKILL.md").read_text()
                self.assertEqual(
                    ["Guides", "Action", "Sensors", "Steer"],
                    re.findall(r"^## (.+)$", text, re.M),
                )
                action = section(text, "Action")
                steps = re.findall(
                    r"(?ms)^([1-9])\. \*\*(.+?)(?=^[1-9]\. \*\*|\Z)",
                    action,
                )
                self.assertEqual(["1", "2", "3"], [number for number, _ in steps])
                for number, body in steps:
                    self.assertIn("完成时", body, (name, number))

    def test_entry_descriptions_and_runtime_guidance_have_no_attribution_metadata(self):
        for name in NAMES:
            documents = [SKILLS / name / "SKILL.md"]
            documents.extend((SKILLS / name / "references").glob("*.md"))
            for document in documents:
                with self.subTest(document=str(document)):
                    self.assertNotRegex(
                        document.read_text(),
                        r"https?://|(?m:^author:|^date:|^updated:)|"
                        r"(?m:^#{1,6} (?:写法来源|借鉴出处|致谢)(?:\s|$))",
                    )

    def test_language_updates_have_completion_criteria_before_continuation(self):
        text = (SKILLS / "evidence-fm/references/domain-language.md").read_text()
        cycle = section(text, "每轮访谈")
        steps = re.findall(r"(?m)^[1-5]\. .+$", cycle)
        self.assertEqual(5, len(steps))
        for step in steps:
            self.assertIn("完成时", step)
        self.assertLess(cycle.index("核对含义由谁维护"), cycle.index("当轮维护词汇入口"))
        self.assertLess(cycle.index("当轮维护词汇入口"), cycle.index("再继续访谈"))

    def test_visual_verification_is_grouped_and_keeps_actual_evidence_limits(self):
        text = (SKILLS / "evidence-visualization/references/operations.md").read_text()
        self.assertIn("## 验证覆盖", text)
        for risk in ("对象与归属", "详情与引用", "图形与交互", "安全与发布", "证据限制"):
            self.assertIn(risk, text)
        self.assertIn("review-browser.mjs", text)
        self.assertIn("不写回 FM/API", text)
        self.assertIn("系统临时目录", text)


if __name__ == "__main__":
    unittest.main()
