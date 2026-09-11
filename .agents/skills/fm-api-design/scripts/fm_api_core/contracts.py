"""Complete HTTP contracts for every declared interface; FM stays read-only."""

from __future__ import annotations

import copy
import importlib
import re

from .diagnostics import error, gap

links = importlib.import_module("fm_api_core.contract_links")
payloads = importlib.import_module("fm_api_core.contract_payloads")
journeys_module = importlib.import_module("fm_api_core.http_journeys")


def _response_checks(
    response: dict,
    capability: dict,
    representations: dict,
    capabilities: dict,
    resources: dict,
) -> list:
    diagnostics = []
    target = capability["id"]
    representation = representations.get(response.get("representationRef"))
    headers = {name.lower(): value for name, value in response["headers"].items()}
    if len(headers) != len(response["headers"]) or any(
        "\n" in value or "\r" in value for value in headers.values()
    ):
        diagnostics.append(error("CONTRACT_HEADERS", "响应头重复或包含换行", target))
    if response.get("representationRef") and not representation:
        diagnostics.append(
            error("CONTRACT_REPRESENTATION_REF", "响应表示不存在", target)
        )
    if (
        representation
        and capability["actorRoleRef"] not in representation["actorRoleRefs"]
    ):
        diagnostics.append(
            error("CONTRACT_RESPONSE_ROLE", "响应表示不允许当前调用角色消费", target)
        )
    if response["status"] in (204, 304) and representation:
        diagnostics.append(
            error("CONTRACT_RESPONSE_BODY", "204/304 不应携带表示 body", target)
        )
    if response["status"] == 304 and capability["method"] != "GET":
        diagnostics.append(
            error(
                "CONTRACT_READ_EFFECT", "304 只适用于当前方言中的 GET 条件读取", target
            )
        )
    if response["status"] == 201:
        resource = resources.get(capability["resourceRef"], {})
        uris = resource.get("uris", {})
        template = uris.get("item") or uris.get("singleton")
        if not template or not links.matches_uri(template, headers.get("location", "")):
            diagnostics.append(
                gap(
                    "CONTRACT_LOCATION",
                    f"{target}.location",
                    "design",
                    "创建响应需要指向新实例的 Location 样例",
                    target,
                )
            )
        if capability["method"] == "GET":
            diagnostics.append(error("CONTRACT_READ_EFFECT", "GET 不创建资源", target))
    if response["status"] == 202:
        result = capabilities.get(response.get("resultCapabilityRef"))
        if (
            not result
            or result["method"] != "GET"
            or result["actorRoleRef"] != capability["actorRoleRef"]
            or not links.matches_uri(result["uri"], headers.get("location", ""))
        ):
            diagnostics.append(
                gap(
                    "CONTRACT_ASYNC_RESULT",
                    f"{target}.async-result",
                    "design",
                    "异步受理需显式的同角色结果 GET 能力及可定位的 Location，不自动新增查询",
                    target,
                )
            )
    return diagnostics


def _operation_checks(
    operation: dict,
    capability: dict,
    representations: dict,
    capabilities: dict,
    resources: dict,
    index,
) -> list:
    target = capability["id"]
    diagnostics = payloads.validate_payload(
        operation["request"], index, target, request=True
    )
    if capability["method"] == "GET" and operation["request"]["fields"]:
        diagnostics.append(
            error(
                "CONTRACT_GET_BODY",
                "当前契约方言不支持 GET body；不从读取生成写入输入",
                target,
            )
        )
    if (
        capability["method"] != "GET"
        and operation["idempotency"]["mode"] == "not_applicable"
    ):
        diagnostics.append(
            gap(
                "CONTRACT_RETRY_UNRESOLVED",
                f"{target}.retry",
                "design",
                "写入能力须明确重试策略或不支持的原因",
                target,
            )
        )
    statuses = [response["status"] for response in operation["responses"]]
    if len(set(statuses)) != len(statuses):
        diagnostics.append(error("CONTRACT_DUPLICATE", "同能力响应状态重复", target))
    if not any(status < 300 for status in statuses) or not any(
        status >= 400 for status in statuses
    ):
        diagnostics.append(
            gap(
                "CONTRACT_RESPONSES_INCOMPLETE",
                f"{target}.responses",
                "design",
                "需声明成功和失败表现",
                target,
            )
        )
    for response in operation["responses"]:
        diagnostics.extend(
            _response_checks(
                response, capability, representations, capabilities, resources
            )
        )
    return diagnostics


def _cache_headers(operation: dict, representations: dict) -> list:
    diagnostics = []
    for response in operation["responses"]:
        representation = representations.get(response.get("representationRef"))
        if not representation:
            continue
        policy = representation["cache"]
        expected = (
            "no-store"
            if policy["mode"] == "no-store"
            else f"{policy['mode']}, max-age={policy['maxAge']}"
        )
        headers = response["headers"]
        key = next(
            (key for key in headers if key.lower() == "cache-control"), "Cache-Control"
        )
        if key in headers and headers[key] != expected:
            diagnostics.append(
                error(
                    "CONTRACT_CACHE_HEADERS",
                    "响应缓存头与表示缓存策略冲突",
                    operation["capabilityRef"],
                )
            )
        else:
            headers[key] = expected
        if policy.get("validator"):
            required = "etag" if policy["validator"] == "etag" else "last-modified"
            if required not in {key.lower() for key in headers}:
                diagnostics.append(
                    gap(
                        "CONTRACT_CACHE_VALIDATOR",
                        f"{operation['capabilityRef']}.cache-validator",
                        "design",
                        "可缓存响应须给出约定的验证头样例",
                        operation["capabilityRef"],
                    )
                )
    return diagnostics


def _operations(
    contract: dict, projection: dict, representations: list, index
) -> tuple[list, list]:
    capabilities = {item["id"]: item for item in projection["capabilities"]}
    resources = {item["id"]: item for item in projection["resources"]}
    by_id = {item["id"]: item for item in representations}
    result, diagnostics, seen = [], [], set()
    for original in sorted(
        contract["operations"], key=lambda item: item["capabilityRef"]
    ):
        operation = copy.deepcopy(original)
        ref = operation["capabilityRef"]
        capability = capabilities.get(ref)
        if ref in seen:
            diagnostics.append(error("CONTRACT_DUPLICATE", "能力契约重复", ref))
        seen.add(ref)
        if not capability:
            diagnostics.append(
                error("CONTRACT_CAPABILITY_REF", "契约引用的接口不存在或无效", ref)
            )
            continue
        diagnostics.extend(_cache_headers(operation, by_id))
        diagnostics.extend(
            _operation_checks(
                operation, capability, by_id, capabilities, resources, index
            )
        )
        result.append(
            {
                **operation,
                "method": capability["method"],
                "uri": capability["uri"],
                "actorRoleRef": capability["actorRoleRef"],
                "bindingRefs": capability["bindingRefs"],
                "ruleBindings": capability.get("ruleBindings", []),
            }
        )
    for ref in sorted(set(capabilities) - seen):
        diagnostics.append(
            gap(
                "CONTRACT_OPERATION_MISSING",
                f"{ref}.http-contract",
                "design",
                "业务接口尚无 HTTP 契约",
                ref,
            )
        )
    # Preserve per-role variants. Do not claim arbitrary overlapping routes are compatible.
    grouped = {}
    for operation in result:
        key = (operation["method"], re.sub(r"\{[^{}]+\}", "{}", operation["uri"]))
        signature = (
            operation["request"],
            operation["idempotency"],
            operation["concurrency"],
        )
        if key in grouped and grouped[key] != signature:
            diagnostics.append(
                gap(
                    "CONTRACT_OPERATION_VARIANT",
                    f"{operation['capabilityRef']}.route-variant",
                    "design",
                    "共享路由的输入或重试策略不同，需显式解决分派兼容性",
                    operation["capabilityRef"],
                )
            )
        grouped[key] = signature
    return result, diagnostics


def build_http(contract: dict, projection: dict, index) -> dict:
    diagnostics = []
    capabilities = {item["id"]: item for item in projection["capabilities"]}
    for section in ("representations", "journeys"):
        seen = set()
        for item in contract[section]:
            if item["id"] in seen:
                diagnostics.append(
                    error("CONTRACT_DUPLICATE", "契约 ID 重复", item["id"])
                )
            seen.add(item["id"])
    representations, representation_diagnostics = links.build_representations(
        contract, projection, index
    )
    diagnostics.extend(representation_diagnostics)
    operations, operation_diagnostics = _operations(
        contract, projection, representations, index
    )
    diagnostics.extend(operation_diagnostics)
    journeys, journey_diagnostics = journeys_module.check_journeys(
        contract, capabilities, operations, representations
    )
    diagnostics.extend(journey_diagnostics)
    covered = {
        step["capabilityRef"]
        for journey in journeys
        for step in journey.get("steps", [])
        if step["status"] == "mapped" and 200 <= step["expectStatus"] < 300
    }
    for ref in sorted(set(capabilities) - covered):
        diagnostics.append(
            gap(
                "HTTP_FLOW_UNCOVERED",
                f"{ref}.consumer-flow",
                "coverage",
                "接口尚无可静态映射的成功消费步骤；失败或仅 304 回放不替代成功路径",
                ref,
            )
        )
    diagnostics = sorted(
        set(diagnostics),
        key=lambda item: (item.severity, item.code, item.targetRef or "", item.message),
    )
    return {
        "complete": not diagnostics and not projection["diagnostics"],
        "runtimeValidated": False,
        "representations": representations,
        "operations": operations,
        "journeys": journeys,
        "diagnostics": [item.to_dict() for item in diagnostics],
    }
