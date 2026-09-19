"""Documentation structure contracts, not proof of agent interview quality."""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMES = (
    "evidence-discovery",
    "evidence-fm",
    "evidence-requirements",
    "evidence-modeling",
    "evidence-api-design",
    "evidence-visualization",
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
            repo / "README.md",
            repo / "docs/evidence-modeling.md",
            repo / ".pi/extensions/evidence-modeling/README.md",
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
            *(discovery / "assets").glob("*.json"),
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

    def test_direct_edit_authorization_is_separate_from_discussion_and_approval(self):
        fm_entry = (ROOT / "evidence-fm/SKILL.md").read_text()
        handoff = json.loads(
            (ROOT / "evidence-discovery/assets/discovery-template.json").read_text(
                encoding="utf-8"
            )
        )
        handoff_text = json.dumps(handoff, ensure_ascii=False)
        self.assertEqual("1.0", handoff["schemaVersion"])
        self.assertLessEqual(
            {
                "handoff",
                "businessSlice",
                "sources",
                "questions",
                "downstreamHandoff",
            },
            set(handoff),
        )
        question = handoff["questions"][0]
        self.assertEqual("Q-001", question["id"])
        for key in ("gapKey", "status", "answer", "resolvedBy"):
            self.assertIn(key, question)
        validation = (ROOT / "evidence-fm/references/validation.md").read_text()
        self.assertIn("直接编辑当前模型", fm_entry)
        self.assertIn("编辑授权不是业务批准", fm_entry)
        self.assertIn("当前实际问题", handoff_text)
        self.assertIn("普通回答与停止不是修改授权", handoff_text)
        self.assertIn("modelDigest", validation)
        self.assertIn("只校验请求不写任何项目文件", validation)
        self.assertIn("不自动回滚", fm_entry)
        for text in (fm_entry, handoff_text, validation):
            self.assertNotRegex(text, r"fm_model_(?:submit|ask)|\bRun\b|业务 revision")

    def test_direct_workflow_has_no_publication_runtime_or_compatibility_entry(self):
        for path in (
            ROOT / "evidence-fm/scripts/publish_fm.py",
            ROOT / "evidence-fm/scripts/fm_publication.py",
            ROOT / "evidence-fm/references/publication.md",
            ROOT / "evidence-fm/tests/test_publication.py",
            ROOT.parents[1] / ".pi/extensions/evidence-modeling/review-ui.ts",
            ROOT.parents[1] / ".pi/extensions/evidence-modeling/review-ui.spec.ts",
        ):
            self.assertFalse(path.exists(), path)
        retired = re.compile(
            r"publish_fm|fm_publication|fm_ui_review|receiptPath|"
            r"fm-candidates|fm-checks|\.fm-work|\.evidence/api/checks|"
            r"保存已展示候选|冻结候选|发布前核对"
        )
        for name in (
            "evidence-modeling",
            "evidence-discovery",
            "evidence-fm",
            "evidence-api-design",
        ):
            for path in (ROOT / name).rglob("*"):
                if (
                    path.suffix in {".py", ".md", ".json"}
                    and path != Path(__file__).resolve()
                ):
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
            "evidence-modeling/SKILL.md": (".evidence/",),
            "evidence-modeling/references/workflow.md": (
                ".evidence/discovery.json",
                ".evidence/fm/",
                ".evidence/checks/fm/",
                ".evidence/checks/api/",
            ),
            "evidence-discovery/SKILL.md": (".evidence/discovery.json",),
            "evidence-discovery/assets/discovery-template.json": (
                ".evidence/questions.json",
            ),
            "evidence-fm/SKILL.md": (".evidence/fm/", ".evidence/checks/fm/"),
            "evidence-fm/references/validation.md": (
                ".evidence/fm/",
                ".evidence/checks/fm/",
            ),
            "evidence-api-design/SKILL.md": (
                ".evidence/fm/",
                ".evidence/api/api.json",
                ".evidence/api/generated/",
                ".evidence/checks/api/",
            ),
            "evidence-api-design/references/validation.md": (
                ".evidence/api/api.json",
                ".evidence/api/generated/",
            ),
        }
        for relative, paths in expected_paths.items():
            text = (ROOT / relative).read_text()
            for path in paths:
                with self.subTest(document=relative, path=path):
                    self.assertIn(path, text)

    def test_modeling_and_api_guidance_has_no_retired_output_defaults(self):
        documents = [ROOT / "README.md", ROOT.parents[1] / "docs/evidence-modeling.md"]
        for name in (
            "evidence-modeling",
            "evidence-discovery",
            "evidence-fm",
            "evidence-api-design",
        ):
            package = ROOT / name
            documents.extend(package.rglob("*.md"))
            documents.extend((package / "evals").glob("*.json"))
        for document in documents:
            with self.subTest(document=str(document)):
                self.assertNotRegex(document.read_text(), r"docs/(?:business|api)/")

    def test_default_layout_preserves_authorization_and_file_isolation(self):
        for name in (
            "evidence-modeling",
            "evidence-discovery",
            "evidence-fm",
            "evidence-api-design",
        ):
            with self.subTest(skill=name):
                text = (ROOT / name / "SKILL.md").read_text()
                self.assertIn("只修改本次授权的文件", text)
                self.assertIn("不自动迁移", text)
        validation = (ROOT / "evidence-fm/references/validation.md").read_text()
        self.assertIn("报告位于模型目录之外", validation)
        api = (ROOT / "evidence-api-design/references/validation.md").read_text()
        self.assertIn("投影输出固定更新", api)
        self.assertIn("切换失败时恢复", api)
        self.assertIn("FM 根目录之外", api)

    def test_visualization_is_bundled_and_other_skills_only_delegate(self):
        visual = ROOT / "evidence-visualization"
        for path in (
            "scripts/generate.py",
            "assets/page.html",
            "assets/review.js",
            "assets/style.css",
            "assets/vendor/cytoscape.min.js",
            "tests/review-browser.mjs",
            "requirements.txt",
        ):
            self.assertTrue((visual / path).is_file(), path)
        for name in ("evidence-modeling", "evidence-api-design"):
            entry = (ROOT / name / "SKILL.md").read_text()
            self.assertIn("evidence-visualization", entry)
        self.assertFalse(
            (ROOT / "evidence-modeling/references/visual-review.md").exists()
        )
        self.assertFalse((ROOT.parents[1] / "tools/evidence_review").exists())
        for document in visual.rglob("*.md"):
            self.assertNotIn("tools/evidence_review", document.read_text())

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
