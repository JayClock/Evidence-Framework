#!/usr/bin/env python3
"""Read-only validation and runnable-task selection for smart-domain plans."""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

STATUSES = {"planned", "blocked", "in-progress", "done"}
MODES = {"design", "setup", "implementation", "verify", "manual"}


class UniqueLoader(yaml.SafeLoader):
    pass


def _mapping(loader: UniqueLoader, node: yaml.Node, deep: bool = False) -> dict:
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f"duplicate YAML key: {key}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def load_document(path: Path) -> dict[str, Any]:
    content = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".md":
        blocks = re.findall(
            r"^```yaml\n(.*?)^```\s*$", content, re.MULTILINE | re.DOTALL
        )
        if len(blocks) != 1:
            raise ValueError(f"Markdown requires exactly one YAML block: {path}")
        content = blocks[0]
    loader = UniqueLoader(content)
    try:
        value = loader.get_single_data()
    finally:
        loader.dispose()
    if not isinstance(value, dict):
        raise ValueError(f"expected mapping: {path}")
    return value


def _strings(value: Any, location: str, diagnostics: list[str]) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        diagnostics.append(f"{location} must be a string array")
        return []
    return value


def inspect_plan(index_path: Path) -> dict[str, Any]:
    index_path = index_path.resolve()
    index = load_document(index_path)
    diagnostics: list[str] = []

    if str(index.get("schemaVersion")) != "2.0" or index.get("kind") != "task-index":
        diagnostics.append("index must be schemaVersion 2.0 kind task-index")

    compiled = index.get("compiled")
    if not isinstance(compiled, dict):
        diagnostics.append(
            "index.compiled must contain the current compiler projection"
        )
        compiled = {}
    tasks_value = compiled.get("tasks", [])
    if not isinstance(tasks_value, list):
        diagnostics.append("compiled.tasks must be an array")
        tasks_value = []

    tasks: dict[str, dict[str, Any]] = {}
    paths: set[Path] = set()
    for position, task in enumerate(tasks_value):
        location = f"compiled.tasks[{position}]"
        if not isinstance(task, dict):
            diagnostics.append(f"{location} must be a mapping")
            continue
        task_key = task.get("taskKey")
        if not isinstance(task_key, str) or not task_key:
            diagnostics.append(f"{location}.taskKey must be nonempty")
            continue
        if task_key in tasks:
            diagnostics.append(f"duplicate taskKey: {task_key}")
            continue
        relative = task.get("path")
        if not isinstance(relative, str) or not relative.startswith("tasks/"):
            diagnostics.append(f"{location}.path must be under tasks/")
        else:
            task_path = (index_path.parent / relative).resolve()
            if not task_path.is_relative_to(index_path.parent.resolve()):
                diagnostics.append(f"task path escapes plan directory: {relative}")
            elif task_path in paths:
                diagnostics.append(f"duplicate task path: {relative}")
            else:
                paths.add(task_path)
        tasks[task_key] = task

    notes_value = index.get("taskNotes", [])
    if not isinstance(notes_value, list):
        diagnostics.append("taskNotes must be an array")
        notes_value = []
    notes: dict[str, dict[str, Any]] = {}
    gap_references: list[tuple[str, str]] = []
    for position, note in enumerate(notes_value):
        location = f"taskNotes[{position}]"
        if not isinstance(note, dict):
            diagnostics.append(f"{location} must be a mapping")
            continue
        task_ref = note.get("taskRef")
        if not isinstance(task_ref, str) or not task_ref:
            diagnostics.append(f"{location}.taskRef must be nonempty")
            continue
        if task_ref in notes:
            diagnostics.append(f"duplicate taskNotes.taskRef: {task_ref}")
            continue
        status = note.get("status")
        mode = note.get("mode")
        if status not in STATUSES:
            diagnostics.append(f"{location}.status is invalid: {status}")
        if mode not in MODES:
            diagnostics.append(f"{location}.mode is invalid: {mode}")
        refs = _strings(note.get("gapRefs", []), f"{location}.gapRefs", diagnostics)
        gap_references.extend((location, ref) for ref in refs)
        if status == "blocked" and not refs:
            diagnostics.append(f"blocked task must reference a gap: {task_ref}")
        notes[task_ref] = note

    missing_notes = sorted(set(tasks) - set(notes))
    extra_notes = sorted(set(notes) - set(tasks))
    if missing_notes:
        diagnostics.append(f"tasks missing taskNotes: {missing_notes}")
    if extra_notes:
        diagnostics.append(f"taskNotes reference unknown tasks: {extra_notes}")

    gaps_value = index.get("gaps", [])
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
            gap.get("affectedTaskRefs", []),
            f"{location}.affectedTaskRefs",
            diagnostics,
        )
        unknown = sorted(set(affected) - set(tasks))
        if unknown:
            diagnostics.append(f"{location} references unknown tasks: {unknown}")
        gaps[gap_id] = gap
    for location, gap_ref in gap_references:
        if gap_ref not in gaps:
            diagnostics.append(f"{location} references unknown gap: {gap_ref}")

    check_owners: dict[str, str] = {}
    task_documents: dict[str, dict[str, Any]] = {}
    for task_key, task in tasks.items():
        relative = task.get("path")
        if not isinstance(relative, str) or not relative.startswith("tasks/"):
            continue
        task_path = (index_path.parent / relative).resolve()
        if not task_path.is_relative_to(index_path.parent.resolve()):
            continue
        if not task_path.is_file():
            diagnostics.append(f"task file not found: {relative}")
            continue
        try:
            document = load_document(task_path)
        except (OSError, ValueError, yaml.YAMLError) as error:
            diagnostics.append(str(error))
            continue
        task_documents[task_key] = document
        if (
            str(document.get("schemaVersion")) != "2.0"
            or document.get("kind") != "task-plan"
        ):
            diagnostics.append(f"{relative} must be schemaVersion 2.0 kind task-plan")
        if document.get("taskKey") != task_key:
            diagnostics.append(f"{relative} taskKey does not match compiled task")
        plan_ref = document.get("planRef")
        if (
            not isinstance(plan_ref, str)
            or (task_path.parent / plan_ref).resolve() != index_path
        ):
            diagnostics.append(f"{relative} planRef does not resolve to index")
        checks = document.get("checks", [])
        if not isinstance(checks, list):
            diagnostics.append(f"{relative} checks must be an array")
            checks = []
        for position, check in enumerate(checks):
            location = f"{relative}.checks[{position}]"
            if not isinstance(check, dict):
                diagnostics.append(f"{location} must be a mapping")
                continue
            check_id = check.get("id")
            if not isinstance(check_id, str) or not check_id:
                diagnostics.append(f"{location}.id must be nonempty")
            elif check_id in check_owners:
                diagnostics.append(
                    f"duplicate CHECK id {check_id}: {check_owners[check_id]} and {relative}"
                )
            else:
                check_owners[check_id] = relative
            check_gaps = _strings(
                check.get("gapRefs", []), f"{location}.gapRefs", diagnostics
            )
            for gap_ref in check_gaps:
                if gap_ref not in gaps:
                    diagnostics.append(f"{location} references unknown gap: {gap_ref}")
            command = check.get("command")
            if command is not None and (
                not isinstance(command, str) or not command.strip()
            ):
                diagnostics.append(
                    f"{location}.command must be null or a nonempty string"
                )
            if (command is None or command == "") and not check_gaps:
                diagnostics.append(f"{location} has no command and no gap")
        note = notes.get(task_key, {})
        if note.get("status") == "done":
            criteria = document.get("completionCriteria", [])
            evidence = document.get("observedEvidence", [])
            if not isinstance(criteria, list) or not criteria:
                diagnostics.append(f"done task has no completion criteria: {task_key}")
            if not isinstance(evidence, list) or not evidence:
                diagnostics.append(f"done task has no observed evidence: {task_key}")

    for task_key, task in tasks.items():
        dependencies = _strings(
            task.get("dependsOn", []),
            f"compiled task {task_key}.dependsOn",
            diagnostics,
        )
        unknown = sorted(set(dependencies) - set(tasks))
        if unknown:
            diagnostics.append(f"task {task_key} has unknown dependencies: {unknown}")
        if len(dependencies) != len(set(dependencies)):
            diagnostics.append(f"task {task_key} has duplicate dependencies")
        status = notes.get(task_key, {}).get("status")
        if status in {"in-progress", "done"}:
            incomplete = [
                ref
                for ref in dependencies
                if notes.get(ref, {}).get("status") != "done"
            ]
            if incomplete:
                diagnostics.append(
                    f"task {task_key} is {status} before dependencies are done: {incomplete}"
                )

    execution_order = compiled.get("executionOrder", [])
    if not isinstance(execution_order, list):
        diagnostics.append("compiled.executionOrder must be an array")
        execution_order = []
    if not tasks:
        diagnostics.append("compiled plan must contain at least one task")
    if Counter(execution_order) != Counter(tasks.keys()):
        diagnostics.append(
            "compiled.executionOrder must contain every taskKey exactly once"
        )
    else:
        positions = {
            task_key: position for position, task_key in enumerate(execution_order)
        }
        for task_key, task in tasks.items():
            for dependency in task.get("dependsOn", []):
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
            note = notes[task_key]
            dependencies = tasks[task_key].get("dependsOn", [])
            if note.get("status") == "planned" and all(
                notes[ref].get("status") == "done" for ref in dependencies
            ):
                runnable.append(
                    {
                        "taskKey": task_key,
                        "path": tasks[task_key].get("path"),
                        "mode": note.get("mode"),
                        "outcome": note.get("outcome"),
                    }
                )

    status_counts = Counter(
        note.get("status") for note in notes.values() if note.get("status") in STATUSES
    )
    return {
        "valid": not diagnostics,
        "index": str(index_path),
        "sourceFreshness": "not-checked; recompile FM/API inputs before delivery",
        "taskCount": len(tasks),
        "statusCounts": {name: status_counts.get(name, 0) for name in sorted(STATUSES)},
        "runnable": runnable,
        "diagnostics": diagnostics,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("verify", "next"))
    parser.add_argument("--index", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        result = inspect_plan(args.index)
    except (OSError, ValueError, yaml.YAMLError) as error:
        result = {
            "valid": False,
            "index": str(args.index.resolve()),
            "sourceFreshness": "not-checked",
            "taskCount": 0,
            "statusCounts": {},
            "runnable": [],
            "diagnostics": [str(error)],
        }
    if args.command == "next":
        result = {
            "valid": result["valid"],
            "index": result["index"],
            "sourceFreshness": result["sourceFreshness"],
            "runnable": result["runnable"],
            "diagnostics": result["diagnostics"],
        }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
