"""Account for the entire FM input, not a caller-selected subset of contexts."""

from __future__ import annotations

from .diagnostics import error, gap

RESOURCE_CATEGORIES = {"evidence", "thing", "participant"}


def project_model_coverage(
    design: dict, index, capabilities: list
) -> tuple[list, list]:
    diagnostics, result = [], []
    objects = {
        ref: entity
        for ref, entity in index.entities.items()
        if entity.get("category") in RESOURCE_CATEGORIES
    }
    activities = {}
    for activity in design.get("nonApiActivities", []):
        ref = activity["entityRef"]
        if ref not in objects:
            diagnostics.append(
                error(
                    "FM_REF_NOT_FOUND", "非接口活动须对应整体 FM 中的实际业务对象", ref
                )
            )
        if ref in activities:
            diagnostics.append(
                error("MODEL_HANDLING_CONFLICT", "同一对象的非接口处理重复", ref)
            )
        activities[ref] = activity
    for ref, entity in sorted(objects.items()):
        interfaces = [
            item for item in capabilities if item["effect"]["targetRef"] == ref
        ]
        activity = activities.get(ref)
        handling = "api" if interfaces else activity["handling"] if activity else "gap"
        if interfaces and activity:
            diagnostics.append(
                error(
                    "MODEL_HANDLING_CONFLICT",
                    "对象已有接口，不能同时声明整体由内部或外部处理",
                    ref,
                )
            )
            handling = "gap"
        if activity:
            basis = activity["basis"]
            if not basis.get("reasoning") or not (
                ref in basis.get("fmRefs", []) or basis.get("sourceRefs")
            ):
                diagnostics.append(
                    gap(
                        "MODEL_HANDLING_BASIS",
                        f"{ref}.handling",
                        "business",
                        "内部或外部活动须引用对应 FM 对象或业务来源；不能以技术决定排除接口",
                        ref,
                    )
                )
                handling = "gap"
        if not interfaces and not activity:
            diagnostics.append(
                gap(
                    "MODEL_ENTITY_UNCOVERED",
                    f"{ref}.api",
                    "coverage",
                    "整体 FM 对象尚无接口或有依据的内部／外部处理说明",
                    ref,
                )
            )
        if (
            entity.get("category") == "evidence"
            and interfaces
            and not any(
                item["effect"]["kind"] == "append_evidence" for item in interfaces
            )
        ):
            diagnostics.append(
                gap(
                    "MODEL_EVIDENCE_WRITE_MISSING",
                    f"{ref}.formation",
                    "coverage",
                    "仅有读取不能覆盖凭证形成能力",
                    ref,
                )
            )
            handling = "gap"
        result.append(
            {
                "entityRef": ref,
                "contextRef": entity.get("contextRef"),
                "handling": handling,
                "capabilityRefs": sorted(item["id"] for item in interfaces),
                "basis": activity["basis"] if activity else None,
            }
        )
    return result, diagnostics
