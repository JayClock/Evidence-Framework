"""Documentation structure contracts, not proof of agent interview quality."""

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMES = (
    "evidence-discovery",
    "evidence-handoff",
    "evidence-fm",
    "evidence-api",
    "evidence-requirements",
    "evidence-modeling",
    "evidence-visualization",
)


class SkillDocumentationTests(unittest.TestCase):
    def test_course_analysis_does_not_add_color_schema_archetypes(self):
        retired = re.compile(r"粉色|黄色|绿色|蓝色", re.I)
        repo = ROOT.parents[1]
        guide = (repo / "docs/evidence-modeling.md").read_text()
        self.assertIn("四色建模与 8X Flow 为准", guide)
        method = (ROOT / "evidence-fm/references/business-analysis.md").read_text()
        self.assertIn("凭证必须围绕现金往来或 KPI", method)
        documents = [
            *ROOT.rglob("*.md"),
            *ROOT.rglob("*.json"),
            repo / "README.md",
            repo / "docs/evidence-modeling.md",
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
        for name in ("domain-language.md", "business-analysis.md", "provenance.md", "scenario-validation.md"):
            self.assertTrue((fm / name).is_file(), name)
        self.assertNotRegex(
            (fm / "input-review.md").read_text(),
            r"每轮只问|一次只问|问后等待|选择一个核心问题",
        )

    def test_direct_edit_authorization_is_separate_from_discussion_and_approval(self):
        fm_entry = (ROOT / "evidence-fm/SKILL.md").read_text()
        handoff_text = (ROOT / "evidence-handoff/SKILL.md").read_text()
        for phrase in ("disable-model-invocation: true", "目标与权限", "人类确认覆盖", "控制意图", "未保存或未执行"):
            self.assertIn(phrase, handoff_text)
        validation = (ROOT / "evidence-fm/references/validation.md").read_text()
        self.assertIn("直接编辑当前模型", fm_entry)
        self.assertIn("编辑授权不是业务批准", fm_entry)
        self.assertIn("当前问题", handoff_text)
        self.assertIn("区分已明确事实", handoff_text)
        self.assertIn("modelDigest", validation)
        self.assertIn("只校验请求不写任何项目文件", validation)
        self.assertIn("不自动回滚", fm_entry)
        for text in (fm_entry, handoff_text, validation):
            self.assertNotRegex(text, r"fm_model_(?:submit|ask)|\bRun\b|业务 revision")

    def test_interview_uses_model_language_and_separately_checks_edit_authority(self):
        for name in ("evidence-discovery", "evidence-fm"):
            with self.subTest(skill=name):
                entry = (ROOT / name / "SKILL.md").read_text()
                for requirement in ("domain-language.md", "Entity", "属性", "模型 JSON", "只聊不落盘"):
                    self.assertIn(requirement, entry)
        composition = (ROOT / "evidence-modeling/SKILL.md").read_text()
        for requirement in ("evidence-discovery", "evidence-fm", "Entity/属性定义", "不授权模型 JSON", "只聊不落盘"):
            self.assertIn(requirement, composition)
        language = (ROOT / "evidence-fm/references/domain-language.md").read_text()
        for requirement in (
            "Entity 及其属性即统一语言", "label", "notes", "meaning", "Entity ID",
            "属性名", "未澄清不任选其一覆盖", "已建模概念的更正属于 FM 修改",
            "仅有访谈授权时不写模型", "不为保存术语创建占位 Entity",
            "不宣称原子事务", "同一次有效范围完整性结果", "结构通过不证明定义正确",
        ):
            self.assertIn(requirement, language)
        interview = (ROOT / "evidence-discovery/references/interview.md").read_text()
        for requirement in (
            "每轮一个业务焦点，主动寻找并同轮提出全部可同时澄清的独立必要问题",
            "实际文件", "停止后仅吸收补充资料", "不把单独访谈授权当成编辑授权",
            "只聊不落盘或仅保存资料时以对话承接",
        ):
            self.assertIn(requirement, interview)

    def test_daily_language_uses_canonical_names_without_rewriting_evidence(self):
        method = (ROOT / "evidence-fm/references/domain-language.md").read_text()
        daily = method.split("## 日常表达\n", 1)[1].split("\n## ", 1)[0]
        for requirement in (
            "规范名称", "aliases", "理解输入", "不轮换同义词",
            "上下文", "故事", "任务标题", "测试名称", "交接",
            "原文引用", "既有代码标识", "不批量改名", "不为保存术语创建占位 Entity",
            "未保存", "不扩大写入权限", "只读",
        ):
            self.assertIn(requirement, daily)
        self.assertIn("已建模概念的更正属于 FM 修改", method)
        self.assertIn("不另设术语表、定义索引或英文词典", method)

    def test_daily_language_is_reachable_from_project_and_consumer_skills(self):
        repo = ROOT.parents[1]
        for relative in ("AGENTS.md", "docs/guides/index.md", "docs/engineering/conventions.md"):
            with self.subTest(document=relative):
                text = (repo / relative).read_text()
                self.assertIn("domain-language.md", text)
                self.assertIn("规范名称", text)
        for relative in ("evidence-fm/SKILL.md", "evidence-discovery/SKILL.md"):
            self.assertIn("domain-language.md", (ROOT / relative).read_text())
        for relative in (
            "evidence-requirements/SKILL.md", "evidence-handoff/SKILL.md",
            "evidence-task-planning/references/guides.md",
        ):
            with self.subTest(document=relative):
                text = (ROOT / relative).read_text()
                self.assertIn("领域语言方法", text)
                self.assertIn("规范名称", text)
        for name in ("evidence-task-planning", "evidence-delivery"):
            self.assertIn("references/guides.md", (ROOT / name / "SKILL.md").read_text())
        discovery = (ROOT / "evidence-discovery/SKILL.md").read_text()
        self.assertIn("故事、问题与交接使用同一中文（英文）规范名称", discovery)

    def test_daily_language_examples_cover_usage_and_permission_edges(self):
        fm = ROOT / "evidence-fm"
        method = (fm / "references/domain-language.md").read_text()
        self.assertIn("../examples/domain-language.md", method)
        index = (fm / "examples/README.md").read_text()
        self.assertIn("](domain-language.md)", index)
        example = (fm / "examples/domain-language.md").read_text()
        for scenario in ("别名输入", "同名异义", "只读", "缺词"):
            self.assertIn(scenario, example)

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
                        ("tests",),
                        (document, link),
                    )
                    if target.suffix == ".md":
                        pending.append(target)

    def test_modeling_and_api_default_outputs_share_evidence_root(self):
        expected_paths = {
            "evidence-modeling/SKILL.md": (".evidence/",),
            "evidence-modeling/references/workflow.md": (
                ".evidence/handoffs/",
                ".evidence/fm/",
                ".evidence/checks/fm/",
                ".evidence/checks/api/",
            ),
            "evidence-discovery/SKILL.md": (".evidence/fm/",),
            "evidence-handoff/SKILL.md": (".evidence/handoffs/",),
            "evidence-fm/SKILL.md": (".evidence/fm/", ".evidence/checks/fm/"),
            "evidence-fm/references/validation.md": (
                ".evidence/fm/",
                ".evidence/checks/fm/",
            ),
            "evidence-api/references/api-design.md": (
                ".evidence/fm/",
                ".evidence/api/api.json",
                ".evidence/api/generated/",
                ".evidence/checks/api/",
            ),
            "evidence-api/references/api-validation.md": (
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
        ):
            package = ROOT / name
            documents.extend(package.rglob("*.md"))
        for document in documents:
            with self.subTest(document=str(document)):
                self.assertNotRegex(document.read_text(), r"docs/(?:business|api)/")

    def test_default_layout_preserves_authorization_and_file_isolation(self):
        for name in (
            "evidence-modeling",
            "evidence-discovery",
            "evidence-fm",
        ):
            with self.subTest(skill=name):
                text = (ROOT / name / "SKILL.md").read_text()
                if name == "evidence-discovery":
                    self.assertIn("不为保存术语创建占位 Entity", text)
                    self.assertIn("更窄授权", text)
                else:
                    self.assertIn("只修改本次授权的文件", text)
                    self.assertIn("不自动迁移", text)
        validation = (ROOT / "evidence-fm/references/validation.md").read_text()
        self.assertIn("报告位于模型目录之外", validation)
        api = (ROOT / "evidence-api/references/api-validation.md").read_text()
        self.assertIn("投影输出固定更新", api)
        self.assertIn("切换失败时恢复", api)
        self.assertIn("FM 根目录之外", api)

    def test_visualization_is_bundled_and_other_skills_only_delegate(self):
        visual = ROOT / "evidence-visualization"
        for path in (
            "scripts/generate.py",
            "assets/workbench.html",
            "assets/workbench.js",
            "assets/business-graph.js",
            "assets/workbench.css",
            "tests/review-browser.mjs",
            "tests/business-graph.test.mjs",
            "requirements.txt",
        ):
            self.assertTrue((visual / path).is_file(), path)
        for removed in ("assets/page.html", "assets/review.js", "assets/style.css", "assets/vendor"):
            self.assertFalse((visual / removed).exists(), removed)
        for name in ("evidence-modeling", "evidence-fm"):
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
