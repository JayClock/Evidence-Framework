from __future__ import annotations

import hashlib
import importlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

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
        relative = path.relative_to(root)
        if (
            not path.is_file()
            or relative.parts[0] == "generated"
            or "__pycache__" in relative.parts
        ):
            continue
        result[path.relative_to(root).as_posix()] = digest_bytes(path.read_bytes())
    return result


class FMSuiteReadError(Exception):
    """Validation suite could not be read as strict JSON."""


def _load_json_objects(root: Path, pattern: str) -> dict[str, dict[str, Any]]:
    objects: dict[str, dict[str, Any]] = {}
    for path in sorted(root.glob(pattern)):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise FMSuiteReadError(f"{path.name}: {exc}") from exc
        if isinstance(value, dict) and isinstance(value.get("id"), str):
            objects[value["id"]] = value
    return objects


def party_roles_played_by_participants(index: FMIndex) -> set[str]:
    """Party Roles that have an explicit Participant Party player.

    FM allows Party Roles without concrete Participant Party nodes. API design is
    stricter: only Party Roles connected from participant.party by plays_role can
    become callable API actors.
    """
    result: set[str] = set()
    for relationship in index.relationships.values():
        if relationship.get("kind") != "plays_role":
            continue
        source = index.entities.get(str(relationship.get("sourceRef", "")))
        target = index.entities.get(str(relationship.get("targetRef", "")))
        if (
            source
            and source.get("category") == "participant"
            and source.get("kind") == "party"
            and target
            and target.get("category") == "role"
            and target.get("kind") == "party"
        ):
            result.add(target["id"])
    return result


def load_fm(fm_root: Path, check_report: Any) -> tuple[FMIndex | None, list[Diagnostic]]:
    """Consume a digest-bound successful FM result, without another FM check."""
    diagnostics: list[Diagnostic] = []
    fm_root = fm_root.resolve()
    if not fm_root.is_dir() or not (fm_root / "model.json").is_file():
        return None, [error("FM_INVALID", "FM 目录缺少 model.json", location=str(fm_root))]
    if (
        not isinstance(check_report, dict)
        or check_report.get("checkVersion") != 5
        or check_report.get("consistent") is not True
        or check_report.get("complete") is not True
        or check_report.get("valid") is not True
        or check_report.get("inputChanged") is not False
        or check_report.get("modelValidated") is not True
        or check_report.get("errors") != []
        or not isinstance(check_report.get("modelDigest"), str)
    ):
        return None, [error("FM_CHECK_INVALID", "需要 FM 阶段实际通过且输入未变化的检查结果")]
    try:
        # The caller locates the independent FM package before this read-only adapter runs.
        model_digest = importlib.import_module("check_fm").model_digest
        model = importlib.import_module("fm_model")
        scope = importlib.import_module("fm_scope")
        simulation = importlib.import_module("fm_simulation")
    except ImportError as exc:
        return None, [error("FM_SKILL_INVALID", f"无法加载 FM 只读工具及依赖: {exc}")]
    try:
        before = snapshot_tree(fm_root)
        if model_digest(fm_root) != check_report["modelDigest"]:
            return None, [error("FM_CHECK_STALE", "FM 已变化，返回 FM 阶段重新检查")]
        # Read the current representation; do not execute compiler validation.
        selected = scope.ready_scope(model.load_model(fm_root), check_report)
        compiled = model.compiled_document(selected)
    except (OSError, ValueError) as exc:
        return None, [error("FM_INVALID", f"无法读取当前 FM: {exc}")]
    entities = {item["id"]: item for item in compiled.get("entities", [])}
    relationships = {item["id"]: item for item in compiled.get("relationships", [])}
    rules = {item["id"]: item for item in compiled.get("rules", [])}
    try:
        scenarios = _load_json_objects(fm_root, "validation/scenarios/*.json")
        instances = _load_json_objects(fm_root, "validation/instances/*.json")
        selected_suite = scope.scope_suite(selected, simulation.ValidationSuite(
            root=fm_root, scenarios=list(scenarios.values()), instances=list(instances.values())
        ))
        scenarios = selected_suite.scenarios_by_id
        instances = selected_suite.instances_by_id
        if before != snapshot_tree(fm_root) or model_digest(fm_root) != check_report["modelDigest"]:
            return None, [error("SOURCE_CHANGED", "FM 输入在读取期间发生变化")]
    except (FMSuiteReadError, OSError) as exc:
        return None, [error("FM_INVALID", f"无法读取验证套件: {exc}")]
    members: dict[str, list[str]] = {}
    fulfillment_parent: dict[str, str] = {}
    for entity in entities.values():
        context_ref = entity.get("contextRef")
        if context_ref:
            members.setdefault(context_ref, []).append(entity["id"])
        if (
            entity.get("category") == "fulfillment"
            and entity.get("contextRef")
        ):
            fulfillment_parent[entity["id"]] = entity["contextRef"]
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
    played_party_roles = party_roles_played_by_participants(index)
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
        "playedPartyRoles": sorted(played_party_roles),
        "unplayedPartyRoles": sorted(
            value["id"]
            for value in entities
            if value.get("category") == "role"
            and value.get("kind") == "party"
            and value["id"] not in played_party_roles
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
