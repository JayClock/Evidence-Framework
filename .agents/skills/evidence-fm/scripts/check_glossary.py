#!/usr/bin/env python3
"""Resolve domain language from standalone definitions or authoritative FM sources."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from fm_model import (
    NON_SOURCE_TREES,
    load_model,
    load_single_json,
    validate_against_schema,
)


def fm_signature(root: Path) -> str:
    """Bind resolution to current type-source paths and bytes, not generated files."""
    files = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if relative.parts[0] in NON_SOURCE_TREES or any(
            part.startswith(".") or part == "__pycache__" for part in relative.parts
        ):
            continue
        if path.is_symlink():
            raise ValueError(f"FM sources must not be symbolic links: {relative}")
        if path.is_file() and path.suffix in {".json", ".yaml", ".yml"}:
            files[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()


def resolve_target(term: dict, objects: dict, files: dict, root: Path) -> dict:
    target = term["target"]
    ref = target["objectRef"]
    owner = objects.get(ref)
    if owner is None:
        raise ValueError(f"{term['id']}: unresolved FM object {ref}")
    value = owner
    field = "description" if owner["type"] == "rule" else "notes"
    attribute = target.get("attribute")
    if attribute is not None:
        if owner["type"] != "entity":
            raise ValueError(f"{term['id']}: attribute target must belong to an entity")
        matches = [a for a in owner.get("attributes", []) if a.get("name") == attribute]
        if len(matches) != 1:
            raise ValueError(f"{term['id']}: unresolved or ambiguous attribute {ref}.{attribute}")
        value = matches[0]
        field = "meaning"
    definition = value.get(field)
    if not isinstance(definition, str) or not definition.strip():
        raise ValueError(f"{term['id']}: FM target lacks authoritative {field}: {ref}")
    context = owner.get("contextRef", owner["id"] if owner.get("category") == "context" else "")
    return {
        "id": term["id"],
        "kind": "model",
        "target": target,
        "name": value["label"],
        "definition": definition,
        "context": context,
        "sourceFile": files[ref].resolve().relative_to(root.resolve()).as_posix(),
        "definitionField": field,
        **({"aliases": term["aliases"]} if "aliases" in term else {}),
    }


def check_glossary(path: Path, fm_root: Path | None = None) -> dict:
    errors: list[str] = []
    document = None
    digest = None
    fm_digest = None
    changed = False
    reference_validated = None
    resolved: list[dict] = []
    try:
        if path.is_symlink():
            raise ValueError("glossary must not be a symbolic link")
        before = path.read_bytes()
        digest = hashlib.sha256(before).hexdigest()
        document = load_single_json(path, errors)
        if document is not None:
            validate_against_schema(document, "glossary.schema.json", str(path), errors)
        if document is not None and not errors:
            has_references = any(t["kind"] == "model" for t in document["terms"])
            if fm_root is None:
                candidate = path.parent / "fm"
                if candidate.exists() or has_references:
                    fm_root = candidate
            objects: dict = {}
            files: dict = {}
            if fm_root is not None:
                if path.resolve().is_relative_to(fm_root.resolve()):
                    raise ValueError("glossary must be outside the FM type root")
                if fm_root.is_symlink():
                    raise ValueError("FM root must not be a symbolic link")
                fm_digest = fm_signature(fm_root)
                model = load_model(fm_root)
                errors.extend(model.errors)
                objects = {**model.entities_by_id, **model.relationships_by_id, **model.rules_by_id}
                files = model.files_by_id
                reference_validated = not errors
            identities: set[str] = set()
            meanings: set[tuple[str, str]] = set()
            targets: set[tuple[str, str | None]] = set()
            if not errors:
                for term in document["terms"]:
                    identity = term["id"]
                    if identity in identities:
                        errors.append(f"duplicate term id: {identity}")
                    identities.add(identity)
                    if term["kind"] == "model":
                        target = term["target"]
                        key = (target["objectRef"], target.get("attribute"))
                        if key in targets:
                            errors.append(f"duplicate FM target: {key}")
                        targets.add(key)
                        try:
                            if fm_root is None:
                                raise ValueError(f"{identity}: FM root is required")
                            entry = resolve_target(term, objects, files, fm_root.resolve())
                        except ValueError as error:
                            errors.append(str(error))
                            continue
                    else:
                        entry = dict(term)
                        for obj in objects.values():
                            context = obj.get("contextRef", obj["id"] if obj.get("category") == "context" else "")
                            candidates = [obj, *obj.get("attributes", [])]
                            if ("context" not in term or term["context"] == context) and any(
                                value.get("label") == term["name"] for value in candidates
                            ):
                                errors.append(f"{identity}: standalone name already exists in FM: {obj['id']}")
                    meaning = (entry.get("context", ""), entry["name"])
                    if meaning in meanings:
                        errors.append(f"duplicate name in context: {meaning}")
                    meanings.add(meaning)
                    resolved.append(entry)
            if fm_root is not None:
                changed = fm_digest != fm_signature(fm_root)
                reference_validated = not errors and not changed
        changed = changed or before != path.read_bytes()
        if changed:
            errors.append("glossary or FM inputs changed during validation")
    except (OSError, ValueError) as error:
        errors.append(str(error))
        if fm_root is not None:
            reference_validated = False
    if errors and reference_validated is not None:
        reference_validated = False
    terms = document.get("terms", []) if document else []
    return {
        "valid": not errors,
        "glossaryDigest": digest,
        "fmSourceDigest": fm_digest,
        "inputChanged": changed,
        "referenceValidated": reference_validated,
        "termCount": len(terms) if isinstance(terms, list) else 0,
        "resolvedTerms": resolved if not errors else [],
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glossary", type=Path)
    parser.add_argument("--fm", type=Path, help="FM type root; defaults to a sibling fm directory")
    args = parser.parse_args()
    result = check_glossary(args.glossary, args.fm)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
