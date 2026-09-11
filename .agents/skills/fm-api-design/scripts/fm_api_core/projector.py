from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any

from .diagnostics import Diagnostic, error

capabilities_module = importlib.import_module("fm_api_core.capabilities")
coverage_module = importlib.import_module("fm_api_core.coverage")
fm_adapter_module = importlib.import_module("fm_api_core.fm_adapter")
hypermedia_module = importlib.import_module("fm_api_core.hypermedia")
resources_module = importlib.import_module("fm_api_core.resources")
contracts_module = importlib.import_module("fm_api_core.contracts")
FMIndex = Any


def _fm_ref_exists(reference: str, index: FMIndex) -> bool:
    if "#" not in reference:
        return (
            reference in index.entities
            or reference in index.relationships
            or reference in index.rules
        )
    entity_ref, attribute_name = reference.split("#", 1)
    entity = index.entities.get(entity_ref)
    return bool(
        entity
        and any(
            item.get("name") == attribute_name for item in entity.get("attributes", [])
        )
    )


def _validate_references(
    design: dict[str, Any], index: FMIndex, project_root: Path
) -> tuple[dict[str, str], list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    source_ids = {item["id"] for item in design.get("sources", [])}
    decision_ids = {item["id"] for item in design.get("decisions", [])}
    source_digests: dict[str, str] = {}
    root = project_root.resolve()
    for source in design.get("sources", []):
        source_path = (root / source["path"]).resolve()
        try:
            source_path.relative_to(root)
        except ValueError:
            diagnostics.append(
                error(
                    "SOURCE_PATH_OUTSIDE_PROJECT",
                    "业务来源必须位于项目根内",
                    source["id"],
                    str(source_path),
                )
            )
            continue
        if not source_path.is_file():
            diagnostics.append(
                error(
                    "SOURCE_NOT_FOUND",
                    "业务来源文件不存在",
                    source["id"],
                    source["path"],
                )
            )
            continue
        try:
            content = source_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            diagnostics.append(
                error(
                    "SOURCE_NOT_FOUND",
                    f"无法读取业务来源: {exc}",
                    source["id"],
                    source["path"],
                )
            )
            continue
        if source["quote"] not in content:
            diagnostics.append(
                error(
                    "SOURCE_QUOTE_MISMATCH",
                    "逐字摘录与来源内容不匹配",
                    source["id"],
                    source["locator"],
                )
            )
        source_digests[source["path"]] = fm_adapter_module.digest_bytes(
            content.encode("utf-8")
        )
    based_items: list[dict[str, Any]] = []
    for section in (
        "resources",
        "bindings",
        "scenarios",
        "capabilities",
        "representations",
    ):
        based_items.extend(design.get(section, []))
    for journey in design.get("journeys", []):
        based_items.extend(journey.get("steps", []))
    for item in based_items:
        basis = item.get("basis", {})
        for reference in basis.get("fmRefs", []):
            if not _fm_ref_exists(reference, index):
                diagnostics.append(
                    error(
                        "FM_REF_NOT_FOUND",
                        f"FM 依据引用不存在: {reference}",
                        item.get("id"),
                    )
                )
        for reference in basis.get("sourceRefs", []):
            if reference not in source_ids:
                diagnostics.append(
                    error(
                        "SOURCE_REF_NOT_FOUND",
                        f"来源引用不存在: {reference}",
                        item.get("id"),
                    )
                )
        for reference in basis.get("decisionRefs", []):
            if reference not in decision_ids:
                diagnostics.append(
                    error(
                        "DESIGN_REF_NOT_FOUND",
                        f"决定引用不存在: {reference}",
                        item.get("id"),
                    )
                )
    return dict(sorted(source_digests.items())), diagnostics


def _validate_bindings(
    design: dict[str, Any], index: FMIndex, resources: list[dict[str, Any]]
) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    resource_ids = {item["id"] for item in resources}
    for binding in design.get("bindings", []):
        if binding["kind"] == "caller_role":
            role = index.entities.get(binding["roleRef"])
            if (
                not role
                or role.get("category") != "role"
                or role.get("kind") != "party"
            ):
                diagnostics.append(
                    error(
                        "ACTOR_ROLE_INVALID",
                        "caller_role 必须引用 FM Party Role",
                        binding["id"],
                    )
                )
            if binding["scopeResourceRef"] not in resource_ids:
                diagnostics.append(
                    error("DESIGN_REF_NOT_FOUND", "调用者范围资源不存在", binding["id"])
                )
        else:
            if (
                binding["parentResourceRef"] not in resource_ids
                or binding["childResourceRef"] not in resource_ids
            ):
                diagnostics.append(
                    error(
                        "DESIGN_REF_NOT_FOUND",
                        "parent_child 引用的资源不存在",
                        binding["id"],
                    )
                )
    return diagnostics


def build_projection(
    design: dict[str, Any], index: FMIndex, project_root: Path, api_digest: str
) -> dict[str, Any]:
    source_digests, diagnostics = _validate_references(design, index, project_root)
    resources, resource_diagnostics = resources_module.build_resources(design, index)
    diagnostics.extend(resource_diagnostics)
    diagnostics.extend(_validate_bindings(design, index, resources))
    capabilities, exploration, operations, capability_diagnostics = (
        capabilities_module.project_capabilities(design, index, resources)
    )
    diagnostics.extend(capability_diagnostics)
    representations, representation_diagnostics = (
        hypermedia_module.validate_representations(
            design, index, resources, capabilities
        )
    )
    diagnostics.extend(representation_diagnostics)
    coverage, coverage_diagnostics = coverage_module.project_coverage(
        design, index, capabilities
    )
    diagnostics.extend(coverage_diagnostics)
    diagnostics = sorted(
        set(diagnostics),
        key=lambda item: (item.severity, item.code, item.targetRef or "", item.message),
    )
    projection = {
        "schemaVersion": "3.0",
        "apiId": design["id"],
        "inputDigests": {
            "fm": index.files,
            "api": api_digest,
            "sources": source_digests,
        },
        "fmCheckSummary": index.check,
        "fmReviewState": {
            "modelStatus": index.compiled.get("model", {}).get("modelStatus"),
            "stakeholderReview": index.compiled.get("model", {}).get(
                "stakeholderReview"
            ),
        },
        "resources": resources,
        "exploration": exploration,
        "capabilities": capabilities,
        "operations": operations,
        "representations": representations,
        "coverage": coverage,
        "http": None,
        "diagnostics": [item.to_dict() for item in diagnostics],
    }
    if design["http"] is not None:
        projection["http"] = contracts_module.build_http(
            design["http"], projection, index
        )
        projection["diagnostics"].extend(projection["http"]["diagnostics"])
    return projection
