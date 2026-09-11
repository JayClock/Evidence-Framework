"""Static client data-flow checks against declared examples, not HTTP execution."""

from __future__ import annotations

import importlib
import re
from urllib.parse import unquote

from .diagnostics import error, gap

links_module = importlib.import_module("fm_api_core.contract_links")
payloads = importlib.import_module("fm_api_core.contract_payloads")


def _issue(code: str, step: dict, message: str):
    return gap(code, f"{step['id']}.{code.lower()}", "coverage", message, step["id"])


def _source(source: dict, prior: dict):
    if source["kind"] == "literal":
        return True, source["value"]
    previous = prior.get(source["stepRef"])
    if previous is None:
        return False, None
    if source["kind"] == "response_field":
        values = previous["body"]
    else:
        values = previous["headers"]
    name = source["name"]
    if source["kind"] == "response_header":
        values = {key.lower(): value for key, value in values.items()}
        name = name.lower()
    return name in values, values.get(name)


def _location_parameters(template: str, location: str) -> dict | None:
    expression = re.escape(template)
    names = sorted(
        links_module.parameters(template),
        key=lambda name: template.index("{" + name + "}"),
    )
    for name in names:
        expression = expression.replace(re.escape("{" + name + "}"), r"([^/?#]+)", 1)
    match = re.fullmatch(expression, location)
    return (
        dict(zip(names, (unquote(value) for value in match.groups()), strict=True))
        if match
        else None
    )


def _follow(step: dict, capability: dict, prior: dict) -> tuple[dict, list]:
    via = step["via"]
    previous = prior.get(via["stepRef"])
    if previous is None:
        return {}, [_issue("HTTP_FLOW_LINK", step, "导航来源不是已映射的前序响应")]
    if via.get("header"):
        location = next(
            (
                value
                for key, value in previous["headers"].items()
                if key.lower() == "location"
            ),
            "",
        )
        bound = (
            _location_parameters(capability["uri"], location)
            if capability["method"] == "GET"
            else None
        )
    else:
        link = next(
            (
                item
                for item in previous["representation"].get("links", [])
                if item["rel"] == via["rel"]
            ),
            None,
        )
        if not link or link["capabilityRef"] != capability["id"]:
            return {}, [
                _issue("HTTP_FLOW_LINK", step, "前序响应未提供匹配的动作或导航链接")
            ]
        if link.get("whenRuleRef"):
            return {}, [
                _issue(
                    "HTTP_FLOW_CONDITION",
                    step,
                    "动态动作条件尚未运行求值，不能宣称该路径可达",
                )
            ]
        bound = links_module.bind_link(
            link, capability, previous["body"], previous["path"]
        )
    if bound is None:
        return {}, [
            _issue("HTTP_FLOW_LINK", step, "前序响应的链接或 Location 参数不可解析")
        ]
    return bound, []


def _inputs(step: dict, capability: dict, prior: dict) -> tuple[dict, list]:
    values = {"path": {}, "body": {}, "header": {}}
    diagnostics = []
    if step.get("via"):
        values["path"], diagnostics = _follow(step, capability, prior)
    for binding in step["inputs"]:
        target = binding["target"]
        name = binding["name"].lower() if target == "header" else binding["name"]
        if name in values[target]:
            diagnostics.append(
                error(
                    "HTTP_FLOW_DUPLICATE", "不能覆盖链接参数或重复绑定输入", step["id"]
                )
            )
            continue
        available, value = _source(binding["source"], prior)
        if not available:
            diagnostics.append(
                _issue(
                    "HTTP_FLOW_SOURCE",
                    step,
                    "输入来源必须是已成功映射的前序响应字段／头，不能前向引用",
                )
            )
        else:
            values[target][name] = value
    return values, diagnostics


def _required_inputs(
    step: dict, capability: dict, operation: dict, values: dict
) -> list:
    diagnostics = []
    if set(values["path"]) != links_module.parameters(capability["uri"]) or any(
        not isinstance(value, (str, int)) or isinstance(value, bool)
        for value in values["path"].values()
    ):
        diagnostics.append(
            _issue("HTTP_FLOW_INPUT", step, "URI 参数缺失、多余或不能作为实例定位值")
        )
    for message in payloads.example_errors(
        payloads.payload_schema(operation["request"]), values["body"]
    ):
        diagnostics.append(_issue("HTTP_FLOW_INPUT", step, message))
    required_headers = set()
    if operation["idempotency"]["mode"] == "key":
        required_headers.add(operation["idempotency"]["header"].lower())
    if operation["concurrency"]["mode"] == "if-match":
        required_headers.add("if-match")
    if not required_headers.issubset(values["header"]) or any(
        not isinstance(value, str) for value in values["header"].values()
    ):
        diagnostics.append(
            _issue("HTTP_FLOW_INPUT", step, "缺少幂等／并发头，或请求头不是字符串")
        )
    return diagnostics


def _step(
    step: dict,
    role: str,
    operations: dict,
    capabilities: dict,
    representations: dict,
    prior: dict,
):
    diagnostics = []
    capability = capabilities.get(step["capabilityRef"])
    operation = operations.get(step["capabilityRef"])
    if not capability or not operation or capability["actorRoleRef"] != role:
        return None, [
            _issue("HTTP_FLOW_ROLE", step, "流程角色没有匹配的已选能力及契约")
        ]
    response = next(
        (
            item
            for item in operation["responses"]
            if item["status"] == step["expectStatus"]
        ),
        None,
    )
    if response is None:
        return None, [_issue("HTTP_FLOW_RESPONSE", step, "预期状态未在接口契约中声明")]
    values, input_diagnostics = _inputs(step, capability, prior)
    diagnostics.extend(input_diagnostics)
    diagnostics.extend(_required_inputs(step, capability, operation, values))
    if step["expectStatus"] == 304 and (
        capability["method"] != "GET"
        or not {"if-none-match", "if-modified-since"}.intersection(values["header"])
    ):
        diagnostics.append(
            _issue(
                "HTTP_FLOW_CONDITIONAL",
                step,
                "304 需要 GET 条件请求，不能以无条件读取冒充缓存复验",
            )
        )
    representation = representations.get(response.get("representationRef"), {})
    if representation and role not in representation["actorRoleRefs"]:
        diagnostics.append(_issue("HTTP_FLOW_ROLE", step, "该角色不能消费所选响应表示"))
    body = representation.get("example", {})
    # Resolve a response resource identity from its Location or the request URI.
    path = dict(values["path"])
    if representation:
        location = next(
            (v for k, v in response["headers"].items() if k.lower() == "location"), None
        )
        template = representation["uri"]
        if location:
            returned = _location_parameters(template, location)
            if returned is not None:
                if any(
                    name in path and str(path[name]) != value
                    for name, value in returned.items()
                ):
                    diagnostics.append(
                        _issue(
                            "HTTP_FLOW_INSTANCE",
                            step,
                            "响应 Location 改变了请求中的实例范围",
                        )
                    )
                path.update(returned)
        if representation["resourceRef"] == capability["resourceRef"] and any(
            name in path and str(path[name]) != str(value)
            for name, value in representation["exampleParameters"].items()
        ):
            diagnostics.append(
                _issue(
                    "HTTP_FLOW_INSTANCE",
                    step,
                    "响应表示样例与本次请求或 Location 指定的资源实例不一致",
                )
            )
    return {
        "body": body,
        "headers": response["headers"],
        "path": path,
        "representation": representation,
    }, diagnostics


def check_journeys(
    contract: dict, capabilities: dict, operations: list, representations: list
) -> tuple[list, list]:
    diagnostics, results = [], []
    operations_by_id = {item["capabilityRef"]: item for item in operations}
    representations_by_id = {item["id"]: item for item in representations}
    if not contract["journeys"]:
        return [{"status": "not_evaluated", "reason": "未提供 HTTP 消费流程"}], [
            gap(
                "HTTP_FLOW_NOT_EVALUATED",
                "contract.http-flow",
                "coverage",
                "尚未验证消费者流程",
            )
        ]
    for journey in contract["journeys"]:
        prior, rows, seen = {}, [], set()
        for step in journey["steps"]:
            value, issues = _step(
                step,
                journey["actorRoleRef"],
                operations_by_id,
                capabilities,
                representations_by_id,
                prior,
            )
            if step["id"] in seen:
                issues.append(
                    error("CONTRACT_DUPLICATE", "HTTP 步骤 ID 重复", step["id"])
                )
            seen.add(step["id"])
            diagnostics.extend(issues)
            rows.append(
                {
                    "id": step["id"],
                    "capabilityRef": step["capabilityRef"],
                    "expectStatus": step["expectStatus"],
                    "status": "gap" if issues else "mapped",
                }
            )
            if not issues and value is not None:
                prior[step["id"]] = value
        results.append(
            {
                "id": journey["id"],
                "actorRoleRef": journey["actorRoleRef"],
                "status": "gap"
                if any(row["status"] == "gap" for row in rows)
                else "mapped",
                "steps": rows,
            }
        )
    return results, diagnostics
