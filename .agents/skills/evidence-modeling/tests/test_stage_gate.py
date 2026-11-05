"""Hand-off gate contracts: evidence must exist before a downstream stage opens."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
MODELING = SKILLS / "evidence-modeling"
SCRIPT = MODELING / "scripts/check_stage_gate.py"


def load_module():
    spec = importlib.util.spec_from_file_location("check_stage_gate", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def write_json(path: Path, document) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    return path


def fm_check(**overrides) -> dict:
    report = {
        "checkVersion": 5,
        "valid": True,
        "consistent": True,
        "complete": True,
        "scopeRefs": ["context.creation"],
        "contextRefs": ["context.creation"],
        "gaps": [],
        "errors": [],
        "inputChanged": False,
        "modelDigest": "sha256:0",
    }
    report.update(overrides)
    return report


def trace(*facts: str, trace_id: str = "trace-1") -> dict:
    return {
        "schemaVersion": "5.0",
        "modelId": "model.interview",
        "traces": [
            {
                "traceId": trace_id,
                "timestamp": "2026-01-01T00:00:00Z",
                "focus": {"contextRef": "context.creation", "evidenceRef": "evidence.contract"},
                "narrative": {"judgment": "判断", "story": "故事"},
                "qa": [{"questionId": "Q1", "question": "问题"}],
                "userInput": {"rawText": "回答", "confirmedFacts": list(facts)},
                "targetBindings": [],
            }
        ],
    }


class StageGateTests(unittest.TestCase):
    def setUp(self):
        self.module = load_module()
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.check_path = self.root / "fm-check.json"
        self.trace_path = self.root / "interview-trace.json"

    def tearDown(self):
        self.directory.cleanup()

    def gate(self, report=None, document=None, scopes=("context.creation",)) -> dict:
        write_json(self.check_path, report if report is not None else fm_check())
        write_json(self.trace_path, document if document is not None else
                   trace("范围结束确认：context.creation"))
        return self.module.check_gate(
            "api", self.check_path, self.trace_path, list(scopes)
        )

    def test_complete_scope_and_recorded_closure_open_the_gate(self):
        report = self.gate()
        self.assertTrue(report["passed"], report["errors"])
        self.assertEqual([], report["errors"])
        self.assertEqual(["trace-1"], report["evidence"]["trace"]["scopes"]["context.creation"])

    def test_consistency_without_scope_completeness_blocks_the_gate(self):
        report = self.gate(fm_check(complete=False, valid=False))
        self.assertFalse(report["passed"])
        self.assertTrue(any("complete: true" in error for error in report["errors"]),
                        report["errors"])

    def test_stale_check_report_blocks_the_gate(self):
        report = self.gate(fm_check(inputChanged=True, valid=False))
        self.assertFalse(report["passed"])
        self.assertTrue(any("stale" in error for error in report["errors"]),
                        report["errors"])

    def test_reported_gaps_or_errors_block_the_gate(self):
        report = self.gate(fm_check(gaps=["missing due date"], valid=False))
        self.assertFalse(report["passed"])
        self.assertTrue(any("gap(s)" in error for error in report["errors"]),
                        report["errors"])

    def test_requested_scope_must_appear_in_the_check_result(self):
        report = self.gate(scopes=("context.creation", "context.payment"))
        self.assertFalse(report["passed"])
        self.assertTrue(any("context.payment" in error for error in report["errors"]),
                        report["errors"])

    def test_missing_human_closure_blocks_the_gate(self):
        report = self.gate(document=trace("签约后十日付款"))
        self.assertFalse(report["passed"])
        self.assertTrue(any("no recorded human closure" in error
                            for error in report["errors"]), report["errors"])

    def test_closure_for_a_different_scope_does_not_open_the_gate(self):
        report = self.gate(document=trace("范围结束确认：context.payment"))
        self.assertFalse(report["passed"])
        self.assertTrue(any("no recorded human closure" in error
                            for error in report["errors"]), report["errors"])

    def test_global_closure_is_accepted_for_the_named_scope(self):
        report = self.gate(document=trace("全局追责结束确认：context.creation"))
        self.assertTrue(report["passed"], report["errors"])

    def test_gate_without_scope_is_refused(self):
        report = self.gate(scopes=())
        self.assertFalse(report["passed"])
        self.assertTrue(any("no scope supplied" in error for error in report["errors"]),
                        report["errors"])

    def test_unreadable_evidence_is_reported_without_a_traceback(self):
        self.trace_path.write_text("{", encoding="utf-8")
        write_json(self.check_path, fm_check())
        report = self.module.check_gate(
            "visualization", self.check_path, self.trace_path, ["context.creation"]
        )
        self.assertFalse(report["passed"])
        self.assertTrue(any("unreadable interview trace" in error
                            for error in report["errors"]), report["errors"])

    def test_cli_exit_code_matches_the_gate(self):
        passing = self.gate()
        self.assertTrue(passing["passed"])
        command = [
            sys.executable, "-B", str(SCRIPT),
            "--target", "api",
            "--fm-check", str(self.check_path),
            "--trace", str(self.trace_path),
            "--scope", "context.creation",
        ]
        passed = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(0, passed.returncode, passed.stderr + passed.stdout)
        write_json(self.trace_path, trace("签约后十日付款"))
        failed = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(1, failed.returncode, failed.stderr + failed.stdout)
        self.assertFalse(json.loads(failed.stdout)["passed"])


if __name__ == "__main__":
    unittest.main()
