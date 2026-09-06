#!/usr/bin/env python3
"""Build deterministic attribute-level traceability for an FM Schema v3 model."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from fm_model import load_model, validate_against_schema, validate_model
from fm_traceability import analyze_traceability


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build FM Schema v3 attribute lineage."
    )
    parser.add_argument(
        "model_dir", help="Directory containing model.yaml and FM shards"
    )
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument(
        "--compact", action="store_true", help="Write compact canonical JSON"
    )
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
    model = load_model(Path(args.model_dir))
    errors = validate_model(model)
    document, traceability_errors = analyze_traceability(model)
    errors = list(dict.fromkeys([*errors, *traceability_errors]))
    if not errors:
        validate_against_schema(
            document, "traceability.schema.json", "generated/traceability.json", errors
        )
    if errors:
        print("FM lineage build aborted because validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    if args.compact:
        content = (
            json.dumps(
                document, ensure_ascii=False, sort_keys=True, separators=(",", ":")
            )
            + "\n"
        )
    else:
        content = (
            json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
        )
    output = Path(args.output)
    write_atomic(output, content)
    print(
        f"Built FM attribute lineage: {output} "
        f"(nodes={len(document['nodes'])}, edges={len(document['edges'])})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
