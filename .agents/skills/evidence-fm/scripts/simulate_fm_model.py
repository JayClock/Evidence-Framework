#!/usr/bin/env python3
"""Run deterministic document-instance scenarios against an FM Schema v3 model."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from fm_model import load_model, validate_model
from fm_simulation import load_validation_suite, simulate_validation_suite


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Simulate FM Schema v3 evidence scenarios."
    )
    parser.add_argument(
        "model_dir", help="Directory containing the model and validation suite"
    )
    parser.add_argument(
        "--scenario",
        action="append",
        default=[],
        help="Scenario id to run; repeat as needed. Omit to run all scenarios.",
    )
    parser.add_argument("--output", help="Optional deterministic JSON report path")
    parser.add_argument("--json", action="store_true", help="Print the JSON report")
    return parser.parse_args()


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as file:
            file.write(content)
        temporary_path.replace(path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def main() -> int:
    args = parse_args()
    model_root = Path(args.model_dir)
    model = load_model(model_root)
    errors = validate_model(model)
    suite = load_validation_suite(model_root)
    report, simulation_errors = simulate_validation_suite(model, suite, args.scenario)
    all_errors = list(dict.fromkeys([*errors, *simulation_errors]))
    report["machineValidated"] = not errors and report["machineValidated"]
    report["simulationPassed"] = not all_errors
    report["errors"] = all_errors

    content = json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if args.output:
        output = Path(args.output)
        write_atomic(output, content)
    if args.json:
        print(content, end="")
    elif all_errors:
        print("FM scenario simulation failed:", file=sys.stderr)
        for error in all_errors:
            print(f"- {error}", file=sys.stderr)
    else:
        destination = f"; report={args.output}" if args.output else ""
        print(
            f"FM scenario simulation passed "
            f"(scenarios={len(report['scenarioResults'])}){destination}."
        )
    return 0 if not all_errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
