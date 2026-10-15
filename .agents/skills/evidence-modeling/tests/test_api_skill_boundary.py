"""API extraction contracts; not proof of agent routing or business approval."""

import json
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
REPO = SKILLS.parents[1]


class APISkillBoundaryTests(unittest.TestCase):
    def test_api_has_its_own_runtime_and_fm_has_no_api_implementation(self):
        api = SKILLS / "evidence-api"
        fm = SKILLS / "evidence-fm"
        for resource in (
            "SKILL.md", "requirements.txt", "scripts/fm_api.py",
            "scripts/fm_api_core/fm_adapter.py", "schemas/api.schema.json",
            "schemas/api-projection.schema.json", "references/api-design.md",
            "references/api-method.md", "references/api-contracts.md",
            "references/api-format.md", "references/api-validation.md",
            "tests/test_cli.py",
        ):
            self.assertTrue((api / resource).is_file(), resource)
        for resource in (
            "scripts/fm_api.py", "scripts/fm_api_core", "tests/api",
            "schemas/api.schema.json", "schemas/api-projection.schema.json",
            "references/api-design.md",
        ):
            self.assertFalse((fm / resource).exists(), resource)

    def test_fm_only_delivers_fm_and_modeling_owns_api_handoff(self):
        fm = (SKILLS / "evidence-fm/SKILL.md").read_text()
        self.assertNotIn("自动接续整体 API", fm)
        self.assertNotIn("生成 OpenAPI", fm.split("---", 2)[1])
        workflow = (SKILLS / "evidence-modeling/references/workflow.md").read_text()
        self.assertIn("evidence-api", workflow)
        self.assertIn("不重复执行 FM 检查", workflow)

    def test_project_commands_use_the_independent_api_test_suite(self):
        scripts = json.loads((REPO / "package.json").read_text())["scripts"]
        self.assertIn("evidence-api/tests", scripts["skills:test:api"])
        self.assertNotIn("tests/api", scripts["skills:test:fm"])


if __name__ == "__main__":
    unittest.main()
