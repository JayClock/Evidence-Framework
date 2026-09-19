"""Static client requests resolved from declared entries and returned hypermedia."""
from __future__ import annotations

import contextlib
import copy
import importlib
import re
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit

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
    values = previous["body"] if source["kind"] == "response_field" else {k.lower(): v for k, v in previous["headers"].items()}
    name = source["name"] if source["kind"] == "response_field" else source["name"].lower()
    return name in values, values.get(name)


def _location_parameters(template: str, location: str) -> dict | None:
    expression = re.escape(template)
    names = sorted(links_module.parameters(template), key=lambda name: template.index("{" + name + "}"))
    for name in names:
        expression = expression.replace(re.escape("{" + name + "}"), r"([^/?#]+)", 1)
    match = re.fullmatch(expression, location)
    return dict(zip(names, (unquote(value) for value in match.groups()), strict=True)) if match else None


def _follow(step: dict, capability: dict, prior: dict, representations: dict) -> tuple[dict, dict, list]:
    via = step["via"]
    previous = prior.get(via["stepRef"])
    if previous is None:
        return {}, {}, [_issue("HTTP_FLOW_LINK", step, "导航来源不是已映射的前序响应")]
    representation, body = previous["representation"], previous["body"]
    if via.get("member"):
        if via.get("header") or via.get("rel"):
            return {}, {}, [_issue("HTTP_FLOW_LINK", step, "集合成员导航不能同时指定 Location 或其他 rel")]
        member = via["member"]
        group = next(
            (item for item in representation.get("embedded", []) if item["rel"] == member["rel"]),
            None,
        )
        embedded = body.get("_embedded", {}).get(member["rel"], [])
        refs = group.get("representationRefs", []) if group else []
        if (
            not group
            or member["index"] >= len(refs)
            or not isinstance(embedded, list)
            or member["index"] >= len(embedded)
        ):
            return {}, {}, [_issue("HTTP_FLOW_LINK", step, "集合成员导航没有匹配的嵌入表示")]
        representation = representations.get(refs[member["index"]])
        if not representation:
            return {}, {}, [_issue("HTTP_FLOW_LINK", step, "集合成员导航引用的表示不存在")]
        if capability["method"] != "GET" or capability["resourceRef"] != representation["resourceRef"] or capability["view"] != representation["view"]:
            return {}, {}, [_issue("HTTP_FLOW_LINK", step, "集合成员 self 链接需要匹配的读取能力")]
        body = embedded[member["index"]]
        href = body.get("_links", {}).get("self", {}).get("href", "")
    elif via.get("header"):
        href = next((value for key, value in previous["headers"].items() if key.lower() == "location"), "")
        if capability["method"] != "GET":
            return {}, {}, [_issue("HTTP_FLOW_LINK", step, "Location 只能用于已有 GET 的结果发现")]
    else:
        rel = via["rel"]
        if rel in {"self", "next"}:
            if (
                capability["method"] != "GET"
                or capability["resourceRef"] != representation.get("resourceRef")
                or capability["view"] != representation.get("view")
                or (rel == "next" and not representation.get("pagination"))
            ):
                return {}, {}, [_issue("HTTP_FLOW_LINK", step, "self/next 需要匹配表示视图的读取能力")]
        else:
            link = next((item for item in representation.get("links", []) if item["rel"] == rel), None)
            if not link or link["capabilityRef"] != capability["id"]:
                return {}, {}, [_issue("HTTP_FLOW_LINK", step, "前序响应未提供匹配的动作或导航链接")]
            if link.get("whenRuleRef"):
                return {}, {}, [_issue("HTTP_FLOW_CONDITION", step, "动态动作条件尚未运行求值，不能宣称该路径可达")]
        href = body.get("_links", {}).get(rel, {}).get("href", "")
    uri = urlsplit(href)
    pairs = parse_qsl(uri.query, keep_blank_values=True)
    bound = _location_parameters(capability["uri"], uri.path)
    if uri.scheme or uri.netloc or uri.fragment or bound is None or len(dict(pairs)) != len(pairs):
        return {}, {}, [_issue("HTTP_FLOW_LINK", step, "返回链接或 Location 不是可解析的本契约资源地址")]
    return bound, dict(pairs), []


def _inputs(step: dict, capability: dict, prior: dict, representations: dict) -> tuple[dict, list]:
    values = {"path": {}, "query": {}, "body": {}, "header": {}}
    diagnostics = []
    if step.get("via"):
        values["path"], values["query"], diagnostics = _follow(step, capability, prior, representations)
    for binding in step["inputs"]:
        target = binding["target"]
        name = binding["name"]
        existing_names = {item.lower() for item in values[target]} if target == "header" else set(values[target])
        if name.lower() in existing_names:
            diagnostics.append(error("HTTP_FLOW_DUPLICATE", "不能覆盖链接参数或重复绑定输入", step["id"]))
            continue
        available, value = _source(binding["source"], prior)
        if not available:
            diagnostics.append(_issue("HTTP_FLOW_SOURCE", step, "输入来源必须是已映射的前序响应字段／头，不能前向引用或跨角色流程读取"))
        else:
            values[target][name] = value
    return values, diagnostics


def _required_inputs(step: dict, capability: dict, operation: dict, values: dict, representations: dict) -> list:
    diagnostics = []
    if set(values["path"]) != links_module.parameters(capability["uri"]) or any(not isinstance(v, (str, int)) or isinstance(v, bool) for v in values["path"].values()):
        diagnostics.append(_issue("HTTP_FLOW_INPUT", step, "URI 参数缺失、多余或不能作为实例定位值"))
    allowed_queries = {r["pagination"]["parameter"] for r in representations.values() if r.get("pagination") and r["resourceRef"] == capability["resourceRef"] and r["view"] == capability["view"] and capability["actorRoleRef"] in r["actorRoleRefs"]}
    if (values["query"] and capability["method"] != "GET") or not set(values["query"]).issubset(allowed_queries) or any(not isinstance(v, (str, int)) or isinstance(v, bool) for v in values["query"].values()):
        diagnostics.append(_issue("HTTP_FLOW_INPUT", step, "查询参数必须来自当前角色集合读取的分页契约"))
    for message in payloads.example_errors(payloads.payload_schema(operation["request"]), values["body"]):
        diagnostics.append(_issue("HTTP_FLOW_INPUT", step, message))
    required_headers = set()
    if operation["idempotency"]["mode"] == "key":
        required_headers.add(operation["idempotency"]["header"].lower())
    if operation["concurrency"]["mode"] == "if-match":
        required_headers.add("if-match")
    present_headers = {name.lower() for name in values["header"]}
    if not required_headers.issubset(present_headers) or any(not isinstance(v, str) or "\n" in v or "\r" in v for v in values["header"].values()):
        diagnostics.append(_issue("HTTP_FLOW_INPUT", step, "缺少幂等／并发头，或请求头无效"))
    return diagnostics


def _response_example(step: dict, response: dict, representations: dict, capabilities: dict, index, query: dict) -> tuple[dict, dict, list]:
    representation = copy.deepcopy(representations.get(response.get("representationRef"), {}))
    headers = dict(response["headers"])
    diagnostics = []
    sample = step.get("responseExample")
    if sample:
        if not representation:
            return {}, headers, [_issue("HTTP_FLOW_RESPONSE", step, "无响应表示的状态不能替换表示样例")]
        representation["example"] = sample["body"]
        representation["exampleParameters"] = sample["parameters"]
        diagnostics.extend(payloads.validate_payload(representation, index, step["id"]))
        if set(sample["parameters"]) != links_module.parameters(representation["uri"]):
            diagnostics.append(_issue("HTTP_FLOW_INSTANCE", step, "响应样例参数与资源视图不匹配"))
        # Only instance-specific headers may vary; transport policies remain contractual.
        for name, value in sample["headers"].items():
            declared = next((k for k in headers if k.lower() == name.lower()), None)
            if declared is None or name.lower() not in {"location", "etag", "last-modified"} or "\r" in value or "\n" in value:
                diagnostics.append(_issue("HTTP_FLOW_RESPONSE", step, "响应样例仅可替换已声明的 Location/ETag/Last-Modified"))
            else:
                headers[declared] = value
        if len({k.lower() for k in sample["headers"]}) != len(sample["headers"]):
            diagnostics.append(_issue("HTTP_FLOW_RESPONSE", step, "响应样例包含重复头"))
    if representation and representation["mediaType"] == "application/hal+json":
        body = {k: v for k, v in representation["example"].items() if k != "_links"}
        rendered_links, issues = links_module._links(representation, capabilities, index, representation["exampleParameters"])
        diagnostics.extend(issues)
        uri = links_module.expand(representation["uri"], representation["exampleParameters"])
        rendered_links["self"] = {"href": uri + ("?" + urlencode(query) if query else "")}
        if representation.get("pagination"):
            pagination = representation["pagination"]
            rendered_links["next"] = {"href": uri + "?" + urlencode({**query, pagination["parameter"]: pagination["nextExample"]})}
        body["_links"] = rendered_links
        representation["example"] = body
    return representation, headers, diagnostics


def _step(step: dict, role: str, operations: dict, capabilities: dict, representations: dict, prior: dict, index):
    capability = capabilities.get(step["capabilityRef"])
    operation = operations.get(step["capabilityRef"])
    if not capability or not operation or capability["actorRoleRef"] != role:
        return None, [_issue("HTTP_FLOW_ROLE", step, "流程角色没有匹配的业务接口及契约")]
    response = next((r for r in operation["responses"] if r["status"] == step["expectStatus"]), None)
    if response is None:
        return None, [_issue("HTTP_FLOW_RESPONSE", step, "预期状态未在接口契约中声明")]
    values, diagnostics = _inputs(step, capability, prior, representations)
    diagnostics.extend(_required_inputs(step, capability, operation, values, representations))
    if step["expectStatus"] == 304 and (
        capability["method"] != "GET"
        or not {"if-none-match", "if-modified-since"}.intersection(
            {name.lower() for name in values["header"]}
        )
    ):
        diagnostics.append(_issue("HTTP_FLOW_CONDITIONAL", step, "304 需要 GET 条件请求"))
    representation, headers, issues = _response_example(step, response, representations, capabilities, index, values["query"])
    diagnostics.extend(issues)
    if representation and role not in representation["actorRoleRefs"]:
        diagnostics.append(_issue("HTTP_FLOW_ROLE", step, "该角色不能消费所选响应表示"))
    body = representation.get("example", {})
    path = dict(values["path"])
    location = next((v for k, v in headers.items() if k.lower() == "location"), None)
    if step["expectStatus"] in (201, 202):
        if step["expectStatus"] == 202:
            template = capabilities.get(response.get("resultCapabilityRef"), {}).get("uri", "")
        else:
            # Creation identity comes from the declared resource, even without a body.
            template = next((r["uri"] for r in representations.values() if r["resourceRef"] == capability["resourceRef"] and r["view"] in {"item", "singleton"}), "")
            if not template:
                template = location or ""
        if location is None or _location_parameters(template, location) is None:
            diagnostics.append(_issue("HTTP_FLOW_INSTANCE", step, "响应 Location 与创建或结果资源不匹配"))
    if representation:
        if location:
            returned = _location_parameters(representation["uri"], location)
            if returned is not None:
                if any(name in path and str(path[name]) != value for name, value in returned.items()):
                    diagnostics.append(_issue("HTTP_FLOW_INSTANCE", step, "响应 Location 改变了请求中的实例范围"))
                path.update(returned)
        if representation["resourceRef"] == capability["resourceRef"] and any(name in path and str(path[name]) != str(value) for name, value in representation["exampleParameters"].items()):
            diagnostics.append(_issue("HTTP_FLOW_INSTANCE", step, "响应表示与请求或 Location 指定的资源实例不一致"))
    request = {"method": capability["method"], "uriTemplate": capability["uri"], "pathParameters": values["path"], "queryParameters": values["query"], "headers": values["header"]}
    request["uri"] = capability["uri"]
    with contextlib.suppress(KeyError):
        request["uri"] = links_module.expand(capability["uri"], values["path"]) + ("?" + urlencode(values["query"]) if values["query"] else "")
    if operation["request"]["fields"]:
        request.update(mediaType=operation["request"]["mediaType"], body=values["body"])
    expected = {"status": step["expectStatus"], "headers": headers}
    if representation:
        expected.update(representationRef=representation["id"], body=body)
    return {"body": body, "headers": headers, "path": path, "representation": representation, "request": request, "expect": expected}, diagnostics


def _entry_checks(contract: dict, capabilities: dict, scenario_refs: set[str] | None = None) -> list:
    diagnostics = []
    for entry in contract["entryPoints"]:
        capability = capabilities.get(entry["capabilityRef"])
        if scenario_refs is not None and not set(entry["scenarioRefs"]).issubset(scenario_refs):
            diagnostics.append(error("HTTP_FLOW_SCENARIO", "入口必须引用已有 API 场景", entry["id"]))
        if not capability or not set(entry["scenarioRefs"]).issubset(capability["scenarioRefs"]):
            diagnostics.append(error("HTTP_ENTRY_CAPABILITY", "入口必须指向支持这些场景的已有能力", entry["id"]))
        basis = entry["basis"]
        if not basis.get("fmRefs") and not basis.get("sourceRefs"):
            diagnostics.append(gap("HTTP_ENTRY_BASIS", f"{entry['id']}.basis", "business", "入口及初始上下文需要 FM 或业务来源依据", entry["id"]))
    return diagnostics


def check_journeys(
    contract: dict,
    capabilities: dict,
    operations: list,
    representations: list,
    index,
    scenario_refs: set[str] | None = None,
) -> tuple[list, list]:
    diagnostics, results = _entry_checks(contract, capabilities, scenario_refs), []
    operations_by_id = {item["capabilityRef"]: item for item in operations}
    representations_by_id = {item["id"]: item for item in representations}
    entries = {item["id"]: item for item in contract["entryPoints"]}
    if not contract["journeys"] and capabilities:
        return [{"status": "not_evaluated", "reason": "未提供 HTTP 消费流程"}], diagnostics + [gap("HTTP_FLOW_NOT_EVALUATED", "contract.http-flow", "coverage", "尚未验证消费者流程")]
    for journey in contract["journeys"]:
        if scenario_refs is not None and not set(journey["scenarioRefs"]).issubset(scenario_refs):
            diagnostics.append(error("HTTP_FLOW_SCENARIO", "HTTP 流程必须引用已有 API 场景", journey["id"]))
        prior, rows, seen = {}, [], set()
        for position, step in enumerate(journey["steps"]):
            value, issues = _step(step, journey["actorRoleRef"], operations_by_id, capabilities, representations_by_id, prior, index)
            if "entryPointRef" in step:
                entry = entries.get(step["entryPointRef"])
                if position != 0:
                    issues.append(_issue("HTTP_FLOW_ENTRY", step, "流程首步之后只能通过前序响应的链接或 Location 接续"))
                elif not entry or entry["capabilityRef"] != step["capabilityRef"] or not set(journey["scenarioRefs"]).issubset(entry["scenarioRefs"]):
                    issues.append(_issue("HTTP_FLOW_ENTRY", step, "入口必须匹配能力及场景"))
            elif position == 0:
                issues.append(_issue("HTTP_FLOW_ENTRY", step, "流程首步必须引用已声明入口或通过响应链接接续"))
            if step["id"] in seen:
                issues.append(error("CONTRACT_DUPLICATE", "HTTP 步骤 ID 重复", step["id"]))
            seen.add(step["id"])
            diagnostics.extend(issues)
            row = {"id": step["id"], "capabilityRef": step["capabilityRef"], "expectStatus": step["expectStatus"], "sourceStepRefs": step["sourceStepRefs"], "status": "gap" if issues else "mapped"}
            row.update({key: step[key] for key in ("entryPointRef", "via") if key in step})
            if not issues and value is not None:
                row.update(request=value["request"], expect=value["expect"])
                prior[step["id"]] = value
            rows.append(row)
        results.append({"id": journey["id"], "actorRoleRef": journey["actorRoleRef"], "scenarioRefs": journey["scenarioRefs"], "status": "gap" if any(row["status"] == "gap" for row in rows) else "mapped", "steps": rows})
    return results, diagnostics
