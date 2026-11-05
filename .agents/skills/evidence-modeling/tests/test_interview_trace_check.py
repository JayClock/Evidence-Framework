"""Feedback contracts for the interview trace validator, not live interview quality."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
DISCOVERY = SKILLS / "evidence-discovery"
SCHEMA = SKILLS / "evidence-fm/schemas/interview-trace.schema.json"
SCRIPT = DISCOVERY / "scripts/check_interview_trace.py"


def load_module():
    spec = importlib.util.spec_from_file_location("check_interview_trace", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_json(path: Path, document) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    return path


def entity(entity_id: str, *attributes: str) -> dict:
    return {
        "type": "entity",
        "id": entity_id,
        "category": "evidence",
        "kind": "request",
        "label": entity_id,
        "attributes": [
            {"name": name, "label": name, "valueType": "string", "meaning": name}
            for name in attributes
        ],
    }


def trace_record(trace_id: str = "trace-1", evidence_ref: str = "evidence.request.manuscript") -> dict:
    return {
        "traceId": trace_id,
        "timestamp": "2026-01-01T00:00:00Z",
        "focus": {"contextRef": "context.creation", "evidenceRef": evidence_ref},
        "narrative": {"judgment": "判断交稿是否按期", "story": "依据约定核对交稿结果"},
        "qa": [
            {
                "questionId": "Q1",
                "question": "交稿期限如何起算？",
                "targetAttribute": f"{evidence_ref}#due_at",
            }
        ],
        "userInput": {
            "rawText": "签约后十日",
            "confirmedFacts": ["范围结束确认：context.creation"],
        },
        "targetBindings": [
            {
                "evidenceRef": evidence_ref,
                "attributeName": "due_at",
                "sourceType": "interview_statement",
            }
        ],
    }


def trace_document(*records: dict) -> dict:
    return {"schemaVersion": "5.0", "modelId": "model.interview", "traces": list(records)}


class InterviewTraceCheckTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.fm_root = self.root / ".evidence/fm"
        write_json(self.fm_root / "entities/evidence-request--manuscript.json",
                   entity("evidence.request.manuscript", "due_at"))
        write_json(self.fm_root / "entities/context--creation.json", entity("context.creation"))

    def tearDown(self):
        self.directory.cleanup()

    def check(self, document) -> dict:
        path = write_json(self.root / "interview-trace.json", document)
        return self.module.check_trace(path, SCHEMA, self.fm_root)

    def test_complete_trace_passes_schema_identity_and_reference_checks(self):
        report = self.check(trace_document(trace_record()))
        self.assertTrue(report["valid"], report["errors"])
        self.assertEqual(1, report["traceCount"])
        self.assertEqual([], report["errors"])

    def test_unmodeled_evidence_reference_blocks_the_trace(self):
        report = self.check(trace_document(trace_record(evidence_ref="evidence.request.ghost")))
        self.assertFalse(report["valid"])
        self.assertTrue(any("unmodeled reference 'evidence.request.ghost'" in error
                            for error in report["errors"]), report["errors"])

    def test_unmodeled_attribute_on_a_modeled_entity_blocks_the_trace(self):
        record = trace_record()
        record["targetBindings"][0]["attributeName"] = "signed_at"
        report = self.check(trace_document(record))
        self.assertFalse(report["valid"])
        self.assertTrue(any("no modeled attribute 'signed_at'" in error
                            for error in report["errors"]), report["errors"])

    def test_schema_violation_reports_the_offending_location(self):
        record = trace_record()
        del record["userInput"]["rawText"]
        report = self.check(trace_document(record))
        self.assertFalse(report["valid"])
        self.assertTrue(any("userInput" in error and "rawText" in error
                            for error in report["errors"]), report["errors"])

    def test_repeated_question_identity_blocks_the_trace(self):
        record = trace_record()
        record["qa"].append(dict(record["qa"][0]))
        report = self.check(trace_document(record))
        self.assertFalse(report["valid"])
        self.assertTrue(any("duplicate 'Q1'" in error for error in report["errors"]),
                        report["errors"])

    def test_missing_model_root_is_a_reported_limitation_not_a_silent_pass(self):
        report = self.module.check_trace(
            write_json(self.root / "interview-trace.json", trace_document(trace_record())),
            SCHEMA,
            self.root / "absent",
        )
        self.assertTrue(report["valid"], report["errors"])
        self.assertTrue(any("entity references were not checked" in item
                            for item in report["limitations"]), report["limitations"])

    def test_missing_trace_file_is_reported_without_a_traceback(self):
        report = self.module.check_trace(self.root / "absent.json", SCHEMA, self.fm_root)
        self.assertFalse(report["valid"])
        self.assertIn("missing trace file", report["errors"][0])

    def test_cli_exit_code_matches_the_report(self):
        passing = write_json(self.root / "pass.json", trace_document(trace_record()))
        failing = write_json(self.root / "fail.json",
                             trace_document(trace_record(evidence_ref="evidence.request.ghost")))
        command = [sys.executable, "-B", str(SCRIPT)]
        passed = subprocess.run(
            [*command, str(passing), "--schema", str(SCHEMA), "--fm-root", str(self.fm_root)],
            capture_output=True, text=True,
        )
        self.assertEqual(0, passed.returncode, passed.stderr + passed.stdout)
        self.assertTrue(json.loads(passed.stdout)["valid"])
        failed = subprocess.run(
            [*command, str(failing), "--schema", str(SCHEMA), "--fm-root", str(self.fm_root)],
            capture_output=True, text=True,
        )
        self.assertEqual(1, failed.returncode, failed.stderr + failed.stdout)
        self.assertFalse(json.loads(failed.stdout)["valid"])


if __name__ == "__main__":
    unittest.main()
