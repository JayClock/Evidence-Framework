#!/usr/bin/env python3
"""Prepare, apply, or recover a validated FM directory publication."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from fm_publication import (
    PublicationError,
    apply_candidate,
    prepare_candidate,
    recover_target,
)

EXIT_CODES = {
    "prepared": 0,
    "applied": 0,
    "noop": 0,
    "validation_failed": 2,
    "checker_unavailable": 3,
    "unsafe_path": 4,
    "missing_path": 4,
    "invalid_directory": 4,
    "conflict": 5,
    "recovery_required": 6,
    "unsupported_command": 64,
    "internal_error": 70,
}


def emit(payload: dict[str, Any]) -> int:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2))
    return EXIT_CODES.get(str(payload.get("status")), EXIT_CODES["internal_error"])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="freeze and validate a candidate")
    prepare.add_argument("--candidate", required=True, type=Path)
    prepare.add_argument("--target", required=True, type=Path)
    prepare.add_argument("--source", action="append", default=[], type=Path)
    prepare.add_argument("--work-dir", required=True, type=Path)
    apply = commands.add_parser("apply", help="validate and replace the prepared target")
    apply.add_argument("--receipt", required=True, type=Path)
    apply.add_argument("--report-dir", required=True, type=Path)
    recover = commands.add_parser("recover", help="recover an interrupted target replacement")
    recover.add_argument("--target", required=True, type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "prepare":
            receipt, receipt_path = prepare_candidate(
                skill_dir=Path(__file__).resolve().parents[1],
                candidate=args.candidate,
                target=args.target,
                sources=args.source,
                work_dir=args.work_dir,
            )
            return emit(
                {
                    "status": receipt["status"],
                    "preparationId": receipt["preparationId"],
                    "receiptPath": str(receipt_path),
                    "validation": receipt["validation"],
                    "difference": receipt["difference"],
                }
            )
        if args.command == "apply":
            return emit(
                apply_candidate(
                    skill_dir=Path(__file__).resolve().parents[1],
                    receipt_path=args.receipt,
                    report_dir=args.report_dir,
                )
            )
        if args.command == "recover":
            return emit(recover_target(args.target))
        return emit({"status": "unsupported_command", "message": args.command})
    except PublicationError as error:
        return emit({"status": error.code, "message": str(error)})
    except Exception as error:  # pragma: no cover - last-resort structured CLI boundary
        return emit({"status": "internal_error", "message": str(error)})


if __name__ == "__main__":
    raise SystemExit(main())
