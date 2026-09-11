#!/usr/bin/env python3
"""Deterministic preparation primitives for publishing a complete FM directory."""

from __future__ import annotations

import difflib
import fcntl
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import uuid
from collections.abc import Iterable
from contextlib import contextmanager
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


def verify_prepared_timeline(
    prepared_validation: dict[str, Any], current_validation: dict[str, Any]
) -> None:
    if current_validation.get("timelineSummary") != prepared_validation.get(
        "timelineSummary"
    ):
        raise PublicationError(
            "conflict", "Canonical Evidence timeline changed after preparation"
        )


def receipt_digest(receipt: dict[str, Any]) -> str:
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
    receipt["receiptDigest"] = receipt_digest(receipt)
    receipt_path = prepared_dir / "receipt.json"
    receipt_path.write_text(
        json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return receipt, receipt_path


def load_receipt(receipt_path: Path) -> dict[str, Any]:
    receipt_path = _assert_plain_path(receipt_path, allow_missing=False)
    if not receipt_path.is_file():
        raise PublicationError("missing_path", f"Receipt is not a file: {receipt_path}")
    receipt = json.JSONDecoder().decode(receipt_path.read_text(encoding="utf-8"))
    if not isinstance(receipt, dict) or receipt.get("receiptVersion") != RECEIPT_VERSION:
        raise PublicationError("conflict", "Unsupported or malformed preparation receipt")
    if receipt.get("receiptDigest") != receipt_digest(receipt):
        raise PublicationError("conflict", "Preparation receipt was modified")
    if receipt.get("status") != "prepared" or not receipt.get("validation", {}).get("valid"):
        raise PublicationError("validation_failed", "Preparation did not pass validation")
    return receipt


def _transaction_paths(target: Path, preparation_id: str) -> dict[str, Path]:
    stem = f".{target.name}.fm-{preparation_id}"
    return {
        "lock": target.parent / f".{target.name}.fm.lock",
        "journal": target.parent / f".{target.name}.fm-transaction.json",
        "backup": target.parent / f"{stem}.backup",
        "staging": target.parent / f"{stem}.staging",
    }


@contextmanager
def target_lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+", encoding="utf-8")
    try:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise PublicationError("conflict", f"Another publication holds the target lock: {path}") from error
        yield
    finally:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def _write_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _verify_sources(entries: list[dict[str, str]]) -> None:
    for expected in entries:
        current = digest_source(Path(expected["path"]))
        if current != expected:
            raise PublicationError("conflict", f"Declared source changed: {expected['path']}")


def _failpoint(name: str) -> None:
    if os.environ.get("FM_PUBLICATION_FAILPOINT") == name:
        os._exit(97)


def _cleanup_path(path: Path) -> None:
    try:
        if path.is_dir():
            shutil.rmtree(path)
        elif path.exists():
            path.unlink()
    except OSError as error:
        raise PublicationError("recovery_required", f"Could not clean transaction path {path}: {error}") from error


def _rename_for_transaction(source: Path, destination: Path) -> None:
    try:
        source.rename(destination)
    except OSError as error:
        raise PublicationError(
            "recovery_required", f"Could not rename {source} to {destination}: {error}"
        ) from error


def apply_candidate(
    *, skill_dir: Path, receipt_path: Path, report_dir: Path
) -> dict[str, Any]:
    receipt = load_receipt(receipt_path)
    candidate = assert_directory_tree(Path(receipt["candidate"]["path"]))
    target = _assert_plain_path(Path(receipt["target"]["path"]), allow_missing=True)
    report_dir = _assert_plain_path(report_dir, allow_missing=True)
    assert_separate_paths([candidate, target, report_dir])
    if digest_directory(candidate) != receipt["candidate"]["digest"]:
        raise PublicationError("conflict", "Frozen candidate changed after preparation")
    _verify_sources(receipt["sources"])

    paths = _transaction_paths(target, receipt["preparationId"])
    with target_lock(paths["lock"]):
        if paths["journal"].exists():
            raise PublicationError("recovery_required", f"Recover the pending transaction for {target}")
        current_digest = digest_directory(target)
        if current_digest == receipt["candidate"]["digest"]:
            validation = run_checker(skill_dir, candidate)
            if not validation["valid"]:
                raise PublicationError("validation_failed", "Current target matches an invalid candidate")
            verify_prepared_timeline(receipt["validation"], validation)
            return {
                "status": "noop",
                "target": str(target),
                "candidateDigest": receipt["candidate"]["digest"],
                "validation": validation,
            }
        if current_digest != receipt["target"]["digest"]:
            raise PublicationError("conflict", "Target changed after preparation")
        if digest_directory(candidate) != receipt["candidate"]["digest"]:
            raise PublicationError("conflict", "Frozen candidate changed while waiting for the lock")
        _verify_sources(receipt["sources"])

        _cleanup_path(paths["staging"])
        _cleanup_path(paths["backup"])
        shutil.copytree(candidate, paths["staging"], copy_function=shutil.copy2)
        validation = run_checker(skill_dir, paths["staging"])
        if not validation["valid"]:
            _cleanup_path(paths["staging"])
            raise PublicationError("validation_failed", "Candidate failed validation immediately before apply")
        verify_prepared_timeline(receipt["validation"], validation)

        journal: dict[str, Any] = {
            "transactionVersion": 1,
            "target": str(target),
            "candidate": str(candidate),
            "backup": str(paths["backup"]),
            "staging": str(paths["staging"]),
            "targetDigest": current_digest,
            "candidateDigest": receipt["candidate"]["digest"],
            "checkpoint": "staged",
        }
        _write_json(paths["journal"], journal)
        if target.exists():
            _rename_for_transaction(target, paths["backup"])
        journal["checkpoint"] = "target_backed_up"
        _write_json(paths["journal"], journal)
        _failpoint("after_target_backup")
        _rename_for_transaction(paths["staging"], target)
        journal["checkpoint"] = "target_replaced"
        _write_json(paths["journal"], journal)
        _failpoint("after_candidate_move")

        report = {
            "status": "applied",
            "preparationId": receipt["preparationId"],
            "target": str(target),
            "targetDigest": digest_directory(target),
            "previousTargetDigest": receipt["target"]["digest"],
            "candidateDigest": receipt["candidate"]["digest"],
            "sourceDigests": receipt["sources"],
            "difference": receipt["difference"],
            "validation": validation,
        }
        try:
            _failpoint("before_report")
            report_dir.mkdir(parents=True, exist_ok=True)
            report_path = report_dir / f"publication-{receipt['preparationId']}.json"
            _write_json(report_path, report)
        except OSError as error:
            return {
                "status": "recovery_required",
                "target": str(target),
                "targetChanged": True,
                "message": f"Target was replaced but the report could not be completed: {error}",
                "journalPath": str(paths["journal"]),
            }

        _cleanup_path(paths["backup"])
        paths["journal"].unlink(missing_ok=True)
        report["reportPath"] = str(report_path)
        return report


def recover_target(target: Path) -> dict[str, Any]:
    target = _assert_plain_path(target, allow_missing=True)
    probe = _transaction_paths(target, "unused")
    with target_lock(probe["lock"]):
        journal_path = probe["journal"]
        if not journal_path.exists():
            return {"status": "noop", "target": str(target), "message": "No pending transaction"}
        journal = json.JSONDecoder().decode(journal_path.read_text(encoding="utf-8"))
        if not isinstance(journal, dict) or journal.get("target") != str(target):
            raise PublicationError("recovery_required", "Transaction journal is malformed")
        backup = _assert_plain_path(Path(journal["backup"]), allow_missing=True)
        staging = _assert_plain_path(Path(journal["staging"]), allow_missing=True)
        candidate_digest = journal["candidateDigest"]
        previous_digest = journal["targetDigest"]

        current_digest = digest_directory(target)
        if current_digest == candidate_digest:
            _cleanup_path(backup)
            _cleanup_path(staging)
            journal_path.unlink()
            return {
                "status": "applied",
                "target": str(target),
                "recoveryAction": "completed_replacement",
            }
        if current_digest == ABSENT_DIGEST and digest_directory(backup) == previous_digest:
            backup.rename(target)
            _cleanup_path(staging)
            journal_path.unlink()
            return {
                "status": "applied",
                "target": str(target),
                "recoveryAction": "restored_previous_target",
            }
        if current_digest == ABSENT_DIGEST and previous_digest == ABSENT_DIGEST:
            _cleanup_path(staging)
            journal_path.unlink()
            return {
                "status": "applied",
                "target": str(target),
                "recoveryAction": "restored_absent_target",
            }
        raise PublicationError(
            "recovery_required", "Target or backup no longer matches the transaction journal"
        )
