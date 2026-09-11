from __future__ import annotations

from typing import Any

from fm_api_core.diagnostics import Diagnostic, error, gap


def project_coverage(
    design: dict[str, Any], index: Any, capabilities: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    scenario_design = {item["id"]: item for item in design.get("scenarios", [])}
    capability_ids = {item["id"] for item in capabilities}
    coverage: list[dict[str, Any]] = []
    if not design.get("journeys"):
        return [
            {"status": "not_evaluated", "reason": "未选择需要回映的流程"}
        ], diagnostics
    for journey in sorted(design["journeys"], key=lambda item: item["id"]):
        scenario = scenario_design.get(journey["scenarioRef"])
        if scenario is None:
            diagnostics.append(
                error(
                    "SCENARIO_REF_NOT_FOUND", "流程引用的 API 场景不存在", journey["id"]
                )
            )
            continue
        source = index.scenarios.get(scenario["sourceScenarioRef"])
        if source is None:
            diagnostics.append(
                error(
                    "SCENARIO_REF_NOT_FOUND", "流程引用的 FM 场景不存在", journey["id"]
                )
            )
            continue
        by_sequence = {
            item["sourceStepSequence"]: item for item in journey.get("steps", [])
        }
        rows: list[dict[str, Any]] = []
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
                        "FM 场景步骤尚未回映到 API 能力或非 API 活动",
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
            mapping = mapped["mapping"]
            if (
                mapping == "capability"
                and mapped.get("capabilityRef") not in capability_ids
            ):
                diagnostics.append(
                    gap(
                        "SCENARIO_UNCOVERED",
                        f"{mapped['id']}.capability",
                        "coverage",
                        "流程步骤引用的能力不是有效候选",
                        mapped["id"],
                        (mapped.get("capabilityRef", ""),),
                    )
                )
                status = "gap"
            elif mapping == "gap":
                diagnostics.append(
                    gap(
                        "SCENARIO_UNCOVERED",
                        f"{mapped['id']}.mapping",
                        "coverage",
                        "流程步骤被明确保留为缺口",
                        mapped["id"],
                    )
                )
                status = "gap"
            else:
                status = "mapped"
            rows.append(
                {
                    "sequence": sequence,
                    "status": status,
                    "mapping": mapping,
                    "capabilityRef": mapped.get("capabilityRef"),
                    "actingRoleRef": source_step.get("actingRoleRef"),
                }
            )
        extra = sorted(
            set(by_sequence) - {item["sequence"] for item in source.get("steps", [])}
        )
        for sequence in extra:
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
                "sourceScenarioRef": scenario["sourceScenarioRef"],
                "status": "gap"
                if any(item["status"] == "gap" for item in rows)
                else "mapped",
                "steps": rows,
            }
        )
    return coverage, diagnostics
