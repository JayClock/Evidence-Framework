from __future__ import annotations

import re
from itertools import product
from typing import Any

from fm_api_core.diagnostics import Diagnostic, error, gap

_METHODS = ("DELETE", "GET", "PATCH", "POST", "PUT")
_VIEWS = ("collection", "item")


def _has_basis(item: dict[str, Any]) -> bool:
    basis = item.get("basis", {})
    return bool(
        item.get("scenarioRefs")
        and basis.get("reasoning")
        and (basis.get("fmRefs") or basis.get("sourceRefs"))
    )


def project_capabilities(
    design: dict[str, Any], index: Any, resources: list[dict[str, Any]]
) -> tuple[
    list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[Diagnostic]
]:
    diagnostics: list[Diagnostic] = []
    resources_by_id = {item["id"]: item for item in resources}
    bindings = {item["id"]: item for item in design.get("bindings", [])}
    scenario_design = {item["id"]: item for item in design.get("scenarios", [])}
    decisions = {item["id"] for item in design.get("decisions", [])}
    selected_contexts = set(design.get("scope", {}).get("contextRefs", []))
    for context_ref in sorted(selected_contexts):
        entity = index.entities.get(context_ref)
        if not entity or entity.get("category") != "context":
            diagnostics.append(
                error(
                    "FM_REF_NOT_FOUND",
                    f"范围 Context 不存在: {context_ref}",
                    context_ref,
                )
            )
    roles = sorted(
        entity["id"]
        for entity in index.entities.values()
        if entity.get("category") == "role"
        and (
            entity.get("contextRef") in selected_contexts
            or index.fulfillment_parent.get(entity.get("contextRef", ""))
            in selected_contexts
        )
    )
    declared: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    projected: list[dict[str, Any]] = []
    rejected_keys: set[tuple[str, str, str, str]] = set()
    unresolved_keys: set[tuple[str, str, str, str]] = set()

    for capability in sorted(
        design.get("capabilities", []), key=lambda item: item["id"]
    ):
        key = (
            capability["actorRoleRef"],
            capability["resourceRef"],
            capability["view"],
            capability["method"],
        )
        declared[key] = capability
        local_errors = False
        role = index.entities.get(capability["actorRoleRef"])
        resource = resources_by_id.get(capability["resourceRef"])
        target = index.entities.get(capability["effect"]["targetRef"])
        if not role or role.get("category") != "role" or role.get("kind") != "party":
            diagnostics.append(
                error(
                    "ACTOR_ROLE_INVALID",
                    "调用者必须是 FM Party Role；Evidence Role 不能作为调用者",
                    capability["id"],
                    related=(capability["actorRoleRef"],),
                )
            )
            local_errors = True
        if resource is None:
            diagnostics.append(
                error(
                    "DESIGN_REF_NOT_FOUND",
                    "能力引用的资源不存在",
                    capability["id"],
                    related=(capability["resourceRef"],),
                )
            )
            local_errors = True
        if target is None:
            diagnostics.append(
                error(
                    "FM_REF_NOT_FOUND",
                    "能力效果目标不存在",
                    capability["id"],
                    related=(capability["effect"]["targetRef"],),
                )
            )
            local_errors = True
        scenarios_ok = True
        write_scenario_matches = False
        for scenario_ref in capability.get("scenarioRefs", []):
            scenario = scenario_design.get(scenario_ref)
            source_scenario = (
                index.scenarios.get(scenario.get("sourceScenarioRef"))
                if scenario
                else None
            )
            if source_scenario is None:
                diagnostics.append(
                    error(
                        "SCENARIO_REF_NOT_FOUND",
                        f"场景引用不存在: {scenario_ref}",
                        capability["id"],
                    )
                )
                scenarios_ok = False
                continue
            write_scenario_matches = write_scenario_matches or any(
                step.get("actingRoleRef") == capability["actorRoleRef"]
                and index.instances.get(step.get("issueInstanceRef", ""), {}).get(
                    "entityRef"
                )
                == capability["effect"]["targetRef"]
                for step in source_scenario.get("steps", [])
            )
        for ref in capability.get("basis", {}).get("decisionRefs", []):
            if ref not in decisions:
                diagnostics.append(
                    error(
                        "DESIGN_REF_NOT_FOUND",
                        f"设计决定不存在: {ref}",
                        capability["id"],
                    )
                )
                local_errors = True
        for rule_binding in capability.get("ruleBindings", []):
            if rule_binding["ruleRef"] not in index.rules:
                diagnostics.append(
                    error(
                        "FM_REF_NOT_FOUND",
                        f"Rule 不存在: {rule_binding['ruleRef']}",
                        capability["id"],
                    )
                )
                local_errors = True
        effect_kind = capability["effect"]["kind"]
        method = capability["method"]
        if (method == "GET") != (effect_kind == "read"):
            diagnostics.append(
                error(
                    "HTTP_EFFECT_CONFLICT",
                    "GET 只能读取，读取效果也必须使用 GET",
                    capability["id"],
                )
            )
            local_errors = True
        if (
            target
            and target.get("category") == "evidence"
            and effect_kind != "read"
            and (method != "POST" or effect_kind != "append_evidence")
        ):
            diagnostics.append(
                error(
                    "EVIDENCE_MUTATION_FORBIDDEN",
                    "Evidence 只能读取或通过 POST 追加，不能覆盖或删除",
                    capability["id"],
                )
            )
            local_errors = True
        unknown_bindings = [
            ref for ref in capability.get("bindingRefs", []) if ref not in bindings
        ]
        for ref in unknown_bindings:
            diagnostics.append(
                error(
                    "DESIGN_REF_NOT_FOUND",
                    f"能力约束不存在: {ref}",
                    capability["id"],
                )
            )
            local_errors = True
        resource_scope: set[str] = set()
        cursor = resource
        while cursor is not None:
            resource_scope.add(cursor["id"])
            cursor = resources_by_id.get(cursor.get("parentRef", ""))
        actor_binding = any(
            bindings.get(ref, {}).get("kind") == "caller_role"
            and bindings[ref].get("roleRef") == capability["actorRoleRef"]
            and bindings[ref].get("scopeResourceRef") in resource_scope
            for ref in capability.get("bindingRefs", [])
        )
        if not actor_binding:
            diagnostics.append(
                gap(
                    "ACTOR_SCOPE_UNRESOLVED",
                    f"{capability['id']}.actor-scope",
                    "business",
                    "调用角色缺少资源实例范围约束",
                    capability["id"],
                    (capability["actorRoleRef"],),
                )
            )
            unresolved_keys.add(key)
        if (
            resource
            and resource.get("parentBindingRef")
            and resource["parentBindingRef"] not in capability.get("bindingRefs", [])
        ):
            diagnostics.append(
                gap(
                    "URI_BINDING_MISSING",
                    f"{capability['id']}.parent-binding",
                    "design",
                    "能力未引用嵌套资源所需的父子实例约束",
                    capability["id"],
                    (resource["parentBindingRef"],),
                )
            )
            unresolved_keys.add(key)
        if resource and target and target["id"] != resource["entityRef"]:
            diagnostics.append(
                error(
                    "CAPABILITY_TARGET_MISMATCH",
                    "能力效果目标必须是该资源表示的 FM 对象",
                    capability["id"],
                )
            )
            local_errors = True
        scenario_semantics_ok = effect_kind == "read" or write_scenario_matches
        if not _has_basis(capability) or not scenarios_ok or not scenario_semantics_ok:
            diagnostics.append(
                gap(
                    "CAPABILITY_BASIS_UNRESOLVED",
                    f"{capability['id']}.basis",
                    "business",
                    "能力缺少可解析场景或业务依据",
                    capability["id"],
                )
            )
            unresolved_keys.add(key)
        if local_errors or resource is None or role is None:
            rejected_keys.add(key)
            continue
        if key in unresolved_keys:
            continue
        uri = (
            resource["collectionUri"]
            if capability["view"] == "collection"
            else resource["itemUri"]
        )
        projected.append(
            {
                **capability,
                "roleLabel": role.get("label", role["id"]),
                "uri": uri,
                "status": "candidate",
            }
        )

    exploration: list[dict[str, Any]] = []
    for role_ref, resource_id, view, method in product(
        roles, sorted(resources_by_id), _VIEWS, _METHODS
    ):
        key = (role_ref, resource_id, view, method)
        state = (
            "rejected"
            if key in rejected_keys
            else "unresolved"
            if key in unresolved_keys
            else "candidate"
            if key in declared
            else "unselected"
        )
        exploration.append(
            {
                "actorRoleRef": role_ref,
                "resourceRef": resource_id,
                "view": view,
                "method": method,
                "status": state,
                "capabilityRef": declared.get(key, {}).get("id"),
            }
        )

    operations: list[dict[str, Any]] = []
    by_operation: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    by_route: dict[tuple[str, str], list[tuple[str, str, str]]] = {}
    for item in projected:
        operation_key = (item["resourceRef"], item["view"], item["method"])
        by_operation.setdefault(operation_key, []).append(item)
        normalized_uri = re.sub(r"\{[^{}]+\}", "{}", item["uri"])
        by_route.setdefault((normalized_uri, item["method"]), []).append(operation_key)
    for route_key, keys in by_route.items():
        distinct = sorted(set(keys))
        if len(distinct) > 1:
            diagnostics.append(
                error(
                    "OPERATION_CONFLICT",
                    f"参数归一化后路由冲突: {route_key[1]} {route_key[0]}",
                    related=tuple(value[0] for value in distinct),
                )
            )
    for key in sorted(by_operation):
        variants = sorted(
            by_operation[key], key=lambda item: (item["actorRoleRef"], item["id"])
        )
        effect_signatures = {
            (item["effect"]["kind"], item["effect"]["targetRef"]) for item in variants
        }
        if len(effect_signatures) > 1:
            diagnostics.append(
                gap(
                    "OPERATION_COMPATIBILITY_UNRESOLVED",
                    f"operation.{key[0]}.{key[1]}.{key[2].lower()}.compatibility",
                    "design",
                    "共享 HTTP 路由的效果变体兼容性尚未证明",
                    related=tuple(item["id"] for item in variants),
                )
            )
        operations.append(
            {
                "id": f"operation.{key[0].removeprefix('resource.')}.{key[1]}.{key[2].lower()}",
                "resourceRef": key[0],
                "view": key[1],
                "method": key[2],
                "uri": variants[0]["uri"],
                "capabilityRefs": [item["id"] for item in variants],
                "actorRoleRefs": sorted({item["actorRoleRef"] for item in variants}),
                "effects": [
                    {"kind": kind, "targetRef": target}
                    for kind, target in sorted(effect_signatures)
                ],
            }
        )
    return projected, exploration, operations, diagnostics
