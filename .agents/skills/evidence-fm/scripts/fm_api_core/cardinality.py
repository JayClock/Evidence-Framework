from __future__ import annotations

from typing import Any

from fm_api_core.diagnostics import Diagnostic, error, gap


def validate_cardinality(resource: dict[str, Any], parent: dict[str, Any] | None,
                         design: dict[str, Any], index: Any) -> list[Diagnostic]:
    """Check the number of business children per parent, not English inflection."""
    ref = resource["id"]
    proof = resource.get("cardinality")
    if parent is None:
        if resource["shape"] == "singleton" or proof:
            return [error("CARDINALITY_SCOPE_INVALID", "单例及父子基数须有明确父资源范围", ref)]
        return []
    if not proof:
        return [gap("RESOURCE_CARDINALITY_UNRESOLVED", f"{ref}.cardinality", "business",
                    "父资源下可有多少业务实例尚未明确，不能由路径或类型名推断", ref)]
    maximum = None
    if "relationshipRef" in proof:
        relation = index.relationships.get(proof["relationshipRef"])
        if not relation:
            return [error("FM_REF_NOT_FOUND", "数量关系不存在", ref)]
        endpoints = (relation.get("sourceRef"), relation.get("targetRef"))
        expected = (parent["entityRef"], resource["entityRef"])
        if endpoints == expected:
            maximum = relation.get("targetCardinality", {}).get("max")
        elif endpoints == expected[::-1]:
            maximum = relation.get("sourceCardinality", {}).get("max")
        else:
            return [error("CARDINALITY_SCOPE_INVALID", "数量关系端点不对应当前父子业务对象", ref)]
    else:
        known_sources = {source["id"] for source in design.get("sources", [])}
        if not proof.get("sourceRefs") or not set(proof["sourceRefs"]).issubset(known_sources):
            return [error("SOURCE_REF_NOT_FOUND", "数量说明必须引用实际业务来源", ref)]
        maximum = proof["max"]
    if maximum is None:
        return [gap("RESOURCE_CARDINALITY_UNRESOLVED", f"{ref}.cardinality", "business",
                    "所引用关系未声明父资源下的子实例数量上限", ref)]
    expected = (parent["entityRef"], resource["entityRef"])
    for relation in index.relationships.values():
        endpoints = (relation.get("sourceRef"), relation.get("targetRef"))
        end = "targetCardinality" if endpoints == expected else "sourceCardinality"
        if endpoints not in (expected, expected[::-1]):
            continue
        known_max = relation.get(end, {}).get("max")
        if known_max is not None and known_max != maximum:
            return [error("RESOURCE_CARDINALITY_CONFLICT", "数量依据与已有FM关系冲突，不能选择性忽略", ref)]
    expected_shape = "singleton" if maximum == 1 else "collection"
    if resource["shape"] != expected_shape:
        return [error("RESOURCE_CARDINALITY_CONFLICT", "资源寻址形态与业务数量关系不一致", ref)]
    return []
