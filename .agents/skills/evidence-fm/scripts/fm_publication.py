#!/usr/bin/env python3
"""Deterministic preparation primitives for publishing a complete FM directory."""

from __future__ import annotations

import difflib
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import uuid
from collections.abc import Iterable
from pathlib import Path
from typing import Any

RECEIPT_VERSION = 1
ABSENT_DIGEST = "absent"


class PublicationError(RuntimeError):
    """An expected publication failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _assert_plain_path(path: Path, *, allow_missing: bool) -> Path:
    absolute = path.expanduser().absolute()
    cursor = Path(absolute.anchor)
    for part in absolute.parts[1:]:
        cursor /= part
        if cursor.is_symlink():
            raise PublicationError(
                "unsafe_path", f"Symbolic links are not allowed: {cursor}"
            )
        if cursor.exists() and not (cursor.is_dir() or cursor.is_file()):
            raise PublicationError(
                "unsafe_path", f"Special files are not allowed: {cursor}"
            )
    if not allow_missing and not absolute.exists():
        raise PublicationError("missing_path", f"Path does not exist: {absolute}")
    return absolute


def assert_directory_tree(root: Path) -> Path:
    root = _assert_plain_path(root, allow_missing=False)
    if not root.is_dir():
        raise PublicationError("invalid_directory", f"Expected a directory: {root}")
    for current, directories, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in [*directories, *files]:
            child = current_path / name
            mode = child.lstat().st_mode
            if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                raise PublicationError("unsafe_path", f"Unsafe tree entry: {child}")
    return root


def is_within(parent: Path, child: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def assert_separate_paths(paths: Iterable[Path]) -> None:
    values = list(paths)
    for index, left in enumerate(values):
        for right in values[index + 1 :]:
            if left == right or is_within(left, right) or is_within(right, left):
                raise PublicationError(
                    "unsafe_path",
                    f"Publication paths must not contain each other: {left}, {right}",
                )


def list_files(root: Path) -> list[str]:
    if not root.exists():
        return []
    root = assert_directory_tree(root)
    return sorted(
        path.relative_to(root).as_posix() for path in root.rglob("*") if path.is_file()
    )


def digest_directory(root: Path) -> str:
    if not root.exists():
        return ABSENT_DIGEST
    digest = hashlib.sha256()
    for relative in list_files(root):
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update((root / relative).read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def digest_source(path: Path) -> dict[str, str]:
    absolute = _assert_plain_path(path, allow_missing=False)
    if absolute.is_dir():
        digest = digest_directory(absolute)
        kind = "directory"
    elif absolute.is_file():
        digest = sha256_bytes(absolute.read_bytes())
        kind = "file"
    else:
        raise PublicationError("unsafe_path", f"Unsupported source: {absolute}")
    return {"path": str(absolute), "kind": kind, "digest": digest}


def directory_diff(before: Path, after: Path) -> dict[str, Any]:
    before_files = set(list_files(before))
    after_files = set(list_files(after))
    added = sorted(after_files - before_files)
    deleted = sorted(before_files - after_files)
    modified: list[str] = []
    patches: list[str] = []
    for relative in sorted(before_files | after_files):
        old = (before / relative).read_bytes() if relative in before_files else b""
        new = (after / relative).read_bytes() if relative in after_files else b""
        if relative in before_files & after_files and old == new:
            continue
        if relative in before_files & after_files:
            modified.append(relative)
        try:
            old_lines = old.decode("utf-8").splitlines(keepends=True)
            new_lines = new.decode("utf-8").splitlines(keepends=True)
            patches.extend(
                difflib.unified_diff(
                    old_lines,
                    new_lines,
                    fromfile=f"target/{relative}",
                    tofile=f"candidate/{relative}",
                )
            )
        except UnicodeDecodeError:
            patches.append(f"Binary files differ: {relative}\n")
    return {
        "added": added,
        "modified": modified,
        "deleted": deleted,
        "patch": "".join(patches),
    }


def run_checker(skill_dir: Path, model_dir: Path) -> dict[str, Any]:
    script = skill_dir / "scripts/check_fm.py"
    try:
        result = subprocess.run(
            [sys.executable, "-B", str(script), str(model_dir)],
            cwd=str(skill_dir),
            text=True,
            capture_output=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise PublicationError(
            "checker_unavailable", f"FM checker could not run: {error}"
        ) from error
    if not result.stdout.strip():
        diagnostic = (result.stderr or "empty output").strip()
        raise PublicationError(
            "checker_unavailable", f"FM checker returned no usable JSON: {diagnostic}"
        )
    report = json.JSONDecoder().decode(result.stdout)
    if not isinstance(report, dict) or not isinstance(report.get("valid"), bool):
        raise PublicationError(
            "checker_unavailable", "FM checker returned an invalid contract"
        )
    report["exitCode"] = result.returncode
    if result.stderr.strip():
        report["stderr"] = result.stderr.strip()
    return report


def _receipt_digest(receipt: dict[str, Any]) -> str:
    unsigned = {key: value for key, value in receipt.items() if key != "receiptDigest"}
    return sha256_bytes(canonical_json(unsigned))


def prepare_candidate(
    *,
    skill_dir: Path,
    candidate: Path,
    target: Path,
    sources: list[Path],
    work_dir: Path,
) -> tuple[dict[str, Any], Path]:
    candidate = assert_directory_tree(candidate)
    target = _assert_plain_path(target, allow_missing=True)
    work_dir = _assert_plain_path(work_dir, allow_missing=True)
    source_paths = [_assert_plain_path(path, allow_missing=False) for path in sources]
    assert_separate_paths([candidate, target, work_dir])
    if is_within(skill_dir, work_dir) or is_within(work_dir, skill_dir):
        raise PublicationError(
            "unsafe_path", "The skill installation cannot be a work directory"
        )

    work_dir.mkdir(parents=True, exist_ok=True)
    prepared_dir = work_dir / f"prepared-{uuid.uuid4().hex}"
    frozen = prepared_dir / "candidate"
    prepared_dir.mkdir()
    shutil.copytree(candidate, frozen, copy_function=shutil.copy2)

    validation: dict[str, Any]
    status: str
    try:
        validation = run_checker(skill_dir, frozen)
        status = "prepared" if validation["valid"] else "validation_failed"
    except PublicationError as error:
        validation = {"valid": False, "errorCode": error.code, "errors": [str(error)]}
        status = error.code

    receipt: dict[str, Any] = {
        "receiptVersion": RECEIPT_VERSION,
        "preparationId": prepared_dir.name,
        "status": status,
        "candidate": {"path": str(frozen), "digest": digest_directory(frozen)},
        "target": {"path": str(target), "digest": digest_directory(target)},
        "sources": [digest_source(path) for path in source_paths],
        "validation": validation,
        "difference": directory_diff(target, frozen),
    }
    receipt["receiptDigest"] = _receipt_digest(receipt)
    receipt_path = prepared_dir / "receipt.json"
    receipt_path.write_text(
        json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return receipt, receipt_path
