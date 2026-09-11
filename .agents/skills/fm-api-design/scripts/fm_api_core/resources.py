from __future__ import annotations

from typing import Any

from fm_api_core.diagnostics import Diagnostic, error, gap


def build_resources(
    design: dict[str, Any], index: Any
) -> tuple[list[dict[str, Any]], list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    configured = {item["id"]: item for item in design.get("resources", [])}
    bindings = {item["id"]: item for item in design.get("bindings", [])}
    result: dict[str, dict[str, Any]] = {}
    visiting: set[str] = set()

    def root_context(entity_value: dict[str, Any] | None) -> str | None:
        if entity_value is None:
            return None
        context_ref = entity_value.get("contextRef")
        context = index.entities.get(context_ref, {})
        if (
            context.get("category") == "context"
            and context.get("kind") == "fulfillment"
        ):
            return context.get("parentContextRef")
        return context_ref

    def visit(resource_id: str) -> dict[str, Any] | None:
        if resource_id in result:
            return result[resource_id]
        resource = configured.get(resource_id)
        if resource is None:
            return None
        if resource_id in visiting:
            diagnostics.append(
                error("RESOURCE_CYCLE", "资源父子图存在循环", resource_id)
            )
            return None
        visiting.add(resource_id)
        entity = index.entities.get(resource["entityRef"])
        if entity is None:
            diagnostics.append(
                error(
                    "FM_REF_NOT_FOUND",
                    f"资源引用不存在: {resource['entityRef']}",
                    resource_id,
                )
            )
        elif entity.get("category") not in {"evidence", "participant"}:
            diagnostics.append(
                error(
                    "RESOURCE_ENTITY_INVALID",
                    "资源只能表示 Evidence 或有来源的 Participant",
                    resource_id,
                    related=(resource["entityRef"],),
                )
            )
        identity = resource["identity"]
        if identity["kind"] == "fm_attribute":
            entity_ref, attribute_name = identity["attributeRef"].split("#", 1)
            attribute_entity = index.entities.get(entity_ref)
            if attribute_entity is None or not any(
                item.get("name") == attribute_name
                for item in attribute_entity.get("attributes", [])
            ):
                diagnostics.append(
                    error(
                        "FM_REF_NOT_FOUND",
                        f"身份属性不存在: {identity['attributeRef']}",
                        resource_id,
                    )
                )
            if entity_ref != resource["entityRef"]:
                diagnostics.append(
                    error(
                        "IDENTITY_ENTITY_MISMATCH",
                        "身份属性必须属于资源表示的 FM 对象",
                        resource_id,
                    )
                )
        else:
            decision = next(
                (
                    item
                    for item in design.get("decisions", [])
                    if item["id"] == identity["decisionRef"]
                ),
                None,
            )
            if decision is None:
                diagnostics.append(
                    error(
                        "DESIGN_REF_NOT_FOUND",
                        f"身份决定不存在: {identity['decisionRef']}",
                        resource_id,
                    )
                )
        parent = None
        parameters: list[str] = []
        if resource.get("parentRef"):
            parent = visit(resource["parentRef"])
            if parent is None:
                diagnostics.append(
                    error(
                        "DESIGN_REF_NOT_FOUND",
                        f"父资源不存在: {resource['parentRef']}",
                        resource_id,
                    )
                )
            else:
                parameters.extend(parent["parameters"])
                parent_entity = index.entities.get(parent["entityRef"])
                child_root = root_context(entity)
                parent_root = root_context(parent_entity)
                if child_root != parent_root:
                    diagnostics.append(
                        error(
                            "RESOURCE_CONTEXT_ROOT_MISMATCH",
                            "不同合同前、合同或领域 Context 必须使用独立 URI 根；跨 Context 关系应使用超媒体链接",
                            resource_id,
                            related=(parent["id"], child_root or "", parent_root or ""),
                        )
                    )
                expected_binding = bindings.get(resource.get("parentBindingRef", ""))
                if (
                    not expected_binding
                    or expected_binding.get("kind") != "parent_child"
                    or expected_binding.get("parentResourceRef") != parent["id"]
                    or expected_binding.get("childResourceRef") != resource_id
                ):
                    diagnostics.append(
                        error(
                            "URI_BINDING_MISSING",
                            "嵌套资源缺少匹配的 parent_child 实例约束",
                            resource_id,
                            related=(parent["id"],),
                        )
                    )
                basis = resource.get("basis", {})
                if not basis.get("sourceRefs") and len(basis.get("fmRefs", [])) < 2:
                    diagnostics.append(
                        gap(
                            "RESOURCE_STRUCTURE_UNRESOLVED",
                            f"{resource_id}.parent-structure",
                            "business",
                            "父子路径的业务实例结构尚无充分依据；路径本身不证明归属",
                            resource_id,
                            (parent["id"],),
                        )
                    )
        parameter = identity["parameter"]
        if parameter in parameters:
            diagnostics.append(
                error(
                    "URI_PARAMETER_DUPLICATE", f"URI 参数重复: {parameter}", resource_id
                )
            )
        parameters.append(parameter)
        collection_uri = (
            (parent["itemUri"] if parent else "") + "/" + resource["segment"]
        )
        item_uri = collection_uri + "/{" + parameter + "}"
        projected = {
            **resource,
            "collectionUri": collection_uri,
            "itemUri": item_uri,
            "parameters": parameters,
        }
        result[resource_id] = projected
        visiting.remove(resource_id)
        return projected

    for key in sorted(configured):
        visit(key)
    return [result[key] for key in sorted(result)], diagnostics
