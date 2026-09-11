"""Bounded local JSON payload schemas; never resolve remote schema references."""

from __future__ import annotations

from typing import Any

from jsonschema import Draft202012Validator, FormatChecker, SchemaError

from .diagnostics import error


def schema_supported(schema: Any) -> bool:
    if isinstance(schema, dict):
        if any(key in schema for key in ("$ref", "$dynamicRef", "$id")):
            return False
        return all(schema_supported(value) for value in schema.values())
    if isinstance(schema, list):
        return all(schema_supported(value) for value in schema)
    return True


def payload_schema(payload: dict) -> dict:
    return {
        "type": "object",
        "properties": {field["name"]: field["schema"] for field in payload["fields"]},
        "required": [field["name"] for field in payload["fields"] if field["required"]],
        "additionalProperties": False,
    }


def example_errors(schema: dict, value: Any) -> list[str]:
    if not schema_supported(schema):
        return ["只支持本地内联 JSON Schema，不解析引用"]
    try:
        Draft202012Validator.check_schema(schema)
        return sorted(
            error.message
            for error in Draft202012Validator(
                schema, format_checker=FormatChecker()
            ).iter_errors(value)
        )
    except (SchemaError, TypeError, ValueError) as exc:
        return [str(exc)]


def _field_origin(field: dict, index: Any, target: str, request: bool) -> list:
    diagnostics = []
    if request and field["origin"] not in ("client", "reference"):
        diagnostics.append(
            error(
                "CONTRACT_FIELD_ORIGIN",
                "请求不能将服务端记录或派生值当作客户端输入",
                target,
            )
        )
    reference = field.get("fmAttributeRef")
    if not reference:
        return diagnostics
    entity_id, _, attribute_name = reference.partition("#")
    attribute = next(
        (
            item
            for item in index.entities.get(entity_id, {}).get("attributes", [])
            if item["name"] == attribute_name
        ),
        None,
    )
    if attribute is None:
        diagnostics.append(
            error("CONTRACT_FM_REF", f"字段来源不存在: {reference}", target)
        )
        return diagnostics
    derived = attribute.get("derivedByRuleRef")
    if (derived and field["origin"] != "derived") or (
        field["origin"] == "derived" and not derived
    ):
        diagnostics.append(
            error("CONTRACT_FIELD_ORIGIN", f"派生口径与 FM 不一致: {reference}", target)
        )
    expected_types = {
        "string": "string",
        "id": "string",
        "timestamp": "string",
        "date": "string",
        "bool": "boolean",
        "int": "integer",
        "uint": "integer",
    }
    expected = expected_types.get(attribute.get("valueType"))
    declared = field["schema"].get("type")
    if expected and declared not in (expected, [expected, "null"], ["null", expected]):
        diagnostics.append(
            error("CONTRACT_FIELD_TYPE", f"字段类型与 FM 不一致: {reference}", target)
        )
    if attribute.get("valueType") in ("timestamp", "date"):
        expected_format = (
            "date-time" if attribute["valueType"] == "timestamp" else "date"
        )
        if field["schema"].get("format") != expected_format:
            diagnostics.append(
                error(
                    "CONTRACT_FIELD_TYPE",
                    f"业务时间需声明 {expected_format}: {reference}",
                    target,
                )
            )
    return diagnostics


def validate_payload(
    payload: dict, index: Any, target: str, request: bool = False
) -> list:
    diagnostics = []
    seen = set()
    for field in payload["fields"]:
        if field["name"] in seen:
            diagnostics.append(error("CONTRACT_DUPLICATE", "字段名称重复", target))
        seen.add(field["name"])
        if not schema_supported(field["schema"]):
            diagnostics.append(
                error(
                    "CONTRACT_SCHEMA_UNSUPPORTED", "禁止外部或递归 Schema 引用", target
                )
            )
        diagnostics.extend(_field_origin(field, index, target, request))
    for message in example_errors(payload_schema(payload), payload["example"]):
        diagnostics.append(error("CONTRACT_EXAMPLE_INVALID", message, target))
    return diagnostics
