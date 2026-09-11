"""Resource examples and typed, role-scoped hypermedia bindings."""

from __future__ import annotations

import copy
import importlib
import re
from urllib.parse import quote, urlencode

from .diagnostics import error, gap

validate_payload = importlib.import_module(
    "fm_api_core.contract_payloads"
).validate_payload


def parameters(uri: str) -> set[str]:
    return set(re.findall(r"\{([^{}]+)\}", uri))


def expand(uri: str, values: dict) -> str:
    for name in sorted(parameters(uri)):
        uri = uri.replace("{" + name + "}", quote(str(values[name]), safe=""))
    return uri


def matches_uri(template: str, value: str) -> bool:
    expression = re.escape(template)
    for name in parameters(template):
        expression = expression.replace(re.escape("{" + name + "}"), r"[^/?#]+")
    return bool(re.fullmatch(expression, value))


def bind_link(link: dict, capability: dict, body: dict, path: dict) -> dict | None:
    values = {}
    for parameter, source in link["parameterBindings"].items():
        pool = path if source["kind"] == "path" else body
        value = pool.get(source["name"])
        if not isinstance(value, (str, int)) or isinstance(value, bool):
            return None
        values[parameter] = value
    if set(values) != parameters(capability["uri"]):
        return None
    return values


def _cache_checks(representation: dict) -> list:
    cache = representation["cache"]
    diagnostics = []
    target = representation["id"]
    if cache["mode"] == "public" and not cache.get("publicInvariantReason"):
        diagnostics.append(
            gap(
                "CONTRACT_CACHE_SCOPE",
                f"{target}.cache-scope",
                "design",
                "共享缓存需要明确说明表示与身份、角色及动态动作无关的依据",
                target,
            )
        )
    if cache["mode"] == "public" and any(
        link.get("whenRuleRef") for link in representation["links"]
    ):
        diagnostics.append(
            gap(
                "CONTRACT_CACHE_DYNAMIC",
                f"{target}.dynamic-cache",
                "design",
                "动态动作不能仅凭凭证不可变而声明公共缓存",
                target,
            )
        )
    return diagnostics


def _links(
    representation: dict, capabilities: dict, index, path: dict
) -> tuple[dict, list]:
    result, diagnostics, seen = {}, [], {"self", "next"}
    for link in representation["links"]:
        target = representation["id"]
        if link["rel"] in seen:
            diagnostics.append(
                error("CONTRACT_DUPLICATE", "链接 rel 重复或使用保留 self/next", target)
            )
        seen.add(link["rel"])
        capability = capabilities.get(link["capabilityRef"])
        if not capability:
            diagnostics.append(
                error("CONTRACT_LINK_TARGET", "链接不指向当前范围内已选候选", target)
            )
            continue
        if set(representation["actorRoleRefs"]) != {capability["actorRoleRef"]}:
            diagnostics.append(
                error(
                    "CONTRACT_LINK_ROLE",
                    "该表示中的链接不能暴露给其他角色；请拆分角色表示",
                    target,
                )
            )
        if (link["kind"] == "navigation") != (capability["method"] == "GET"):
            diagnostics.append(
                error(
                    "CONTRACT_LINK_METHOD",
                    "导航必须引用 GET，写动作必须显式声明 action",
                    target,
                )
            )
        if (
            link.get("whenRuleRef")
            and index.rules.get(link["whenRuleRef"], {}).get("resultType") != "bool"
        ):
            diagnostics.append(
                error("CONTRACT_FM_REF", "动作条件须引用已建模的 bool Rule", target)
            )
        values = bind_link(link, capability, representation["example"], path)
        if values is None:
            diagnostics.append(
                error(
                    "CONTRACT_LINK_PARAMETER",
                    "目标参数必须由已声明路径或表示字段闭合提供",
                    target,
                )
            )
            continue
        result[link["rel"]] = {"href": expand(capability["uri"], values)}
    return result, diagnostics


def _embed(representations: list) -> list:
    diagnostics = []
    by_id = {item["id"]: item for item in representations}
    for parent in representations:
        if not parent.get("embedded"):
            continue
        if (
            parent["view"] != "collection"
            or parent["mediaType"] != "application/hal+json"
        ):
            diagnostics.append(
                error(
                    "CONTRACT_EMBEDDED",
                    "嵌入成员只支持 HAL 集合表示，不允许循环嵌入",
                    parent["id"],
                )
            )
            continue
        embedded = {}
        for group in parent["embedded"]:
            if group["rel"] in embedded:
                diagnostics.append(
                    error("CONTRACT_EMBEDDED", "嵌入关系名称重复", parent["id"])
                )
            members = []
            for reference in group["representationRefs"]:
                child = by_id.get(reference)
                if (
                    not child
                    or child["view"] != "item"
                    or child["resourceRef"] != parent["resourceRef"]
                    or child["mediaType"] != "application/hal+json"
                ):
                    diagnostics.append(
                        error(
                            "CONTRACT_EMBEDDED",
                            "成员须引用同一资源的 HAL 实例表示",
                            parent["id"],
                        )
                    )
                    continue
                if not set(parent["actorRoleRefs"]).issubset(
                    child["actorRoleRefs"]
                ) or any(
                    child["exampleParameters"].get(key) != value
                    for key, value in parent["exampleParameters"].items()
                ):
                    diagnostics.append(
                        error(
                            "CONTRACT_EMBEDDED",
                            "成员的角色或父实例范围与集合不一致",
                            parent["id"],
                        )
                    )
                    continue
                members.append(copy.deepcopy(child["example"]))
            embedded[group["rel"]] = members
        parent["example"]["_embedded"] = embedded
    return diagnostics


def build_representations(contract: dict, projection: dict, index) -> tuple[list, list]:
    capabilities = {
        item["id"]: item
        for item in projection["capabilities"]
        if item["id"] in contract["scopeCapabilityRefs"]
    }
    resources = {item["id"]: item for item in projection["resources"]}
    result, diagnostics = [], []
    for representation in sorted(
        contract["representations"], key=lambda item: item["id"]
    ):
        target = representation["id"]
        diagnostics.extend(validate_payload(representation, index, target))
        diagnostics.extend(_cache_checks(representation))
        resource = resources.get(representation["resourceRef"], {})
        uri = resource.get("uris", {}).get(representation["view"])
        path = representation["exampleParameters"]
        if uri is None or parameters(uri) != set(path):
            diagnostics.append(
                error("CONTRACT_RESOURCE_VIEW", "资源视图或样例路径参数不匹配", target)
            )
            continue
        for role in representation["actorRoleRefs"]:
            if not any(
                item["actorRoleRef"] == role and item["resourceRef"] == resource["id"]
                for item in capabilities.values()
            ):
                diagnostics.append(
                    error(
                        "CONTRACT_REPRESENTATION_ROLE",
                        "表示角色不在该资源的已选能力范围内",
                        target,
                    )
                )
        links, link_diagnostics = _links(representation, capabilities, index, path)
        diagnostics.extend(link_diagnostics)
        links["self"] = {"href": expand(uri, path)}
        pagination = representation.get("pagination")
        if pagination:
            if representation["view"] != "collection" or not all(
                any(
                    item["resourceRef"] == resource["id"]
                    and item["view"] == "collection"
                    and item["method"] == "GET"
                    and item["actorRoleRef"] == role
                    for item in capabilities.values()
                )
                for role in representation["actorRoleRefs"]
            ):
                diagnostics.append(
                    error(
                        "CONTRACT_PAGINATION",
                        "分页仅用于具有对应角色集合读取能力的资源",
                        target,
                    )
                )
            links["next"] = {
                "href": expand(uri, path)
                + "?"
                + urlencode({pagination["parameter"]: pagination["nextExample"]})
            }
        body = copy.deepcopy(representation["example"])
        if representation["mediaType"] == "application/hal+json":
            body["_links"] = links
        elif representation["links"] or pagination:
            diagnostics.append(
                gap(
                    "CONTRACT_MEDIA_LINKS",
                    f"{target}.media-links",
                    "design",
                    "普通 JSON 尚无约定的链接载体；选择 HAL 或补充明确媒体规范",
                    target,
                )
            )
        result.append(
            {
                **representation,
                "uri": uri,
                "example": body,
                "availability": "not_evaluated",
            }
        )
    diagnostics.extend(_embed(result))
    return result, diagnostics
