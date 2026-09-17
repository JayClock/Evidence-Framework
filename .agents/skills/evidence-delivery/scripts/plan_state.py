#!/usr/bin/env python3
"""Validate a machine-readable smart-domain plan and select runnable tasks."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

STATUSES = {"planned", "blocked", "in-progress", "done"}
MODES = {"design", "setup", "implementation", "verify", "manual"}
ASSERTION_OPERATORS = {
    "equals",
    "not-equals",
    "contains",
    "not-contains",
    "exists",
    "absent",
    "matches",
    "count-equals",
}


class UniqueLoader(yaml.SafeLoader):
    pass


def _mapping(loader: UniqueLoader, node: yaml.Node, deep: bool = False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f"duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def load_document(path: Path) -> dict[str, Any]:
    if path.suffix.lower() not in {".yaml", ".yml"}:
        raise ValueError(f"plan must be a YAML file: {path}")
    loader = UniqueLoader(path.read_text(encoding="utf-8"))
    try:
        value = loader.get_single_data()
    finally:
        loader.dispose()
    if not isinstance(value, dict):
        raise ValueError(f"expected mapping: {path}")
    return value


def _strings(value: Any, location: str, diagnostics: list[str]) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        diagnostics.append(f"{location} must be an array of strings")
        return []
    return value


def _is_data(value: Any) -> bool:
    if value is None or isinstance(value, (str, bool, int, float)):
        return True
    if isinstance(value, list):
        return all(_is_data(item) for item in value)
    if isinstance(value, dict):
        return all(
            isinstance(key, str) and _is_data(item) for key, item in value.items()
        )
    return False


def inspect_plan(plan_path: Path) -> dict[str, Any]:
    plan_path = plan_path.resolve()
    plan = load_document(plan_path)
    diagnostics: list[str] = []

    if (
        str(plan.get("schemaVersion")) != "3.0"
        or plan.get("kind") != "smart-domain-plan"
    ):
        diagnostics.append("plan must be schemaVersion 3.0 kind smart-domain-plan")

    compiled = plan.get("compiled")
    if not isinstance(compiled, dict):
        diagnostics.append("compiled must contain the current compiler projection")
        compiled = {}
    nodes_value = compiled.get("tasks", [])
    if not isinstance(nodes_value, list):
        diagnostics.append("compiled.tasks must be an array")
        nodes_value = []

    nodes: dict[str, dict[str, Any]] = {}
    for position, node in enumerate(nodes_value):
        location = f"compiled.tasks[{position}]"
        if not isinstance(node, dict):
            diagnostics.append(f"{location} must be a mapping")
            continue
        task_key = node.get("taskKey")
        if not isinstance(task_key, str) or not task_key:
            diagnostics.append(f"{location}.taskKey must be nonempty")
        elif task_key in nodes:
            diagnostics.append(f"duplicate compiled taskKey: {task_key}")
        else:
            nodes[task_key] = node

    tasks_value = plan.get("tasks", {})
    if not isinstance(tasks_value, dict):
        diagnostics.append("tasks must be a mapping keyed by taskKey")
        tasks_value = {}
    tasks: dict[str, dict[str, Any]] = {}
    gap_references: list[tuple[str, str]] = []
    check_owners: dict[str, str] = {}
    acceptance_owners: dict[str, str] = {}
    for task_key, task in tasks_value.items():
        location = f"tasks[{task_key!r}]"
        if not isinstance(task_key, str) or not task_key:
            diagnostics.append("tasks keys must be nonempty strings")
            continue
        if not isinstance(task, dict):
            diagnostics.append(f"{location} must be a mapping")
            continue
        title = task.get("title")
        if not isinstance(title, str) or not title.strip():
            diagnostics.append(f"{location}.title must be nonempty")
        status = task.get("status")
        mode = task.get("mode")
        if status not in STATUSES:
            diagnostics.append(f"{location}.status is invalid: {status}")
        if mode not in MODES:
            diagnostics.append(f"{location}.mode is invalid: {mode}")
        refs = _strings(task.get("gapRefs", []), f"{location}.gapRefs", diagnostics)
        gap_references.extend((location, ref) for ref in refs)
        if status == "blocked" and not refs:
            diagnostics.append(f"blocked task must reference a gap: {task_key}")

        checks = task.get("checks", [])
        if not isinstance(checks, list):
            diagnostics.append(f"{location}.checks must be an array")
            checks = []
        task_check_ids: set[str] = set()
        for position, check in enumerate(checks):
            check_location = f"{location}.checks[{position}]"
            if not isinstance(check, dict):
                diagnostics.append(f"{check_location} must be a mapping")
                continue
            check_id = check.get("id")
            if not isinstance(check_id, str) or not check_id:
                diagnostics.append(f"{check_location}.id must be nonempty")
            elif check_id in check_owners:
                diagnostics.append(
                    f"duplicate CHECK id {check_id}: {check_owners[check_id]} and {task_key}"
                )
            else:
                check_owners[check_id] = task_key
                task_check_ids.add(check_id)
            check_gaps = _strings(
                check.get("gapRefs", []), f"{check_location}.gapRefs", diagnostics
            )
            gap_references.extend((check_location, ref) for ref in check_gaps)
            command = check.get("command")
            if command is not None and (
                not isinstance(command, str) or not command.strip()
            ):
                diagnostics.append(
                    f"{check_location}.command must be null or a nonempty string"
                )
            if command is None and not check_gaps:
                diagnostics.append(f"{check_location} has no command and no gap")

        if "completionCriteria" in task:
            diagnostics.append(
                f"{location}.completionCriteria is obsolete; use acceptanceCriteria"
            )
        criteria = task.get("acceptanceCriteria", [])
        if not isinstance(criteria, list) or not criteria:
            diagnostics.append(
                f"{location}.acceptanceCriteria must be a nonempty array"
            )
            criteria = []
        referenced_check_ids: set[str] = set()
        for position, criterion in enumerate(criteria):
            criterion_location = f"{location}.acceptanceCriteria[{position}]"
            if not isinstance(criterion, dict):
                diagnostics.append(f"{criterion_location} must be a mapping")
                continue
            criterion_id = criterion.get("id")
            if not isinstance(criterion_id, str) or not criterion_id.strip():
                diagnostics.append(f"{criterion_location}.id must be nonempty")
            elif criterion_id in acceptance_owners:
                diagnostics.append(
                    f"duplicate acceptance criterion id {criterion_id}: "
                    f"{acceptance_owners[criterion_id]} and {task_key}"
                )
            else:
                acceptance_owners[criterion_id] = task_key
            check_refs = _strings(
                criterion.get("checkRefs", []),
                f"{criterion_location}.checkRefs",
                diagnostics,
            )
            if not check_refs:
                diagnostics.append(f"{criterion_location}.checkRefs must not be empty")
            if len(check_refs) != len(set(check_refs)):
                diagnostics.append(
                    f"{criterion_location}.checkRefs contains duplicates"
                )
            referenced_check_ids.update(check_refs)
            unknown_checks = sorted(set(check_refs) - task_check_ids)
            if unknown_checks:
                diagnostics.append(
                    f"{criterion_location} references checks outside its task: "
                    f"{unknown_checks}"
                )
            assertions = criterion.get("assertions", [])
            if not isinstance(assertions, list) or not assertions:
                diagnostics.append(
                    f"{criterion_location}.assertions must be a nonempty array"
                )
                continue
            for assertion_position, assertion in enumerate(assertions):
                assertion_location = (
                    f"{criterion_location}.assertions[{assertion_position}]"
                )
                if not isinstance(assertion, dict):
                    diagnostics.append(f"{assertion_location} must be a mapping")
                    continue
                path = assertion.get("path")
                if not isinstance(path, str) or not path.strip():
                    diagnostics.append(f"{assertion_location}.path must be nonempty")
                operator = assertion.get("operator")
                if operator not in ASSERTION_OPERATORS:
                    diagnostics.append(
                        f"{assertion_location}.operator is invalid: {operator}"
                    )
                if "expected" not in assertion:
                    diagnostics.append(f"{assertion_location}.expected is required")
                elif not _is_data(assertion["expected"]):
                    diagnostics.append(
                        f"{assertion_location}.expected must be JSON-compatible data"
                    )
        unreferenced_checks = sorted(task_check_ids - referenced_check_ids)
        if unreferenced_checks:
            diagnostics.append(
                f"{location}.checks are not referenced by acceptanceCriteria: "
                f"{unreferenced_checks}"
            )
        if status == "done":
            evidence = task.get("observedEvidence", [])
            if not isinstance(evidence, list) or not evidence:
                diagnostics.append(f"done task has no observed evidence: {task_key}")
        tasks[task_key] = task

    missing_specs = sorted(set(nodes) - set(tasks))
    extra_specs = sorted(set(tasks) - set(nodes))
    if missing_specs:
        diagnostics.append(f"compiled tasks missing task records: {missing_specs}")
    if extra_specs:
        diagnostics.append(
            f"task records reference unknown compiled tasks: {extra_specs}"
        )

    gaps_value = plan.get("gaps", [])
    if not isinstance(gaps_value, list):
        diagnostics.append("gaps must be an array")
        gaps_value = []
    gaps: dict[str, dict[str, Any]] = {}
    for position, gap in enumerate(gaps_value):
        location = f"gaps[{position}]"
        if not isinstance(gap, dict):
            diagnostics.append(f"{location} must be a mapping")
            continue
        gap_id = gap.get("id")
        if not isinstance(gap_id, str) or not gap_id:
            diagnostics.append(f"{location}.id must be nonempty")
            continue
        if gap_id in gaps:
            diagnostics.append(f"duplicate gap id: {gap_id}")
            continue
        affected = _strings(
            gap.get("affectedTaskRefs", []), f"{location}.affectedTaskRefs", diagnostics
        )
        unknown = sorted(set(affected) - set(tasks))
        if unknown:
            diagnostics.append(f"{location} references unknown tasks: {unknown}")
        gaps[gap_id] = gap
    for location, gap_ref in gap_references:
        if gap_ref not in gaps:
            diagnostics.append(f"{location} references unknown gap: {gap_ref}")

    for task_key, node in nodes.items():
        dependencies = _strings(
            node.get("dependsOn", []),
            f"compiled task {task_key}.dependsOn",
            diagnostics,
        )
        unknown = sorted(set(dependencies) - set(nodes))
        if unknown:
            diagnostics.append(f"task {task_key} has unknown dependencies: {unknown}")
        if len(dependencies) != len(set(dependencies)):
            diagnostics.append(f"task {task_key} has duplicate dependencies")
        status = tasks.get(task_key, {}).get("status")
        if status in {"in-progress", "done"}:
            incomplete = [
                ref
                for ref in dependencies
                if tasks.get(ref, {}).get("status") != "done"
            ]
            if incomplete:
                diagnostics.append(
                    f"task {task_key} is {status} before dependencies are done: {incomplete}"
                )

    execution_order = compiled.get("executionOrder", [])
    if not isinstance(execution_order, list):
        diagnostics.append("compiled.executionOrder must be an array")
        execution_order = []
    if not nodes:
        diagnostics.append("compiled plan must contain at least one task")
    if Counter(execution_order) != Counter(nodes.keys()):
        diagnostics.append(
            "compiled.executionOrder must contain every taskKey exactly once"
        )
    else:
        positions = {
            task_key: position for position, task_key in enumerate(execution_order)
        }
        for task_key, node in nodes.items():
            for dependency in node.get("dependsOn", []):
                if (
                    dependency in positions
                    and positions[dependency] >= positions[task_key]
                ):
                    diagnostics.append(
                        f"compiled.executionOrder places {task_key} before dependency {dependency}"
                    )
    if not compiled.get("coverageComplete", False):
        diagnostics.append("compiled coverage is incomplete")
    compiler_diagnostics = compiled.get("diagnostics", [])
    if compiler_diagnostics:
        diagnostics.append(f"compiler diagnostics remain: {compiler_diagnostics}")

    runnable = []
    if not diagnostics:
        for task_key in execution_order:
            task = tasks[task_key]
            dependencies = nodes[task_key].get("dependsOn", [])
            if task.get("status") == "planned" and all(
                tasks[ref].get("status") == "done" for ref in dependencies
            ):
                runnable.append(
                    {
                        "taskKey": task_key,
                        "title": task.get("title"),
                        "mode": task.get("mode"),
                        "outcome": task.get("outcome"),
                    }
                )

    status_counts = Counter(
        task.get("status") for task in tasks.values() if task.get("status") in STATUSES
    )
    return {
        "valid": not diagnostics,
        "plan": str(plan_path),
        "sourceFreshness": "not-checked; recompile FM/API inputs before delivery",
        "taskCount": len(tasks),
        "statusCounts": {name: status_counts.get(name, 0) for name in sorted(STATUSES)},
        "runnable": runnable,
        "diagnostics": diagnostics,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify", "next"))
    parser.add_argument("--plan", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        result = inspect_plan(args.plan)
    except (OSError, ValueError, yaml.YAMLError) as error:
        result = {
            "valid": False,
            "plan": str(args.plan),
            "runnable": [],
            "diagnostics": [str(error)],
        }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
