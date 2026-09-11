"""Deterministic OpenAPI 3.1 projection from validated HTTP design.

OpenAPI is a delivery contract, not an FM source and not runtime validation.
"""

from __future__ import annotations

import copy
import re
from collections import defaultdict
from typing import Any

import yaml

_PATH_PARAMETER = re.compile(r"\{([^{}]+)\}")
_COMPONENT_CHARACTER = re.compile(r"[^A-Za-z0-9._-]")


class _IndentedSafeDumper(yaml.SafeDumper):
    def increase_indent(self, flow: bool = False, indentless: bool = False):
        return super().increase_indent(flow, False)


def _represent_text(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
    # Fold long scalar values without changing URI/reference bytes on YAML load.
    return dumper.represent_scalar(
        "tag:yaml.org,2002:str",
        value,
        style=">" if len(value) > 40 and "\n" not in value else None,
    )


_IndentedSafeDumper.add_representer(str, _represent_text)


def _component_name(identifier: str) -> str:
    return _COMPONENT_CHARACTER.sub("_", identifier.replace(".", "_"))


def _canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    return copy.deepcopy(value)


def _payload_schema(payload: dict[str, Any]) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": {
            field["name"]: _canonical(field["schema"]) for field in payload["fields"]
        },
        "additionalProperties": False,
    }
    required = [field["name"] for field in payload["fields"] if field["required"]]
    if required:
        schema["required"] = required
    return schema


def _link_schema(example: dict[str, Any]) -> dict[str, Any]:
    properties = {
        rel: {
            "type": "object",
            "properties": {"href": {"type": "string", "format": "uri-reference"}},
            "required": ["href"],
            "additionalProperties": True,
        }
        for rel in sorted(example)
    }
    return {
        "type": "object",
        "properties": properties,
        "required": sorted(properties),
        "additionalProperties": True,
    }


def _representation_schema(representation: dict[str, Any]) -> dict[str, Any]:
    schema = _payload_schema(representation)
    required = list(schema.get("required", []))
    example = representation["example"]
    if representation["mediaType"] == "application/hal+json":
        schema["properties"]["_links"] = _link_schema(example.get("_links", {}))
        required.append("_links")
        if "_embedded" in example:
            schema["properties"]["_embedded"] = {
                "type": "object",
                "additionalProperties": True,
            }
            required.append("_embedded")
    if required:
        schema["required"] = required
    return schema


def _operation_ids(operations: list[dict[str, Any]]) -> dict[str, str]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for operation in operations:
        grouped[(operation["uri"], operation["method"].lower())].append(operation)
    result: dict[str, str] = {}
    for (uri, method), variants in sorted(grouped.items()):
        refs = sorted(item["capabilityRef"] for item in variants)
        operation_id = (
            refs[0]
            if len(refs) == 1
            else _component_name(f"{method}_{uri.strip('/') or 'root'}")
        )
        for ref in refs:
            result[ref] = operation_id
    return result


def _runtime_expression(source: dict[str, Any]) -> str:
    if source["kind"] == "path":
        return f"$request.path.{source['name']}"
    return f"$response.body#/{source['name']}"


def _response_links(
    representation: dict[str, Any], operation_ids: dict[str, str]
) -> dict[str, Any]:
    result = {}
    for link in sorted(representation["links"], key=lambda item: item["rel"]):
        operation_id = operation_ids.get(link["capabilityRef"])
        if operation_id is None:
            continue
        value: dict[str, Any] = {
            "operationId": operation_id,
            "parameters": {
                name: _runtime_expression(source)
                for name, source in sorted(link["parameterBindings"].items())
            },
            "x-fm-link-kind": link["kind"],
        }
        if link.get("whenRuleRef"):
            value["description"] = (
                "仅当 FM 规则允许时由运行时表示提供；OpenAPI 不执行该规则。"
            )
            value["x-fm-when-rule-ref"] = link["whenRuleRef"]
        result[link["rel"]] = value
    return result


def _headers(headers: dict[str, str]) -> dict[str, Any]:
    return {
        name: {"schema": {"type": "string"}, "example": value}
        for name, value in sorted(headers.items(), key=lambda item: item[0].lower())
    }


def _response(
    response: dict[str, Any],
    representations: dict[str, dict[str, Any]],
    operation_ids: dict[str, str],
) -> dict[str, Any]:
    value: dict[str, Any] = {"description": response["description"]}
    if response["headers"]:
        value["headers"] = _headers(response["headers"])
    representation = representations.get(response.get("representationRef", ""))
    if representation is not None:
        name = _component_name(representation["id"])
        value["content"] = {
            representation["mediaType"]: {
                "schema": {"$ref": f"#/components/schemas/{name}"},
                "example": _canonical(representation["example"]),
            }
        }
        links = _response_links(representation, operation_ids)
        if links:
            value["links"] = links
    result_ref = response.get("resultCapabilityRef")
    if result_ref in operation_ids:
        value.setdefault("links", {})["result"] = {
            "operationId": operation_ids[result_ref],
            "description": "异步结果位置由响应 Location 提供。",
            "x-location-header": "Location",
        }
    return value


def _parameters(
    operation: dict[str, Any], representations: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    result = [
        {
            "name": name,
            "in": "path",
            "required": True,
            "schema": {"type": "string"},
        }
        for name in _PATH_PARAMETER.findall(operation["uri"])
    ]
    idempotency = operation["idempotency"]
    if idempotency["mode"] == "key":
        result.append(
            {
                "name": idempotency["header"],
                "in": "header",
                "required": True,
                "schema": {"type": "string"},
                "description": idempotency["reason"],
            }
        )
    if operation["concurrency"]["mode"] == "if-match":
        result.append(
            {
                "name": "If-Match",
                "in": "header",
                "required": True,
                "schema": {"type": "string"},
                "description": operation["concurrency"]["reason"],
            }
        )
    validators = {
        representations[response["representationRef"]]["cache"].get("validator")
        for response in operation["responses"]
        if response.get("representationRef") in representations
    }
    conditional_headers = {
        "etag": "If-None-Match",
        "last-modified": "If-Modified-Since",
    }
    if operation["method"] == "GET":
        for validator in sorted(validators - {None}):
            result.append(
                {
                    "name": conditional_headers[validator],
                    "in": "header",
                    "required": False,
                    "schema": {"type": "string"},
                    "description": "缓存条件读取；省略时执行普通读取。",
                }
            )
    return result


def _operation(
    variants: list[dict[str, Any]],
    capabilities: dict[str, dict[str, Any]],
    representations: dict[str, dict[str, Any]],
    operation_ids: dict[str, str],
) -> dict[str, Any]:
    variants = sorted(variants, key=lambda item: item["capabilityRef"])
    representative = variants[0]
    refs = [item["capabilityRef"] for item in variants]
    roles = sorted({item["actorRoleRef"] for item in variants})
    summaries = [
        capabilities[ref]["businessCapability"] for ref in refs if ref in capabilities
    ]
    value: dict[str, Any] = {
        "operationId": operation_ids[refs[0]],
        "summary": " / ".join(summaries) or "API capability",
        "parameters": _parameters(representative, representations),
        "responses": {
            str(response["status"]): _response(response, representations, operation_ids)
            for response in sorted(
                representative["responses"], key=lambda item: item["status"]
            )
        },
        "x-fm-capability-refs": refs,
        "x-actor-role-refs": roles,
        "x-binding-refs": sorted(
            {ref for item in variants for ref in item["bindingRefs"]}
        ),
        "x-fm-rule-bindings": _canonical(representative.get("ruleBindings", [])),
        "x-fm-operation-variants": [
            {
                "capabilityRef": item["capabilityRef"],
                "actorRoleRef": item["actorRoleRef"],
            }
            for item in variants
        ],
    }
    request = representative["request"]
    if request["fields"]:
        value["requestBody"] = {
            "required": any(field["required"] for field in request["fields"]),
            "content": {
                request["mediaType"]: {
                    "schema": _payload_schema(request),
                    "example": _canonical(request["example"]),
                }
            },
        }
    return value


def build_openapi(projection: dict[str, Any]) -> dict[str, Any]:
    """Build an OpenAPI delivery projection without adding capabilities."""
    document: dict[str, Any] = {
        "openapi": "3.1.0",
        "info": {
            "title": projection["apiId"],
            "version": "generated",
        },
        "paths": {},
        "components": {"schemas": {}},
        "x-generated-from": "fm-api-design projection.json",
        "x-fm-api-design-schema-version": projection["schemaVersion"],
        "x-runtime-validated": False,
    }
    http = projection["http"]
    document["x-runtime-validated"] = http["runtimeValidated"]
    representations = {item["id"]: item for item in http["representations"]}
    document["components"]["schemas"] = {
        _component_name(identifier): _representation_schema(representation)
        for identifier, representation in sorted(representations.items())
    }
    capabilities = {item["id"]: item for item in projection["capabilities"]}
    operation_ids = _operation_ids(http["operations"])
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for operation in http["operations"]:
        grouped[(operation["uri"], operation["method"].lower())].append(operation)
    for (uri, method), variants in sorted(grouped.items()):
        document["paths"].setdefault(uri, {})[method] = _operation(
            variants, capabilities, representations, operation_ids
        )
    return document


def render_openapi(projection: dict[str, Any]) -> str:
    return yaml.dump(
        build_openapi(projection),
        Dumper=_IndentedSafeDumper,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=70,
    )
