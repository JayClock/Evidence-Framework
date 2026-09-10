"""Documentation structure contracts, not proof of agent interview quality."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / ".agents/skills"
NAMES = (
    "evidence-discovery",
    "evidence-fm",
    "evidence-requirements",
    "fm-modeling",
)


class SkillDocumentationTests(unittest.TestCase):
    def test_active_guidance_uses_provenance_without_color_archetypes(self):
        retired = re.compile(
            r"四色|彩色建模|(?:four|4)[ -]colou?rs?|粉色|黄色|绿色|蓝色", re.I
        )
        repo = ROOT.parents[1]
        documents = [
            *ROOT.rglob("*.md"),
            *ROOT.rglob("*.json"),
            *(repo / "tests/skills/pi-discovery").glob("*.md"),
            *(repo / "tests/skills/pi-discovery").glob("*.json"),
            repo / "README.md",
            repo / "docs/evidence.md",
            repo / ".pi/extensions/evidence/README.md",
            repo / ".pi/extensions/evidence/templates/evidence-fulfillment-model.md",
            repo / ".pi/extensions/evidence/modeling/discovery/schema.ts",
            repo / ".pi/extensions/evidence/adapters/pi/tools/discovery.ts",
        ]
        for document in documents:
            with self.subTest(document=str(document)):
                self.assertIsNone(retired.search(document.read_text()))

    def test_discovery_owns_interview_and_fm_owns_modeling_knowledge(self):
        discovery = ROOT / "evidence-discovery"
        self.assertEqual(
            {"interview.md"},
            {path.name for path in (discovery / "references").glob("*.md")},
        )
        runtime_docs = [
            discovery / "SKILL.md",
            *(discovery / "references").glob("*.md"),
            *(discovery / "assets").glob("*.md"),
        ]
        for path in runtime_docs:
            self.assertIsNone(
                re.search(
                    r"fulfillment_request|fulfillment_confirmation|start_at|expired_at|signed_at|confirmed_at|created_at|derivedByRuleRef|valueType",
                    path.read_text(),
                ),
                str(path),
            )
        fm = ROOT / "evidence-fm/references"
        for name in ("business-analysis.md", "provenance.md", "scenario-validation.md"):
            self.assertTrue((fm / name).is_file(), name)
        self.assertNotRegex(
            (fm / "input-review.md").read_text(),
            r"每轮只问|一次只问|问后等待|选择一个核心问题",
        )

    def test_fm_exposes_model_review_branches_not_a_second_discovery_workshop(self):
        references = ROOT / "evidence-fm/references"
        for name in ("input-review.md", "scenario-validation.md", "publication.md"):
            self.assertTrue((references / name).is_file(), name)
        for name in ("discovery-workshop.md", "scenario-replay.md"):
            self.assertFalse((references / name).exists(), name)

    def test_discovery_handoff_and_fm_publication_keep_authorization_separate(self):
        fm_entry = (ROOT / "evidence-fm/SKILL.md").read_text()
        handoff = (
            ROOT / "evidence-discovery/assets/discovery-template.md"
        ).read_text()
        publication = (ROOT / "evidence-fm/references/publication.md").read_text()
        self.assertIn("形成候选", fm_entry)
        self.assertIn("明确授权保存该已展示候选", fm_entry)
        self.assertIn("当前实际问题", handoff)
        self.assertIn("普通回答与停止不是授权", handoff)
        self.assertIn("publish_fm.py", publication)
        for text in (fm_entry, handoff, publication):
            self.assertNotRegex(text, r"fm_model_(?:submit|ask)|\bRun\b|业务 revision")

    def test_business_document_links_do_not_pull_in_maintenance_material(self):
        for name in NAMES:
            package = (ROOT / name).resolve()
            pending = [package / "SKILL.md"]
            visited = set()
            while pending:
                document = pending.pop()
                if document in visited:
                    continue
                visited.add(document)
                for link in re.findall(r"\]\(([^\s)]+)\)", document.read_text()):
                    if link.startswith(("https://", "http://", "#")):
                        continue
                    target = (document.parent / link.split("#", 1)[0]).resolve()
                    self.assertTrue(target.is_relative_to(package), (document, link))
                    self.assertTrue(target.exists(), (document, link))
                    self.assertNotIn(
                        target.relative_to(package).parts[0],
                        ("tests", "evals"),
                        (document, link),
                    )
                    if target.suffix == ".md":
                        pending.append(target)

    def test_discovery_and_fm_do_not_copy_methods_or_long_paragraphs(self):
        def passages(skill: str) -> set[str]:
            result = set()
            for document in (ROOT / skill / "references").glob("*.md"):
                text = document.read_text()
                for passage in [text, *text.split("\n\n")]:
                    normalized = re.sub(r"\s+", "", passage)
                    if len(normalized) >= 100:
                        result.add(normalized)
            return result

        self.assertEqual(
            set(), passages("evidence-discovery") & passages("evidence-fm")
        )


if __name__ == "__main__":
    unittest.main()
