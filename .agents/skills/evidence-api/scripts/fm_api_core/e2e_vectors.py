"""Portable vectors derived from the already-resolved HTTP consumer journeys."""
from __future__ import annotations

from typing import Any


def build_vectors(projection: dict[str, Any]) -> dict[str, Any]:
    http = projection["http"]
    vectors = []
    for journey in http["journeys"]:
        steps = []
        source_scenarios = sorted(journey.get("scenarioRefs", []))
        for row in journey["steps"]:
            if row["status"] != "mapped":
                continue
            steps.append({
                "id": row["id"],
                "capabilityRef": row["capabilityRef"],
                "request": row["request"],
                "expect": row["expect"],
                "sourceStepRefs": row["sourceStepRefs"],
            })
        vectors.append({
            "id": f"vector.{journey['id']}",
            "journeyRef": journey["id"],
            "actorRoleRef": journey["actorRoleRef"],
            "sourceScenarioRefs": source_scenarios,
            "setup": [
                {
                    "kind": "actor",
                    "provisioning": "unresolved",
                    "reason": "调用者身份、认证凭据与代表权限须由运行环境提供，API 设计不虚构其方案。",
                },
                {
                    "kind": "prerequisites",
                    "provisioning": "unresolved",
                    "reason": "仅准备无法通过本向量公开步骤形成的前置事实；装载方式由实现与测试环境决定。",
                },
            ],
            "steps": steps,
        })
    return {
        "schemaVersion": "2.0",
        "apiId": projection["apiId"],
        "dataClassification": "synthetic",
        "runtimeValidated": False,
        "vectors": vectors,
    }
