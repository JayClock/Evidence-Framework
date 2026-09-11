#!/usr/bin/env python3
"""Build a deterministic Evidence-only FM timeline."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from fm_model import LoadedModel, entity_signature, load_model, validate_model
from fm_simulation import (
    ValidationSuite,
    load_validation_suite,
    validate_validation_suite,
)

TIME_ATTRIBUTES = {
    "rfp": ("started_at", "expired_at"),
    "proposal": ("started_at", "expired_at"),
    "contract": ("signed_at",),
    "fulfillment_request": ("started_at", "expired_at"),
    "fulfillment_confirmation": ("confirmed_at",),
    "other_evidence": ("created_at",),
}


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def instance_time(instance: dict[str, Any], entity: dict[str, Any]) -> dict[str, Any] | None:
    names = TIME_ATTRIBUTES.get(str(entity.get("kind")), ())
    values = instance.get("values") or {}
    if len(names) == 2:
        return {
            "kind": "interval",
            "startedAt": values.get(names[0]),
            "expiredAt": values.get(names[1]),
        }
    if len(names) == 1 and names[0] in values:
        return {"kind": "moment", "attribute": names[0], "at": values[names[0]]}
    return None


def time_bounds(time: dict[str, Any] | None) -> tuple[datetime | None, datetime | None]:
    if not time:
        return None, None
    if time["kind"] == "interval":
        return parse_time(time.get("startedAt")), parse_time(time.get("expiredAt"))
    value = parse_time(time.get("at"))
    return value, value


def build_timeline(model: LoadedModel, suite: ValidationSuite) -> tuple[dict[str, Any], list[str]]:
    entities = model.entities_by_id
    evidence = {
        entity_id: entity
        for entity_id, entity in entities.items()
        if entity_signature(entity)[0] == "evidence"
    }
    lanes = sorted(
        {
            str(entity.get("contextRef"))
            for entity in evidence.values()
            if entity.get("contextRef")
        }
    )
    evidence_types = [
        {
            "entityRef": entity_id,
            "contextRef": entity["contextRef"],
            "evidenceKind": entity["kind"],
            "timeAttributes": list(TIME_ATTRIBUTES[str(entity["kind"])]),
        }
        for entity_id, entity in sorted(evidence.items())
    ]
    errors: list[str] = []
    timeline_instances: list[dict[str, Any]] = []
    by_id = suite.instances_by_id
    bounds: dict[str, tuple[datetime | None, datetime | None]] = {}
    for instance_id, instance in sorted(by_id.items()):
        entity = evidence.get(str(instance.get("entityRef")))
        if entity is None:
            continue
        time = instance_time(instance, entity)
        start, end = time_bounds(time)
        bounds[instance_id] = (start, end)
        if start is not None and end is not None and start > end:
            errors.append(f"{instance_id}: Evidence interval starts after it expires")
        timeline_instances.append(
            {
                "instanceRef": instance_id,
                "entityRef": instance["entityRef"],
                "contextRef": entity["contextRef"],
                "evidenceKind": entity["kind"],
                "time": time,
                "basedOn": sorted(instance.get("basedOn") or []),
                "values": instance.get("values") or {},
            }
        )

    def visit(instance_id: str, path: tuple[str, ...]) -> None:
        if instance_id in path:
            errors.append(f"{instance_id}: basedOn cycle detected")
            return
        for basis in by_id.get(instance_id, {}).get("basedOn") or []:
            if basis not in by_id:
                continue
            basis_formed = bounds.get(str(basis), (None, None))[0]
            current_start = bounds.get(instance_id, (None, None))[0]
            if (
                basis_formed is not None
                and current_start is not None
                and basis_formed > current_start
            ):
                errors.append(f"{instance_id}: basedOn references future Evidence '{basis}'")
            visit(str(basis), (*path, instance_id))

    for instance_id in sorted(by_id):
        visit(instance_id, ())

    precedes = sorted(
        [
            {"relationshipRef": relation["id"], "sourceRef": relation["sourceRef"], "targetRef": relation["targetRef"]}
            for relation in model.relationships
            if relation.get("kind") == "precedes"
            and relation.get("sourceRef") in evidence
            and relation.get("targetRef") in evidence
        ],
        key=lambda item: item["relationshipRef"],
    )
    adjacency: dict[str, set[str]] = {entity_id: set() for entity_id in evidence}
    for edge in precedes:
        adjacency[edge["sourceRef"]].add(edge["targetRef"])

    def reachable(source: str, target: str, seen: set[str] | None = None) -> bool:
        if source == target:
            return True
        visited = set() if seen is None else seen
        if source in visited:
            return False
        visited.add(source)
        return any(reachable(item, target, visited) for item in adjacency.get(source, set()))

    unresolved = []
    ids = sorted(evidence)
    for index, source in enumerate(ids):
        for target in ids[index + 1 :]:
            if evidence[source].get("contextRef") != evidence[target].get("contextRef"):
                continue
            if not reachable(source, target) and not reachable(target, source):
                unresolved.append({"leftRef": source, "rightRef": target, "reason": "no sourced precedes path"})

    timeline = {
        "schemaVersion": "3.0",
        "modelId": (model.manifest or {}).get("id"),
        "lanes": [{"contextRef": ref} for ref in lanes],
        "evidenceTypes": evidence_types,
        "instances": timeline_instances,
        "precedes": precedes,
        "unresolvedOrder": unresolved,
    }
    return timeline, list(dict.fromkeys(errors))


def timeline_summary(timeline: dict[str, Any]) -> dict[str, Any]:
    return {
        "laneCount": len(timeline["lanes"]),
        "evidenceTypeCount": len(timeline["evidenceTypes"]),
        "instanceCount": len(timeline["instances"]),
        "precedesCount": len(timeline["precedes"]),
        "unresolvedOrderCount": len(timeline["unresolvedOrder"]),
        "sha256": "sha256:" + hashlib.sha256(canonical_bytes(timeline)).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model_dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    model = load_model(args.model_dir)
    suite = load_validation_suite(args.model_dir)
    errors = [*validate_model(model), *validate_validation_suite(model, suite)]
    timeline, timeline_errors = build_timeline(model, suite)
    errors.extend(timeline_errors)
    if errors:
        for error in dict.fromkeys(errors):
            print(f"ERROR: {error}")
        return 1
    output = args.output or args.model_dir / "generated/timeline.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(canonical_bytes(timeline))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
