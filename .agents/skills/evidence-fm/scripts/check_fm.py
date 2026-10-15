#!/usr/bin/env python3
"""Read-only FM consistency and explicit responsibility-scope completeness checks."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from build_fm_timeline import build_timeline, timeline_summary  # pyright: ignore[reportMissingImports]
from fm_model import load_model, validate_model
from fm_scope import (  # pyright: ignore[reportMissingImports]
    completeness_gaps,
    scope_suite,
    select_scope,
    simulation_rules,
)
from fm_simulation import (
    load_validation_suite,
    simulate_validation_suite,
    validate_validation_suite,
)


def model_digest(root: Path) -> str:
    """Hash source paths and bytes, independent of location and generated output."""
    files = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if relative.parts[0] == "generated" or "__pycache__" in relative.parts:
            continue
        if path.is_file():
            files[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    content = json.dumps(files, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()


def check_model(root: Path, *, scope_refs: list[str] | None = None) -> dict[str, Any]:
    digest = model_digest(root)
    model = load_model(root)
    model_errors = validate_model(model)
    suite = load_validation_suite(root)
    suite_errors = list(suite.errors) if model.errors or suite.errors else validate_validation_suite(model, suite)
    if model.errors or suite.errors:
        timeline = {key: [] for key in ("lanes", "evidenceTypes", "instances", "dependencies", "unresolvedOrder")}
        timeline_errors = []
    else:
        timeline, timeline_errors = build_timeline(model, suite)
    static_errors = list(dict.fromkeys([*model_errors, *suite_errors, *timeline_errors]))
    target, target_suite = model, suite
    scope_selected = False
    if scope_refs is not None and not model.errors and not suite.errors:
        try:
            target = select_scope(model, scope_refs)
            scope_selected = True
            target_suite = scope_suite(target, suite)
            static_errors.extend(validate_validation_suite(target, target_suite))
        except ValueError as error:
            static_errors.append(str(error))
    gaps = [] if model.errors else completeness_gaps(target)
    applicable_rules, limitations = simulation_rules(target) if not model.errors else ([], [])
    scenario_requirement = "required" if applicable_rules or target.fulfillments_by_id else "not-applicable"
    if scope_selected and scenario_requirement == "required":
        covered = {
            evaluation.get("ruleRef") for scenario in target_suite.scenarios
            for evaluation in scenario.get("evaluations") or []
        }
        if not target_suite.scenarios:
            gaps.append("scope requires executable normal and counterexample scenarios")
        for rule in applicable_rules:
            if rule.get("id") not in covered:
                gaps.append(f"{rule['id']}: scope scenarios do not evaluate this Rule")
        status_coverage = {
            status.get("fulfillmentRef") for scenario in target_suite.scenarios
            for status in scenario.get("expectations", {}).get("fulfillmentStatuses", [])
        }
        for fulfillment_id in target.fulfillments_by_id:
            if fulfillment_id not in status_coverage:
                gaps.append(f"{fulfillment_id}: scope scenarios do not assert this Fulfillment's status")
    simulation_passed: bool | None = None
    simulation: dict[str, Any] = {}
    executed = 0
    errors = list(dict.fromkeys(static_errors))
    if not errors and not gaps and target_suite.scenarios:
        simulation, simulation_errors = simulate_validation_suite(target, target_suite)
        executed = len(simulation["scenarioResults"])
        if executed:
            simulation_passed = bool(simulation["simulationPassed"])
        errors = list(dict.fromkeys([*errors, *simulation_errors]))
    input_changed = digest != model_digest(root)
    if input_changed:
        errors.append("Model inputs changed during validation")
    consistent = not static_errors and not input_changed
    complete = (not gaps and consistent) if scope_refs is not None else None
    return {
        "checkVersion": 2,
        "valid": not errors and complete is not False,
        "consistent": consistent,
        "complete": complete,
        "scopeRefs": list(scope_refs) if scope_refs is not None else [],
        "contextRefs": sorted(item["id"] for item in target.entities if item.get("category") == "context") if scope_selected else [],
        "gaps": list(dict.fromkeys(gaps)),
        "humanConfirmation": "not-asserted-by-machine",
        "modelDigest": digest,
        "inputChanged": input_changed,
        "modelValidated": not model_errors,
        "scenarioRequirement": scenario_requirement if scope_refs is not None else "not-checked",
        "simulationLimitations": limitations,
        "scenarioCount": len(target_suite.scenarios),
        "executedScenarioCount": executed,
        "simulationPassed": simulation_passed,
        "scenarioResults": simulation.get("scenarioResults", []),
        "timelineSummary": timeline_summary(timeline),
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model_dir", type=Path, help="Directory containing model.json")
    parser.add_argument("--scope", action="append", dest="scope_refs", help="Independent Context ID; repeat for multiple scopes")
    args = parser.parse_args()
    report = check_model(args.model_dir, scope_refs=args.scope_refs)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
