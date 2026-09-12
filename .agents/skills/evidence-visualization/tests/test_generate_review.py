"""Focused contracts for the offline HTML generator (no model edits)."""

import base64
import hashlib
import importlib.util
import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "review_generator", ROOT / "scripts/generate.py"
)
assert SPEC and SPEC.loader
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)


class ReviewGeneratorTest(unittest.TestCase):
    def test_json_cannot_close_script_or_inject_html(self):
        payload = {"label": '</script><script>alert("x")</script>&\u2028'}
        encoded = review.embedded_json(payload)
        self.assertNotIn("<", encoded)
        self.assertEqual(payload, json.loads(encoded))

    def test_recursive_index_links_interfaces_and_rules_to_yaml(self):
        files = [
            {
                "path": ".evidence/api/api.yaml",
                "generated": False,
                "text": "id: api.test\ncapabilities:\n  - id: capability.read\n",
            },
            {
                "path": ".evidence/fm/rules/a.yaml",
                "generated": False,
                "text": "id: rule.amount\ntype: rule\n",
            },
        ]
        locations, objects, scenarios, instances = review.object_index(files)
        self.assertEqual(".evidence/api/api.yaml", locations["capability.read"])
        self.assertIn("rule.amount", objects)
        self.assertEqual([], scenarios)
        self.assertEqual([], instances)

    def test_collects_yaml_but_not_view_work_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in [
                "fm/model.yaml",
                "api/generated/v1/openapi.yaml",
                "views/.review/a.yaml",
                "checks/debug.yaml",
            ]:
                path = root / ".evidence" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("id: sample\n")
            files = review.yaml_files(root)
            self.assertEqual(2, len(files))
            self.assertTrue(files[0]["generated"])
            self.assertTrue(all(len(f["sha256"]) == 64 for f in files))

    def test_rejects_symlink_yaml(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".evidence").mkdir()
            (root / "private.txt").write_text("private")
            (root / ".evidence/leak.yaml").symlink_to(root / "private.txt")
            with self.assertRaises(ValueError):
                review.yaml_files(root)

    def test_only_overwrites_its_own_generated_page(self):
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory) / "index.html"
            page.write_text("user-owned page")
            with self.assertRaises(ValueError):
                review.publish(page, "replacement")
            self.assertEqual("user-owned page", page.read_text())
            page.write_text(review.MARKER + "old")
            review.publish(page, review.MARKER + "new")
            self.assertEqual(review.MARKER + "new", page.read_text())

    def test_tool_failure_is_not_a_success_snapshot(self):
        failed = subprocess.CompletedProcess(
            ["check"], 1, '{"valid":false}', "invalid model"
        )
        executions = []
        with (
            patch.object(review.subprocess, "run", return_value=failed),
            self.assertRaises(RuntimeError),
        ):
            review.run_json(["check"], executions)
        self.assertEqual(1, executions[0]["exitCode"])

    def test_changed_inputs_abort_before_rendering(self):
        check = {"valid": True, "inputChanged": False, "modelDigest": "same"}
        first = [{"path": ".evidence/fm/model.yaml", "sha256": "before"}]
        changed = [{"path": ".evidence/fm/model.yaml", "sha256": "after"}]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with (
                patch.object(review, "yaml_files", side_effect=[first, changed]),
                patch.object(review, "run_json", return_value=check),
                patch.object(review, "compile_json", return_value={}),
                self.assertRaisesRegex(ValueError, "输入在生成期间变化"),
            ):
                review.collect(root, root, root, root)
            self.assertFalse((root / ".evidence/views/index.html").exists())

    def test_template_is_offline_and_data_is_not_reinterpreted_as_template(self):
        html = review.render({"text": "@@APP@@</script>"})
        self.assertIn("connect-src 'none'", html)
        self.assertIn("@@APP@@\\u003c/script\\u003e", html)
        self.assertNotIn("<script src=", html)
        self.assertEqual(3, html.count("</script>"))
        self.assertTrue(html.startswith(review.MARKER))

    def test_csp_hashes_cover_the_rendered_scripts_including_template_whitespace(self):
        html = review.render({"text": "@@CSP@@</script>"})
        scripts = re.findall(r"<script>(.*?)</script>", html, re.DOTALL)
        self.assertEqual(2, len(scripts))
        policy = html.split('http-equiv="Content-Security-Policy"', 1)[1].split(">", 1)[
            0
        ]
        for script in scripts:
            digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
            self.assertIn(f"'sha256-{digest}'", policy)
        self.assertIn('"text":"@@CSP@@\\u003c/script\\u003e"', html)

    def test_csp_survives_different_template_indentation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "vendor").mkdir()
            (root / "vendor/cytoscape.min.js").write_text("const vendor = true;\n")
            (root / "review.js").write_text("const app = true;\n")
            (root / "style.css").write_text("body { color: black; }")
            for indent in ("", "  ", "\t"):
                with self.subTest(indent=indent):
                    (root / "page.html").write_text(
                        '<meta http-equiv="Content-Security-Policy" content="@@CSP@@">'
                        f"<script>\n{indent}@@VENDOR@@\n{indent}</script>"
                        f"<script>\n{indent}@@APP@@\n{indent}</script>"
                    )
                    with patch.object(review, "ASSETS", root):
                        html = review.render({})
                    for script in re.findall(
                        r"<script>(.*?)</script>", html, re.DOTALL
                    ):
                        digest = base64.b64encode(
                            hashlib.sha256(script.encode()).digest()
                        ).decode()
                        self.assertIn(f"'sha256-{digest}'", html)

    def test_inline_blocks_have_portable_formatter_protection(self):
        template = (ROOT / "assets/page.html").read_text()
        self.assertEqual(
            3, len(re.findall(r"<!-- prettier-ignore -->\s*<script", template))
        )
        self.assertIn("正在加载离线视图", template)

    def test_fulfillment_review_uses_fm_visual_language(self):
        template = (ROOT / "assets/page.html").read_text()
        app = (ROOT / "assets/review.js").read_text()
        style = (ROOT / "assets/style.css").read_text()
        for phrase in ["合同与履约", "简化业务图", "标准建模图", "上下文地图"]:
            self.assertIn(phrase, template)
        for token in ["renderObligations", "evidenceGraphLabel", "cardinalityLabel"]:
            self.assertIn(token, app)
        for token in ["--evidence", "--participant", "--role", "border: 2px dashed"]:
            self.assertIn(token, style)

    def test_visualization_prompt_is_explicit_read_only_and_offline(self):
        prompt = (ROOT / "references/visual-review.md").read_text()
        for phrase in [
            "Cytoscape",
            "SVG",
            "index.html",
            "只读",
            "离线",
            "原文",
            "不自动",
            "重新",
        ]:
            self.assertIn(phrase, prompt)
        entry = (ROOT / "SKILL.md").read_text()
        self.assertIn("references/visual-review.md", entry)


if __name__ == "__main__":
    unittest.main()
