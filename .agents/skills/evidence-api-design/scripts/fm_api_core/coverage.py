from __future__ import annotations

from typing import Any

from fm_api_core.diagnostics import Diagnostic, error, gap


def _step_status(
    mapped: dict,
    source_step: dict,
    source_ref: str,
    design: dict,
    index: Any,
    capabilities: dict,
) -> tuple[str, list]:
    diagnostics = []
    mapping = mapped["mapping"]
    entity_ref = index.instances.get(source_step.get("issueInstanceRef", ""), {}).get(
        "entityRef"
    )
    if mapping == "capability":
        capability = capabilities.get(mapped.get("capabilityRef"))
        scenarios = {
            item["id"]: item["sourceScenarioRef"]
            for item in design.get("scenarios", [])
        }
        if not capability:
            diagnostics.append(
                gap(
                    "SCENARIO_UNCOVERED",
                    f"{mapped['id']}.capability",
                    "coverage",
                    "流程步骤引用的接口不存在或无效",
                    mapped["id"],
                )
            )
        elif (
            capability["actorRoleRef"] != source_step.get("actingRoleRef")
            or capability["effect"]
            != {"kind": "append_evidence", "targetRef": entity_ref}
            or source_ref
            not in {scenarios.get(ref) for ref in capability["scenarioRefs"]}
        ):
            diagnostics.append(
                error(
                    "SCENARIO_CAPABILITY_MISMATCH",
                    "接口角色、凭证效果或场景依据与 FM 步骤不一致",
                    mapped["id"],
                )
            )
    elif mapping in {"internal", "external"}:
        handling = next(
            (
                item
                for item in design.get("nonApiActivities", [])
                if item["entityRef"] == entity_ref
            ),
            None,
        )
        if not handling or handling["handling"] != mapping:
            diagnostics.append(
                gap(
                    "SCENARIO_HANDLING_MISMATCH",
                    f"{mapped['id']}.handling",
                    "coverage",
                    "非接口步骤必须与整体模型的内部／外部活动说明一致",
                    mapped["id"],
                )
            )
    else:
        diagnostics.append(
            gap(
                "SCENARIO_UNCOVERED",
                f"{mapped['id']}.mapping",
                "coverage",
                "流程步骤尚未映射",
                mapped["id"],
            )
        )
    return ("gap" if diagnostics else "mapped"), diagnostics


def project_coverage(
    design: dict[str, Any], index: Any, capabilities: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    scenario_design = {item["id"]: item for item in design.get("scenarios", [])}
    capability_map = {item["id"]: item for item in capabilities}
    coverage: list[dict[str, Any]] = []
    mapped_scenarios = set()
    for scenario in scenario_design.values():
        if scenario["sourceScenarioRef"] not in index.scenarios:
            diagnostics.append(
                error(
                    "SCENARIO_REF_NOT_FOUND",
                    "API 场景引用的 FM 场景不存在",
                    scenario["id"],
                )
            )
    for journey in sorted(design.get("journeys", []), key=lambda item: item["id"]):
        scenario = scenario_design.get(journey["scenarioRef"])
        source = (
            index.scenarios.get(scenario["sourceScenarioRef"]) if scenario else None
        )
        if source is None or scenario is None:
            diagnostics.append(
                error("SCENARIO_REF_NOT_FOUND", "流程引用的场景不存在", journey["id"])
            )
            continue
        source_ref = scenario["sourceScenarioRef"]
        mapped_scenarios.add(source_ref)
        by_sequence = {}
        for step in journey["steps"]:
            sequence = step["sourceStepSequence"]
            if sequence in by_sequence:
                diagnostics.append(
                    error(
                        "SCENARIO_STEP_DUPLICATE",
                        "同一流程重复映射 FM 步骤",
                        step["id"],
                    )
                )
            by_sequence[sequence] = step
        rows = []
        for source_step in sorted(
            source.get("steps", []), key=lambda item: item["sequence"]
        ):
            sequence = source_step["sequence"]
            mapped = by_sequence.get(sequence)
            if mapped is None:
                diagnostics.append(
                    gap(
                        "SCENARIO_UNCOVERED",
                        f"{journey['id']}.step-{sequence}",
                        "coverage",
                        "FM 场景步骤未映射",
                        journey["id"],
                    )
                )
                rows.append(
                    {
                        "sequence": sequence,
                        "status": "gap",
                        "actingRoleRef": source_step.get("actingRoleRef"),
                    }
                )
                continue
            status, issues = _step_status(
                mapped, source_step, source_ref, design, index, capability_map
            )
            diagnostics.extend(issues)
            rows.append(
                {
                    "sequence": sequence,
                    "status": status,
                    "mapping": mapped["mapping"],
                    "capabilityRef": mapped.get("capabilityRef"),
                    "actingRoleRef": source_step.get("actingRoleRef"),
                }
            )
        for sequence in sorted(
            set(by_sequence) - {item["sequence"] for item in source.get("steps", [])}
        ):
            diagnostics.append(
                error(
                    "SCENARIO_STEP_NOT_FOUND",
                    f"FM 场景中不存在步骤 {sequence}",
                    journey["id"],
                )
            )
        coverage.append(
            {
                "journeyId": journey["id"],
                "scenarioRef": journey["scenarioRef"],
                "sourceScenarioRef": source_ref,
                "status": "gap"
                if any(item["status"] == "gap" for item in rows)
                else "mapped",
                "steps": rows,
            }
        )
    for ref in sorted(set(index.scenarios) - mapped_scenarios):
        diagnostics.append(
            gap(
                "SCENARIO_UNCOVERED",
                f"{ref}.journey",
                "coverage",
                "整体 FM 场景未回映到接口或非接口活动",
                ref,
            )
        )
        coverage.append({"sourceScenarioRef": ref, "status": "gap", "steps": []})
    return coverage, diagnostics
