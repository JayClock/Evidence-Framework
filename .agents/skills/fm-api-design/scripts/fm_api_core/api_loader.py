from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import jsonschema
import yaml

from .diagnostics import Diagnostic, error


class UniqueKeyLoader(yaml.SafeLoader):
    pass


def _construct_mapping(
    loader: UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False
) -> dict:
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "mapping", node.start_mark, f"duplicate key: {key}", key_node.start_mark
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_mapping
)


def load_api(
    path: Path, *, content: bytes | None = None
) -> tuple[dict[str, Any] | None, list[Diagnostic]]:
    schema_path = Path(__file__).resolve().parents[2] / "schemas" / "api.schema.json"
    try:
        text = (
            content.decode("utf-8")
            if content is not None
            else path.read_text(encoding="utf-8")
        )
        documents = list(yaml.load_all(text, Loader=UniqueKeyLoader))
    except (OSError, UnicodeError, TypeError, ValueError, yaml.YAMLError) as exc:
        return None, [error("DESIGN_INVALID", str(exc), location=str(path))]
    if len(documents) != 1 or not isinstance(documents[0], dict):
        return None, [
            error("DESIGN_INVALID", "设计必须是单个 YAML 对象", location=str(path))
        ]
    design = documents[0]
    try:
        json.dumps(design, allow_nan=False)
    except (TypeError, ValueError, RecursionError) as exc:
        return None, [
            error(
                "DESIGN_INVALID",
                f"设计包含非 JSON 值或循环结构: {exc}",
                location=str(path),
            )
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
        "representations",
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
