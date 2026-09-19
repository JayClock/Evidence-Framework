"""Scenario-level consumption coverage, separate from FM business-step mapping."""
from __future__ import annotations

from .diagnostics import error, gap


def check_consumption(projection: dict, journeys: list) -> tuple[list, list]:
    diagnostics, rows = [], []
    business_steps = {}
    scenarios = {item.get("scenarioRef") for item in projection["coverage"]}
    capabilities = {item["id"]: item for item in projection["capabilities"]}
    for journey in journeys:
        if journey.get("status") == "not_evaluated":
            continue
        declared = set(journey.get("scenarioRefs", []))
        if not declared or not declared.issubset(scenarios):
            diagnostics.append(error("HTTP_FLOW_SCENARIO", "HTTP 流程必须引用已有 API 场景", journey["id"]))
    if not any(step.get("sourceStepRefs") for journey in journeys for step in journey.get("steps", [])):
        return rows, diagnostics
    for scenario in projection["coverage"]:
        for step in scenario["steps"]:
            reference = step.get("sourceStepRef")
            if reference:
                if reference in business_steps:
                    diagnostics.append(error("HTTP_SOURCE_STEP_DUPLICATE", "业务步骤 ID 必须全局唯一", reference))
                business_steps[reference] = (scenario["scenarioRef"], step)
    consumed = {}
    for journey in journeys:
        if journey.get("status") == "not_evaluated":
            continue
        declared = set(journey["scenarioRefs"])
        for step in journey["steps"]:
            capability = capabilities.get(step["capabilityRef"], {})
            if not declared.issubset(capability.get("scenarioRefs", [])):
                diagnostics.append(error("HTTP_FLOW_SCENARIO", "步骤能力不支持流程声明的场景", step["id"]))
            per_scenario = set()
            for reference in step["sourceStepRefs"]:
                source = business_steps.get(reference)
                if source is None:
                    diagnostics.append(error("HTTP_FLOW_SOURCE_STEP", "引用的业务步骤不存在", step["id"]))
                    continue
                scenario_ref, business_step = source
                if (
                    scenario_ref not in declared
                    or business_step.get("mapping") != "capability"
                    or business_step.get("capabilityRef") != step["capabilityRef"]
                    or business_step.get("actingRoleRef") != journey["actorRoleRef"]
                ):
                    diagnostics.append(error("HTTP_FLOW_SOURCE_STEP", "HTTP 步骤与业务步骤的场景、角色或能力不匹配", step["id"]))
                    continue
                if scenario_ref in per_scenario:
                    diagnostics.append(error("HTTP_FLOW_OCCURRENCE", "一次请求不能冒充同一场景中的多次业务交互", step["id"]))
                    continue
                per_scenario.add(scenario_ref)
                if step["status"] == "mapped" and 200 <= step["expectStatus"] < 300:
                    consumed.setdefault(reference, []).append({"journeyRef": journey["id"], "stepRef": step["id"]})
    for scenario in projection["coverage"]:
        steps = []
        for business_step in scenario["steps"]:
            reference = business_step.get("sourceStepRef")
            matches = consumed.get(reference, [])
            requires_http = business_step.get("mapping") == "capability"
            status = "mapped" if business_step["status"] == "mapped" and (matches or not requires_http) else "gap"
            if requires_http and not matches:
                diagnostics.append(gap("HTTP_SCENARIO_STEP_UNCOVERED", f"{reference}.consumption", "coverage", "业务步骤没有匹配的成功 HTTP 消费步骤", reference))
            steps.append({"sourceStepRef": reference, "sequence": business_step["sequence"], "mapping": business_step.get("mapping"), "status": status, "httpSteps": matches})
        rows.append({"scenarioRef": scenario.get("scenarioRef"), "sourceScenarioRef": scenario["sourceScenarioRef"], "status": "mapped" if scenario["status"] == "mapped" and all(s["status"] == "mapped" for s in steps) else "gap", "steps": steps})
    return rows, diagnostics



def navigation_graph(representations: list, capabilities: dict) -> list:
    """Derived edges; identity-only self links do not pretend to be GET capabilities."""
    edges = []
    for representation in representations:
        for link in representation["links"]:
            edges.append({"representationRef": representation["id"], "rel": link["rel"], "kind": link["kind"], "capabilityRef": link["capabilityRef"], "whenRuleRef": link.get("whenRuleRef"), "availability": "not_evaluated"})
        reads = sorted(c["id"] for c in capabilities.values() if c["method"] == "GET" and c["resourceRef"] == representation["resourceRef"] and c["view"] == representation["view"] and c["actorRoleRef"] in representation["actorRoleRefs"])
        edges.append({"representationRef": representation["id"], "rel": "self", "kind": "navigation" if reads else "identity", "capabilityRefs": reads, "availability": "not_evaluated"})
    return edges
