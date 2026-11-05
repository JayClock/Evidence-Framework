#!/usr/bin/env python3
"""Validate the interview trace record: schema, question identity, entity references."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def modeled_entities(fm_root: Path) -> dict[str, set[str]]:
    """Map every modeled Entity ID to its attribute names."""
    entities: dict[str, set[str]] = {}
    if not fm_root.is_dir():
        return entities
    for path in sorted(fm_root.glob("entities/*.json")):
        try:
            entity = load_json(path)
        except (OSError, ValueError):
            continue
        if not isinstance(entity, dict) or not isinstance(entity.get("id"), str):
            continue
        names = {
            attribute.get("name")
            for attribute in entity.get("attributes") or []
            if isinstance(attribute, dict) and isinstance(attribute.get("name"), str)
        }
        entities[entity["id"]] = names
    return entities


def schema_errors(document: Any, schema: Any) -> list[str]:
    try:
        import jsonschema
    except ImportError:
        raise SystemExit(
            "jsonschema is required for trace validation; install jsonschema>=4.22,<5"
        ) from None
    validator = jsonschema.Draft202012Validator(schema)
    errors = []
    for error in sorted(validator.iter_errors(document), key=lambda item: list(item.path)):
        location = "/".join(str(part) for part in error.absolute_path) or "<root>"
        errors.append(f"{location}: {error.message}")
    return errors


def reference_errors(traces: list[dict[str, Any]], entities: dict[str, set[str]]) -> list[str]:
    errors = []
    for index, trace in enumerate(traces):
        focus = trace.get("focus") or {}
        for field in ("contextRef", "fulfillmentRef", "evidenceRef", "roleRef"):
            reference = focus.get(field)
            if reference and reference not in entities:
                errors.append(f"traces[{index}].focus.{field}: unmodeled reference '{reference}'")
        for position, binding in enumerate(trace.get("targetBindings") or []):
            reference = binding.get("evidenceRef")
            attribute = binding.get("attributeName")
            if reference and reference not in entities:
                errors.append(
                    f"traces[{index}].targetBindings[{position}].evidenceRef: "
                    f"unmodeled reference '{reference}'"
                )
            elif reference and attribute and attribute not in entities[reference]:
                errors.append(
                    f"traces[{index}].targetBindings[{position}].attributeName: "
                    f"'{reference}' has no modeled attribute '{attribute}'"
                )
    return errors


def identity_errors(traces: list[dict[str, Any]]) -> list[str]:
    errors = []
    seen: set[str] = set()
    for index, trace in enumerate(traces):
        trace_id = trace.get("traceId")
        if trace_id in seen:
            errors.append(f"traces[{index}].traceId: duplicate '{trace_id}'")
        seen.add(trace_id)
        positions: dict[str, int] = {}
        for question_position, question in enumerate(trace.get("qa") or []):
            question_id = question.get("questionId")
            if question_id in positions:
                errors.append(
                    f"traces[{index}].qa[{question_position}].questionId: "
                    f"duplicate '{question_id}' also used at qa[{positions[question_id]}]"
                )
            positions[question_id] = question_position
    return errors


def check_trace(trace_path: Path, schema_path: Path, fm_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    limitations: list[str] = []
    if not trace_path.is_file():
        return {
            "valid": False,
            "traceCount": 0,
            "errors": [f"missing trace file: {trace_path}"],
            "limitations": limitations,
        }
    if not schema_path.is_file():
        return {
            "valid": False,
            "traceCount": 0,
            "errors": [f"missing trace schema: {schema_path}"],
            "limitations": limitations,
        }
    try:
        document = load_json(trace_path)
    except (OSError, ValueError) as error:
        return {
            "valid": False,
            "traceCount": 0,
            "errors": [f"unreadable trace file: {error}"],
            "limitations": limitations,
        }
    errors.extend(schema_errors(document, load_json(schema_path)))
    traces = document.get("traces") if isinstance(document, dict) else None
    traces = traces if isinstance(traces, list) else []
    errors.extend(identity_errors(traces))
    entities = modeled_entities(fm_root)
    if entities:
        errors.extend(reference_errors(traces, entities))
    else:
        limitations.append(f"no modeled Entities under {fm_root}; entity references were not checked")
    return {
        "valid": not errors,
        "traceCount": len(traces),
        "errors": errors,
        "limitations": limitations,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trace", type=Path, help="Path to .evidence/traces/interview-trace.json")
    parser.add_argument(
        "--schema",
        type=Path,
        required=True,
        help="Path to evidence-fm/schemas/interview-trace.schema.json",
    )
    parser.add_argument(
        "--fm-root",
        type=Path,
        default=Path(".evidence/fm"),
        help="Model root used to resolve Entity references",
    )
    args = parser.parse_args(argv)
    report = check_trace(args.trace, args.schema, args.fm_root)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
