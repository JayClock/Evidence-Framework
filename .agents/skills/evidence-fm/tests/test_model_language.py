"""Entity-owned language and read-only consumption; not live-agent quality evidence."""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

import check_fm  # noqa: E402
from fm_model import load_model  # noqa: E402


class ModelLanguageTests(unittest.TestCase):
    def test_model_types_are_the_only_definition_schemas(self):
        self.assertEqual(
            {
                "model.schema.json", "entity.schema.json", "relationship.schema.json",
                "rule.schema.json",
                "evidence-instance.schema.json", "scenario.schema.json",
                "compiled-model.schema.json", "traceability.schema.json",
                "simulation-report.schema.json", "timeline.schema.json",
            },
            {path.name for path in (SKILL / "schemas").glob("*.schema.json")},
        )
        self.assertEqual(
            {"check_fm.py"},
            {path.name for path in (SKILL / "scripts").glob("check_*.py")},
        )

    def test_language_is_owned_by_entities_and_attributes_without_interview_writes(self):
        method = (SKILL / "references/domain-language.md").read_text()
        for phrase in (
            "Entity 及其属性即统一语言", "label", "notes", "meaning",
            "仅有访谈授权时不写模型", "不为保存术语创建占位 Entity",
            "Entity ID", "属性名", "aliases",
        ):
            self.assertIn(phrase, method)

    def test_current_source_names_and_meanings_are_consumed_without_sidecar_or_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "fm"
            shutil.copytree(SKILL / "examples/domain", root)
            source = next(
                path for path in root.rglob("*.json")
                if json.loads(path.read_text()).get("attributes")
            )
            document = json.loads(source.read_text())
            identity = document["id"]
            attribute_name = document["attributes"][0]["name"]
            for label, meaning in (
                ("客户档案（Customer Profile）", "当前合成输入中的客户资料对象。"),
                ("客户资料档案（Customer Record）", "更正后的合成输入定义。"),
            ):
                document.update(label=label, notes=meaning, aliases=["客户资料"])
                document["attributes"][0].update(
                    label="档案标识（Profile ID）", meaning="在当前领域内识别档案。",
                )
                source.write_text(json.dumps(document, ensure_ascii=False))
                before = {path: path.read_bytes() for path in root.rglob("*") if path.is_file()}
                with self.subTest(label=label):
                    model = load_model(root)
                    self.assertEqual([], model.errors)
                    owner = model.entities_by_id[identity]
                    self.assertEqual((label, meaning), (owner["label"], owner["notes"]))
                    field = next(item for item in owner["attributes"] if item["name"] == attribute_name)
                    self.assertEqual("档案标识（Profile ID）", field["label"])
                    self.assertEqual("在当前领域内识别档案。", field["meaning"])
                    result = check_fm.check_model(root)
                    self.assertTrue(result["valid"], result)
                    self.assertIsNone(result["simulationPassed"])
                    self.assertFalse(result["inputChanged"])
                    self.assertEqual(before, {path: path.read_bytes() for path in root.rglob("*") if path.is_file()})
                self.assertEqual(["fm"], [path.name for path in Path(directory).iterdir()])


if __name__ == "__main__":
    unittest.main()
