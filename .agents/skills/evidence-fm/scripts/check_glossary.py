#!/usr/bin/env python3
"""Read-only validation of the domain glossary, independent of model.json."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from fm_model import load_single_json, validate_against_schema


def check_glossary(path: Path) -> dict:
    errors: list[str] = []
    document = None
    digest = None
    changed = False
    try:
        if path.is_symlink():
            raise ValueError("glossary must not be a symbolic link")
        before = path.read_bytes()
        digest = hashlib.sha256(before).hexdigest()
        document = load_single_json(path, errors)
        if document is not None:
            validate_against_schema(document, "glossary.schema.json", str(path), errors)
            if not errors:
                identities: set[str] = set()
                meanings: set[tuple[str, str]] = set()
                for term in document["terms"]:
                    identity = term["id"]
                    if identity in identities:
                        errors.append(f"duplicate term id: {identity}")
                    identities.add(identity)
                    meaning = (term.get("context", ""), term["name"])
                    if meaning in meanings:
                        errors.append(f"duplicate name in context: {meaning}")
                    meanings.add(meaning)
        changed = before != path.read_bytes()
        if changed:
            errors.append("glossary changed during validation")
    except (OSError, ValueError) as error:
        errors.append(str(error))
    terms = document.get("terms", []) if document else []
    return {
        "valid": not errors,
        "glossaryDigest": digest,
        "inputChanged": changed,
        "termCount": len(terms) if isinstance(terms, list) else 0,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glossary", type=Path)
    args = parser.parse_args()
    result = check_glossary(args.glossary)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
