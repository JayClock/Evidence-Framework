from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jsonschema

from .diagnostics import Diagnostic, error

_LEGACY_SUFFIXES = {".yaml", ".yml"}


class DesignJsonError(ValueError):
    """The design file is not strict JSON."""


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DesignJsonError(f"设计包含重复 JSON key: {key}")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise DesignJsonError(f"设计包含非 JSON 常量: {value}")


def load_api(
    path: Path, *, content: bytes | None = None
) -> tuple[dict[str, Any] | None, list[Diagnostic]]:
    schema_path = Path(__file__).resolve().parents[2] / "schemas" / "api.schema.json"
    if path.suffix.lower() in _LEGACY_SUFFIXES:
        return None, [
            error(
                "DESIGN_INVALID",
                "API 设计必须使用 .json 文件，不再接受 YAML",
                location=str(path),
            )
        ]
    try:
        text = (
            content.decode("utf-8")
            if content is not None
            else path.read_text(encoding="utf-8")
        )
    except (OSError, UnicodeError, TypeError) as exc:
        return None, [error("DESIGN_INVALID", str(exc), location=str(path))]
    try:
        design = json.loads(
            text, object_pairs_hook=_unique_object, parse_constant=_reject_constant
        )
    except json.JSONDecodeError as exc:
        return None, [
            error("DESIGN_INVALID", f"设计不是合法 JSON: {exc}", location=str(path))
        ]
    except (TypeError, ValueError, RecursionError) as exc:
        return None, [error("DESIGN_INVALID", str(exc), location=str(path))]
    if not isinstance(design, dict):
        return None, [
            error("DESIGN_INVALID", "设计必须是单个 JSON 对象", location=str(path))
        ]
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return None, [
            error(
                "ENVIRONMENT_ERROR",
                f"无法读取设计 Schema: {exc}",
                location=str(schema_path),
            )
        ]
    validator = jsonschema.Draft202012Validator(schema)
    diagnostics = [
        error(
            "DESIGN_INVALID",
            item.message,
            location="$" + "".join(f"[{part!r}]" for part in item.absolute_path),
        )
        for item in sorted(
            validator.iter_errors(design),
            key=lambda value: tuple(map(str, value.absolute_path)),
        )
    ]
    if diagnostics:
        return design, diagnostics
    for section in (
        "sources",
        "decisions",
        "resources",
        "bindings",
        "scenarios",
        "capabilities",
        "journeys",
    ):
        seen: set[str] = set()
        for index, item in enumerate(design.get(section, [])):
            item_id = item.get("id")
            if item_id in seen:
                diagnostics.append(
                    error(
                        "DUPLICATE_ID",
                        f"{section} 中 ID 重复: {item_id}",
                        item_id,
                        f"$.{section}[{index}]",
                    )
                )
            seen.add(item_id)
    return design, diagnostics


def validate_json(document: dict[str, Any], schema_path: Path) -> list[Diagnostic]:
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [
            error(
                "ENVIRONMENT_ERROR",
                f"无法读取投影 Schema: {exc}",
                location=str(schema_path),
            )
        ]
    validator = jsonschema.Draft202012Validator(schema)
    return [
        error(
            "PROJECTION_INVALID",
            item.message,
            location="$" + "".join(f"[{part!r}]" for part in item.absolute_path),
        )
        for item in sorted(
            validator.iter_errors(document),
            key=lambda value: tuple(map(str, value.absolute_path)),
        )
    ]
