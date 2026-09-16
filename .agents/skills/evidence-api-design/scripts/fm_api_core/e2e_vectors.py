"""Portable synthetic E2E vectors derived from validated HTTP contracts."""

from __future__ import annotations

import re
from typing import Any

_PATH_PARAMETER = re.compile(r"\{([^{}]+)\}")


def _example_parameters(
    capability: dict[str, Any], role: str, representations: list[dict[str, Any]]
) -> dict[str, Any]:
    matches = [
        item
        for item in representations
        if item["resourceRef"] == capability["resourceRef"]
        and item["view"] == capability["view"]
        and role in item["actorRoleRefs"]
    ]
    if not matches:
        matches = [
            item
            for item in representations
            if item["resourceRef"] == capability["resourceRef"]
            and role in item["actorRoleRefs"]
        ]
    parameters: dict[str, Any] = {}
    for item in matches:
        parameters.update(item.get("exampleParameters", {}))
    return {
        name: parameters[name]
        for name in _PATH_PARAMETER.findall(capability["uri"])
        if name in parameters
    }


def _response_expectation(
    operation: dict[str, Any], status: int, representations: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    response = next(item for item in operation["responses"] if item["status"] == status)
    expectation: dict[str, Any] = {
        "status": status,
        "headers": response["headers"],
    }
    representation_ref = response.get("representationRef")
    if representation_ref:
        expectation["representationRef"] = representation_ref
        expectation["body"] = representations[representation_ref]["example"]
    return expectation


def build_vectors(projection: dict[str, Any]) -> dict[str, Any]:
    """Build deterministic, implementation-neutral vectors without claiming execution."""
    http = projection["http"]
    capabilities = {item["id"]: item for item in projection["capabilities"]}
    operations = {item["capabilityRef"]: item for item in http["operations"]}
    representations = {item["id"]: item for item in http["representations"]}
    vectors = []
    for journey in http["journeys"]:
        source_scenarios: set[str] = set()
        steps = []
        for index, journey_step in enumerate(journey["steps"], start=1):
            capability = capabilities[journey_step["capabilityRef"]]
            operation = operations[journey_step["capabilityRef"]]
            source_scenarios.update(capability["scenarioRefs"])
            request: dict[str, Any] = {
                "method": capability["method"],
                "uriTemplate": capability["uri"],
                "pathParameters": _example_parameters(
                    capability, journey["actorRoleRef"], http["representations"]
                ),
                "headers": {},
            }
            if operation["request"]["example"]:
                request["mediaType"] = operation["request"]["mediaType"]
                request["body"] = operation["request"]["example"]
            if operation["idempotency"]["mode"] == "key":
                request["headers"][operation["idempotency"]["header"]] = (
                    f"e2e-{journey['id']}-{index}"
                )
            steps.append(
                {
                    "id": journey_step["id"],
                    "capabilityRef": capability["id"],
                    "request": request,
                    "expect": _response_expectation(
                        operation, journey_step["expectStatus"], representations
                    ),
                }
            )
        vectors.append(
            {
                "id": f"vector.{journey['id']}",
                "journeyRef": journey["id"],
                "actorRoleRef": journey["actorRoleRef"],
                "sourceScenarioRefs": sorted(source_scenarios),
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
            }
        )
    return {
        "schemaVersion": "1.0",
        "apiId": projection["apiId"],
        "dataClassification": "synthetic",
        "runtimeValidated": False,
        "vectors": vectors,
    }
