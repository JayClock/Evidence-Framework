#!/usr/bin/env python3
"""Compile FM Schema v3 YAML shards into deterministic JSON."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

from fm_model import compiled_document, load_model, validate_model


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compile a validated FM Schema v3 model."
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
    if errors:
        print("FM compilation aborted because validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    document = compiled_document(model)
    if args.compact:
        content = (
            json.dumps(
                document,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
        )
    else:
        content = (
            json.dumps(
                document,
                ensure_ascii=False,
                sort_keys=True,
                indent=2,
            )
            + "\n"
        )
    output = Path(args.output)
    write_atomic(output, content)
    print(
        f"Compiled FM Schema v3 JSON: {output} ({len(content.encode('utf-8'))} bytes)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
