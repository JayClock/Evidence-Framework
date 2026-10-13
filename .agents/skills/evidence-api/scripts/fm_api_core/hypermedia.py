from __future__ import annotations

import re
from typing import Any

from fm_api_core.diagnostics import Diagnostic, error, gap


def validate_representations(
    design: dict[str, Any],
    index: Any,
    resources: list[dict[str, Any]],
    capabilities: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    resources_by_id = {item["id"]: item for item in resources}
    capabilities_by_id = {item["id"]: item for item in capabilities}
    interface_keys = {
        (item["resourceRef"], item["view"], item["method"], item["actorRoleRef"])
        for item in capabilities
    }
    result: list[dict[str, Any]] = []
    for representation in sorted(
        design.get("representations", []), key=lambda item: item["id"]
    ):
        resource = resources_by_id.get(representation["resourceRef"])
        if resource is None:
            diagnostics.append(
                error(
                    "DESIGN_REF_NOT_FOUND", "表示引用的资源不存在", representation["id"]
                )
            )
            continue
        for field in representation.get("fields", []):
            try:
                entity_ref, attribute_name = field["fmAttributeRef"].split("#", 1)
            except ValueError:
                diagnostics.append(
                    error(
                        "FM_REF_NOT_FOUND",
                        f"字段来源格式无效: {field['fmAttributeRef']}",
                        representation["id"],
                    )
                )
                continue
            entity = index.entities.get(entity_ref)
            if not entity or not any(
                item.get("name") == attribute_name
                for item in entity.get("attributes", [])
            ):
                diagnostics.append(
                    error(
                        "FM_REF_NOT_FOUND",
                        f"表示字段来源不存在: {field['fmAttributeRef']}",
                        representation["id"],
                    )
                )
        source_uri = resource["uris"].get(representation["view"])
        if source_uri is None:
            diagnostics.append(
                error(
                    "RESOURCE_VIEW_INVALID",
                    "表示视图不属于该业务资源",
                    representation["id"],
                )
            )
            continue
        available_parameters = set(re.findall(r"\{([^{}]+)\}", source_uri))
        for link in representation.get("links", []):
            target = resources_by_id.get(link["targetResourceRef"])
            if target is None:
                diagnostics.append(
                    error(
                        "LINK_TARGET_UNRESOLVED",
                        "链接目标资源不存在",
                        representation["id"],
                        related=(link["targetResourceRef"],),
                    )
                )
                continue
            target_uri = target["uris"].get(link["targetView"])
            if target_uri is None:
                diagnostics.append(
                    error(
                        "RESOURCE_VIEW_INVALID",
                        "链接目标视图不属于该业务资源",
                        representation["id"],
                    )
                )
                continue
            required_parameters = set(re.findall(r"\{([^{}]+)\}", target_uri))
            bindings = {
                item["parameter"]: item["fromParameter"]
                for item in link.get("parameterBindings", [])
            }
            if set(bindings) != required_parameters or not set(
                bindings.values()
            ).issubset(available_parameters):
                diagnostics.append(
                    error(
                        "LINK_PARAMETER_UNRESOLVED",
                        "链接参数未与当前表示和目标 URI 闭合",
                        representation["id"],
                        related=(link["targetResourceRef"],),
                    )
                )
            capability_ref = link.get("capabilityRef")
            if capability_ref:
                capability = capabilities_by_id.get(capability_ref)
                if (
                    not capability
                    or capability["resourceRef"] != link["targetResourceRef"]
                    or capability["view"] != link["targetView"]
                ):
                    diagnostics.append(
                        error(
                            "LINK_CAPABILITY_UNRESOLVED",
                            "链接引用的接口与目标不匹配",
                            representation["id"],
                            related=(capability_ref,),
                        )
                    )
                elif (
                    link.get("visibleToRoleRefs")
                    and capability["actorRoleRef"] not in link["visibleToRoleRefs"]
                ):
                    diagnostics.append(
                        error(
                            "LINK_ROLE_LEAK",
                            "链接可见角色与能力调用角色不一致",
                            representation["id"],
                            related=(capability_ref,),
                        )
                    )
            else:
                visible_roles = link.get("visibleToRoleRefs", [])
                if not visible_roles or not all(
                    (link["targetResourceRef"], link["targetView"], "GET", role_ref)
                    in interface_keys
                    for role_ref in visible_roles
                ):
                    diagnostics.append(
                        gap(
                            "LINK_GET_MISSING",
                            f"{representation['id']}.{link['rel']}.get",
                            "design",
                            "导航链接缺少对应的 GET 接口，不得据此虚构读取权限",
                            representation["id"],
                            (link["targetResourceRef"],),
                        )
                    )
        result.append({**representation, "uri": source_uri})
    return result, diagnostics
