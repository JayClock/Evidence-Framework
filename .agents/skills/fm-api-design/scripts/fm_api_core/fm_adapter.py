from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .diagnostics import Diagnostic, error


@dataclass
class FMIndex:
    compiled: dict[str, Any]
    check: dict[str, Any]
    entities: dict[str, dict[str, Any]]
    relationships: dict[str, dict[str, Any]]
    rules: dict[str, dict[str, Any]]
    scenarios: dict[str, dict[str, Any]]
    instances: dict[str, dict[str, Any]]
    members_by_context: dict[str, list[str]]
    fulfillment_parent: dict[str, str]
    files: dict[str, str]


def digest_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def snapshot_tree(root: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if (
            not path.is_file()
            or "generated" in path.parts
            or "__pycache__" in path.parts
            or path.name.startswith(".")
        ):
            continue
        result[path.relative_to(root).as_posix()] = digest_bytes(path.read_bytes())
    return result


def _run(command: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command, check=False, capture_output=True, text=True, timeout=timeout
    )


def _load_yaml_objects(root: Path, pattern: str) -> dict[str, dict[str, Any]]:
    objects: dict[str, dict[str, Any]] = {}
    for path in sorted(root.glob(pattern)):
        value = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            objects[value["id"]] = value
    return objects


def load_fm(fm_root: Path, fm_skill: Path) -> tuple[FMIndex | None, list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    fm_root = fm_root.resolve()
    fm_skill = fm_skill.resolve()
    check_script = fm_skill / "scripts" / "check_fm.py"
    compile_script = fm_skill / "scripts" / "compile_fm_model.py"
    if not fm_root.is_dir() or not (fm_root / "model.yaml").is_file():
        return None, [
            error("FM_INVALID", "FM 目录缺少 model.yaml", location=str(fm_root))
        ]
    if not check_script.is_file() or not compile_script.is_file():
        return None, [
            error(
                "FM_TOOL_MISSING",
                "FM Skill 缺少 check_fm.py 或 compile_fm_model.py",
                location=str(fm_skill),
            )
        ]
    try:
        before = snapshot_tree(fm_root)
        checked = _run([sys.executable, str(check_script), str(fm_root)])
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, [error("FM_TOOL_FAILURE", f"FM 检查器执行失败: {exc}")]
    try:
        check_report = json.loads(checked.stdout)
    except json.JSONDecodeError:
        return None, [
            error("FM_TOOL_FAILURE", f"FM 检查器未返回 JSON: {checked.stderr.strip()}")
        ]
    if checked.returncode != 0 or not check_report.get("valid"):
        messages = check_report.get("errors", ["FM 检查失败"])
        code = (
            "FM_TOOL_MISSING"
            if any("install requirements.txt" in message for message in messages)
            else "FM_INVALID"
        )
        return None, [error(code, message) for message in messages]
    with tempfile.TemporaryDirectory(prefix="fm-api-") as temporary:
        output = Path(temporary) / "model.json"
        try:
            compiled_run = _run(
                [
                    sys.executable,
                    str(compile_script),
                    str(fm_root),
                    "--output",
                    str(output),
                    "--compact",
                ]
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            return None, [error("FM_TOOL_FAILURE", f"FM 编译器执行失败: {exc}")]
        if compiled_run.returncode != 0 or not output.is_file():
            return None, [
                error("FM_TOOL_FAILURE", f"FM 编译失败: {compiled_run.stderr.strip()}")
            ]
        try:
            compiled = json.loads(output.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return None, [error("FM_TOOL_FAILURE", f"无法读取 FM 编译结果: {exc}")]
    after = snapshot_tree(fm_root)
    if before != after:
        return None, [error("SOURCE_CHANGED", "FM 输入在检查期间发生变化")]
    entities = {item["id"]: item for item in compiled.get("entities", [])}
    relationships = {item["id"]: item for item in compiled.get("relationships", [])}
    rules = {item["id"]: item for item in compiled.get("rules", [])}
    try:
        scenarios = _load_yaml_objects(fm_root, "validation/scenarios/*.yaml")
        instances = _load_yaml_objects(fm_root, "validation/instances/*.yaml")
    except (OSError, yaml.YAMLError) as exc:
        return None, [error("FM_INVALID", f"无法读取验证套件: {exc}")]
    members: dict[str, list[str]] = {}
    fulfillment_parent: dict[str, str] = {}
    for entity in entities.values():
        context_ref = entity.get("contextRef")
        if context_ref:
            members.setdefault(context_ref, []).append(entity["id"])
        if (
            entity.get("category") == "context"
            and entity.get("kind") == "fulfillment"
            and entity.get("parentContextRef")
        ):
            fulfillment_parent[entity["id"]] = entity["parentContextRef"]
    for values in members.values():
        values.sort()
    return FMIndex(
        compiled,
        check_report,
        entities,
        relationships,
        rules,
        scenarios,
        instances,
        members,
        fulfillment_parent,
        before,
    ), diagnostics


def inspect_summary(index: FMIndex) -> dict[str, Any]:
    entities = index.entities.values()
    return {
        "schemaVersion": index.compiled.get("schemaVersion"),
        "model": index.compiled.get("model", {}),
        "fmCheckSummary": index.check,
        "roles": sorted(
            (
                {
                    "id": value["id"],
                    "label": value.get("label"),
                    "kind": value.get("kind"),
                    "contextRef": value.get("contextRef"),
                }
                for value in entities
                if value.get("category") == "role"
            ),
            key=lambda item: item["id"],
        ),
        "resourceClues": sorted(
            (
                {
                    "id": value["id"],
                    "label": value.get("label"),
                    "category": value.get("category"),
                    "kind": value.get("kind"),
                    "contextRef": value.get("contextRef"),
                }
                for value in entities
                if value.get("category") in {"evidence", "participant"}
            ),
            key=lambda item: item["id"],
        ),
        "contexts": sorted(
            value["id"] for value in entities if value.get("category") == "context"
        ),
        "scenarios": sorted(
            {key: value.get("label") for key, value in index.scenarios.items()}.items()
        ),
        "inputFiles": index.files,
    }
