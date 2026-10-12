"""Executable sample and flow contracts, not evidence of live interview quality."""

import hashlib
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
DISCOVERY = SKILLS / "evidence-discovery"
EXAMPLES = DISCOVERY / "examples"


class DiscoveryAnchorTests(unittest.TestCase):
    def test_entry_routes_examples_by_current_action(self):
        entry = (DISCOVERY / "SKILL.md").read_text()
        self.assertIn("examples/README.md", entry)
        index = (EXAMPLES / "README.md").read_text()
        for name in ("focused-turn.md", "navigation.md", "control-and-recovery.md"):
            self.assertIn(f"]({name})", index)
            self.assertTrue((EXAMPLES / name).is_file())
        self.assertIn("合成", index)
        self.assertIn("不替代", index)

    def test_flow_has_separate_failure_control_navigation_and_question_exits(self):
        text = (DISCOVERY / "references/interview.md").read_text()
        graph = re.search(r"```mermaid\n(.*?)```", text, re.S)
        self.assertIsNotNone(graph)
        assert graph is not None
        edges = set(re.findall(r"(?m)^\s*(\w+) -->\s*(?:\|[^|]+\|\s*)?(\w+)", graph[1]))
        self.assertTrue({
            ("input", "source"), ("source", "sourceSaved"),
            ("sourceSaved", "failed"), ("sourceSaved", "record"),
            ("record", "recordSaved"), ("recordSaved", "failed"),
            ("recordSaved", "language"), ("language", "languageSaved"),
            ("languageSaved", "failed"), ("languageSaved", "control"),
            ("control", "stop"), ("control", "navigation"),
            ("control", "focus"), ("navigation", "wait"),
            ("control", "selection"), ("selection", "wait"),
            ("selection", "selectSave"), ("selectSave", "selectSaved"),
            ("selectSaved", "failed"), ("selectSaved", "focus"),
            ("focus", "needed"), ("needed", "question"),
            ("needed", "handoff"), ("question", "wait"),
        }.issubset(edges), edges)
        self.assertFalse(any(start in {"failed", "stop", "handoff", "wait"} for start, _ in edges))

    def test_refund_snapshot_uses_existing_record_shape_and_resolves_references(self):
        record = json.loads((EXAMPLES / "refund-record.json").read_text())
        template = json.loads((DISCOVERY / "assets/discovery-template.json").read_text())
        self.assertEqual("2.0", record["schemaVersion"])
        self.assertTrue(set(record).issubset(template))
        self.assertTrue(set(record["handoff"]).issubset(template["handoff"]))
        self.assertTrue(set(record["business"]).issubset(template["business"]))
        responsibilities = record["business"]["responsibilities"]
        for item in responsibilities:
            self.assertTrue(set(item).issubset(template["business"]["responsibilities"][0]))
        sources = {item["sourceId"]: item for item in record["sources"]}
        self.assertEqual(len(record["sources"]), len(sources))
        objects = {
            item["id"]: item
            for name in ("agreements", "responsibilities", "evidenceTraces")
            for item in record["business"][name]
        }
        questions = {item["id"]: item for item in record["questions"]}
        handoff = record["handoff"]
        self.assertIn(handoff["focusRef"], objects)
        self.assertEqual("request", handoff["focusPoint"])
        self.assertTrue(set(handoff["viewRefs"]).issubset(objects))
        self.assertNotIn("currentQuestion", handoff)
        self.assertEqual("已停止", handoff["interactionState"])
        self.assertEqual({"Q-010"}, set(questions))
        self.assertEqual("已解决", questions["Q-010"]["status"])
        self.assertEqual("S-003", questions["Q-010"]["answer"])
        self.assertIn("全额退还", sources["S-003"]["quote"])
        for item in objects.values():
            self.assertTrue(set(item["sourceRefs"]).issubset(sources))
        responsibility = objects[handoff["focusRef"]]
        self.assertIn(responsibility["agreementRef"], objects)
        self.assertTrue(set(responsibility["traceRefs"]).issubset(objects))
        self.assertNotIn("responsibilityClosure", record["business"])
        self.assertTrue({"story", "progressState", "contextSnapshot"}.isdisjoint(handoff))

    def test_sample_glossary_really_passes_checker_without_fm_or_writes(self):
        paths = list(EXAMPLES.glob("*.json"))
        before = {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
        run = subprocess.run([
            sys.executable, "-B", str(SKILLS / "evidence-fm/scripts/check_glossary.py"),
            str(EXAMPLES / "glossary.json"),
        ], capture_output=True, text=True, timeout=30, check=False)
        self.assertEqual(0, run.returncode, run.stdout + run.stderr)
        result = json.loads(run.stdout)
        self.assertTrue(result["valid"])
        self.assertEqual(1, result["termCount"])
        record = json.loads((EXAMPLES / "refund-record.json").read_text())
        sources = {source["sourceId"] for source in record["sources"]}
        glossary = json.loads((EXAMPLES / "glossary.json").read_text())
        self.assertTrue(set(glossary["terms"][0]["sourceRefs"]).issubset(sources))
        self.assertEqual(before, {path: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths})

    def test_focused_example_has_one_business_question_and_no_mechanical_fields(self):
        text = (EXAMPLES / "focused-turn.md").read_text()
        displays = re.findall(r"```text\n(.*?)```", text, re.S)
        self.assertEqual(3, len(displays))
        self.assertEqual([1, 0, 1], [display.count("？") for display in displays])
        for display in displays:
            self.assertTrue(display.startswith("当前位置："))
            self.assertNotRegex(display, r"已明确：|正在澄清：|尚缺依据：|https?://")
        self.assertIn("退款申请〔履约请求〕", displays[0])
        self.assertIn("客户档案 → 身份判断", displays[2])


if __name__ == "__main__":
    unittest.main()
