#!/usr/bin/env python3
"""Gate downstream hand-off on FM scope evidence and recorded human closure."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

CLOSURE_PREFIXES = ("范围结束确认：", "全局追责结束确认：")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def fm_check_errors(report: Any, scopes: list[str]) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    evidence: dict[str, Any] = {}
    if not isinstance(report, dict):
        return ["FM check report is not a JSON object"], evidence
    for field in ("checkVersion", "consistent", "complete", "valid", "inputChanged", "errors"):
        evidence[field] = report.get(field)
    if report.get("checkVersion") != 5:
        errors.append(f"FM check contract is not version 5: {report.get('checkVersion')!r}")
    if report.get("consistent") is not True:
        errors.append("FM check did not report consistent: true")
    if report.get("complete") is not True:
        errors.append("FM check did not report complete: true for the requested scope")
    if report.get("valid") is not True:
        errors.append("FM check did not report valid: true")
    if report.get("inputChanged") is not False:
        errors.append("FM inputs changed after the check; the evidence is stale")
    if report.get("errors"):
        errors.append(f"FM check reported {len(report['errors'])} error(s)")
    if report.get("gaps"):
        errors.append(f"FM check reported {len(report['gaps'])} gap(s)")
    covered = set(report.get("scopeRefs") or [])
    evidence["scopeRefs"] = sorted(covered)
    for scope in scopes:
        if scope not in covered:
            errors.append(f"FM check does not cover scope '{scope}'")
    return errors, evidence


def closure_entry(scope: str) -> set[str]:
    return {f"{prefix}{scope}" for prefix in CLOSURE_PREFIXES}


def closure_errors(trace: Any, scopes: list[str]) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    evidence: dict[str, Any] = {"scopes": {}}
    if not isinstance(trace, dict):
        return ["Interview trace is not a JSON object"], evidence
    records = trace.get("traces")
    records = records if isinstance(records, list) else []
    evidence["traceCount"] = len(records)
    recorded: dict[str, list[str]] = {scope: [] for scope in scopes}
    for record in records:
        if not isinstance(record, dict):
            continue
        facts = (record.get("userInput") or {}).get("confirmedFacts") or []
        for scope in scopes:
            for fact in facts:
                if isinstance(fact, str) and fact.strip() in closure_entry(scope):
                    recorded[scope].append(record.get("traceId") or "<unknown>")
    for scope in scopes:
        evidence["scopes"][scope] = sorted(set(recorded[scope]))
        if not recorded[scope]:
            errors.append(
                f"no recorded human closure for scope '{scope}'; "
                f"expected a confirmed fact '{CLOSURE_PREFIXES[0]}{scope}'"
            )
    return errors, evidence


def check_gate(
    target: str, fm_check_path: Path, trace_path: Path, scopes: list[str]
) -> dict[str, Any]:
    errors: list[str] = []
    limitations: list[str] = []
    evidence: dict[str, Any] = {"fmCheck": {}, "trace": {}}
    if not scopes:
        errors.append("no scope supplied; downstream never consumes an unbounded model")
    if not fm_check_path.is_file():
        errors.append(f"missing FM check report: {fm_check_path}")
    else:
        try:
            found, evidence["fmCheck"] = fm_check_errors(load_json(fm_check_path), scopes)
            errors.extend(found)
        except (OSError, ValueError) as error:
            errors.append(f"unreadable FM check report: {error}")
    if not trace_path.is_file():
        errors.append(f"missing interview trace: {trace_path}")
    else:
        try:
            found, evidence["trace"] = closure_errors(load_json(trace_path), scopes)
            errors.extend(found)
        except (OSError, ValueError) as error:
            errors.append(f"unreadable interview trace: {error}")
    limitations.append(
        "downstream authorization and business approval remain human statements; "
        "this gate only proves scope completeness and recorded closure"
    )
    return {
        "passed": not errors,
        "target": target,
        "scopeRefs": list(scopes),
        "evidence": evidence,
        "errors": list(dict.fromkeys(errors)),
        "limitations": limitations,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True, choices=("api", "visualization"))
    parser.add_argument("--fm-check", type=Path, required=True, help="Saved check_fm.py JSON report")
    parser.add_argument(
        "--trace",
        type=Path,
        default=Path(".evidence/traces/interview-trace.json"),
        help="Interview trace holding the recorded human closure",
    )
    parser.add_argument(
        "--scope",
        action="append",
        dest="scopes",
        default=None,
        help="Delivered Context ID; repeat for a contract group",
    )
    args = parser.parse_args(argv)
    report = check_gate(args.target, args.fm_check, args.trace, args.scopes or [])
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
