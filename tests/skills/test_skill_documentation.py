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
    "fm-api-design",
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
                    r"fulfillment_request|fulfillment_confirmation|started_at|expired_at|signed_at|confirmed_at|created_at|derivedByRuleRef|valueType",
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
        for name in ("input-review.md", "scenario-validation.md", "validation.md"):
            self.assertTrue((references / name).is_file(), name)
        for name in ("discovery-workshop.md", "scenario-replay.md"):
            self.assertFalse((references / name).exists(), name)

    def test_direct_edit_authorization_is_separate_from_discussion_and_approval(self):
        fm_entry = (ROOT / "evidence-fm/SKILL.md").read_text()
        handoff = (ROOT / "evidence-discovery/assets/discovery-template.md").read_text()
        validation = (ROOT / "evidence-fm/references/validation.md").read_text()
        self.assertIn("直接编辑当前模型", fm_entry)
        self.assertIn("编辑授权不是业务批准", fm_entry)
        self.assertIn("当前实际问题", handoff)
        self.assertIn("普通回答与停止不是修改授权", handoff)
        self.assertIn("modelDigest", validation)
        self.assertIn("只校验请求不写任何项目文件", validation)
        self.assertIn("不自动回滚", fm_entry)
        for text in (fm_entry, handoff, validation):
            self.assertNotRegex(text, r"fm_model_(?:submit|ask)|\bRun\b|业务 revision")

    def test_direct_workflow_has_no_publication_runtime_or_compatibility_entry(self):
        for path in (
            ROOT / "evidence-fm/scripts/publish_fm.py",
            ROOT / "evidence-fm/scripts/fm_publication.py",
            ROOT / "evidence-fm/references/publication.md",
            ROOT / "evidence-fm/tests/test_publication.py",
            ROOT.parents[1] / ".pi/extensions/fm-modeling/review-ui.ts",
            ROOT.parents[1] / ".pi/extensions/fm-modeling/review-ui.spec.ts",
        ):
            self.assertFalse(path.exists(), path)
        retired = re.compile(
            r"publish_fm|fm_publication|fm_ui_review|receiptPath|"
            r"fm-candidates|fm-checks|\.fm-work|\.evidence/api/checks|"
            r"保存已展示候选|冻结候选|发布前核对"
        )
        for name in (
            "fm-modeling",
            "evidence-discovery",
            "evidence-fm",
            "fm-api-design",
        ):
            for path in (ROOT / name).rglob("*"):
                if path.suffix in {".py", ".md", ".json"}:
                    self.assertNotRegex(path.read_text(), retired, str(path))

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

    def test_modeling_and_api_default_outputs_share_evidence_root(self):
        expected_paths = {
            "fm-modeling/SKILL.md": (".evidence/",),
            "fm-modeling/references/workflow.md": (
                ".evidence/discovery.md",
                ".evidence/fm/",
                ".evidence/checks/fm/",
                ".evidence/checks/api/",
            ),
            "evidence-discovery/SKILL.md": (".evidence/discovery.md",),
            "evidence-discovery/assets/discovery-template.md": (
                ".evidence/discovery.md",
                ".evidence/questions.md",
            ),
            "evidence-fm/SKILL.md": (".evidence/fm/", ".evidence/checks/fm/"),
            "evidence-fm/references/validation.md": (
                ".evidence/fm/",
                ".evidence/checks/fm/",
            ),
            "fm-api-design/SKILL.md": (
                ".evidence/fm/",
                ".evidence/api/api.yaml",
                ".evidence/api/generated/",
                ".evidence/checks/api/",
            ),
            "fm-api-design/references/validation.md": (
                ".evidence/api/api.yaml",
                ".evidence/api/generated/",
            ),
        }
        for relative, paths in expected_paths.items():
            text = (ROOT / relative).read_text()
            for path in paths:
                with self.subTest(document=relative, path=path):
                    self.assertIn(path, text)

    def test_modeling_and_api_guidance_has_no_retired_output_defaults(self):
        documents = [ROOT / "README.md", ROOT.parents[1] / "docs/fm-modeling.md"]
        for name in (
            "fm-modeling",
            "evidence-discovery",
            "evidence-fm",
            "fm-api-design",
        ):
            package = ROOT / name
            documents.extend(package.rglob("*.md"))
            documents.extend((package / "evals").glob("*.json"))
        for document in documents:
            with self.subTest(document=str(document)):
                self.assertNotRegex(document.read_text(), r"docs/(?:business|api)/")

    def test_default_layout_preserves_workflow_state_and_file_isolation(self):
        for name in (
            "fm-modeling",
            "evidence-discovery",
            "evidence-fm",
            "fm-api-design",
        ):
            with self.subTest(skill=name):
                text = (ROOT / name / "SKILL.md").read_text()
                self.assertIn("state.json", text)
                self.assertIn("不自动迁移", text)
        validation = (ROOT / "evidence-fm/references/validation.md").read_text()
        self.assertIn("报告位于模型目录之外", validation)
        api = (ROOT / "fm-api-design/references/validation.md").read_text()
        self.assertIn("目标尚不存在", api)
        self.assertIn("FM 根目录之外", api)

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
