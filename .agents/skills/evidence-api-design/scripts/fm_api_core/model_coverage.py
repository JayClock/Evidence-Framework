"""Account for the entire FM input, not a caller-selected subset of contexts."""

from __future__ import annotations

from .diagnostics import error, gap
from .fm_adapter import party_roles_played_by_participants

RESOURCE_CATEGORIES = {"evidence", "thing", "participant"}


def _has_write_interface(interfaces: list[dict]) -> bool:
    return any(item["effect"]["kind"] == "append_evidence" for item in interfaces)


def _formation_role_without_participant_player(
    entity: dict, index, played_party_roles: set[str]
) -> bool:
    role_ref = entity.get("responsibleRoleRef")
    role = index.entities.get(role_ref or "")
    return bool(
        role_ref
        and role
        and role.get("category") == "role"
        and role.get("kind") == "party"
        and role_ref not in played_party_roles
    )


def project_model_coverage(
    design: dict, index, capabilities: list
) -> tuple[list, list]:
    diagnostics, result = [], []
    played_party_roles = party_roles_played_by_participants(index)
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
        write_interface_exists = _has_write_interface(interfaces)
        activity = activities.get(ref)
        formation_role_unplayed = _formation_role_without_participant_player(
            entity, index, played_party_roles
        )
        non_api_formation_with_api_reads = bool(
            activity
            and interfaces
            and entity.get("category") == "evidence"
            and not write_interface_exists
            and formation_role_unplayed
        )
        handling = "api" if interfaces else activity["handling"] if activity else "gap"
        if interfaces and activity and not non_api_formation_with_api_reads:
            diagnostics.append(
                error(
                    "MODEL_HANDLING_CONFLICT",
                    "对象已有写入接口，或非接口活动没有限定为未扮演责任角色的凭证形成，不能同时声明整体内部／外部处理",
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
            and not write_interface_exists
            and not non_api_formation_with_api_reads
        ):
            diagnostics.append(
                gap(
                    "MODEL_EVIDENCE_WRITE_MISSING",
                    f"{ref}.formation",
                    "coverage",
                    "仅有读取不能覆盖凭证形成能力；除非其责任 Party Role 未被 participant.party 扮演且已声明非接口形成",
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
