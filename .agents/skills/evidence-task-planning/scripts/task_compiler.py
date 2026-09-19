#!/usr/bin/env python3
"""Read-only FM inventory and explicit slicing-map compiler. No code generation."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from urllib.parse import quote

import yaml

POLICY_VERSION = "sd-modular-monolith-mybatis-1"
PROFILE = {
    "architecture": "modular-monolith",
    "deploymentUnit": "single-backend-application",
    "moduleInteraction": "in-process-contracts",
    "persistence": "mybatis",
    "http": "jersey-hal-forms",
    "springBoot": "3.5.x",
    "codeOrganization": "composition-root-and-libraries",
    "mybatisMapping": "xml-domain-resultmap",
    "resourceNavigation": "jersey-subresources",
    "databaseEngine": None,
}
CONCERNS = (
    "design",
    "platform",
    "foundation",
    "domain",
    "mybatis",
    "security",
    "integration",
    "api",
    "acceptance",
)
FM_TYPES = {
    "fm_model",
    "entity",
    "relationship",
    "rule",
    "fm_scenario",
    "evidence_instance",
}


class UniqueLoader(yaml.SafeLoader):
    pass


def _mapping(loader, node, deep=False):
    result = {}
    for k, v in node.value:
        name = loader.construct_object(k, deep=deep)
        if name in result:
            raise ValueError(f"duplicate YAML key: {name}")
        result[name] = loader.construct_object(v, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def _unique_pairs(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError(f"duplicate JSON key: {name}")
        result[name] = value
    return result


def load(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        try:
            value = json.loads(
                path.read_text(encoding="utf-8"), object_pairs_hook=_unique_pairs
            )
        except json.JSONDecodeError as error:
            raise ValueError(f"invalid JSON: {path}: {error}") from error
    elif suffix in {".yaml", ".yml"}:
        # SafeLoader constructors only; additionally reject duplicate mapping keys.
        content = path.read_text(encoding="utf-8")
        loader = UniqueLoader(content)
        try:
            value = loader.get_single_data()
        finally:
            loader.dispose()
    else:
        raise ValueError("mapping must be a JSON or YAML file")
    if not isinstance(value, dict):
        raise ValueError(f"expected mapping: {path}")
    return value


def canonical(value: Any) -> str:
    return json.dumps(
        value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str
    )


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"nonempty string required: {label}")
    return value


def key(*parts: str) -> str:
    return "::".join(quote(text(p, "key component"), safe="._-") for p in parts)


def _refs(value: Any, location: str = "") -> Iterator[tuple[str, str]]:
    if isinstance(value, dict):
        for name, child in value.items():
            here = f"{location}.{name}".lstrip(".")
            if name == "ref" or str(name).endswith("Ref"):
                if isinstance(child, str):
                    yield here, child
            elif str(name).endswith("Refs") and isinstance(child, list):
                for i, ref in enumerate(child):
                    if isinstance(ref, str):
                        yield f"{here}[{i}]", ref
            yield from _refs(child, here)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            yield from _refs(child, f"{location}[{i}]")


def inventory(fm_root: Path, api_path: Path | None = None) -> dict[str, Any]:
    root = fm_root.resolve()
    if not root.is_dir():
        raise ValueError("FM directory not found")
    sources: dict[str, Any] = {}
    units: dict[str, Any] = {}
    edges = []

    def source(ref, data, path):
        ref = text(ref, "source ID")
        if ref in sources:
            raise ValueError(f"duplicate source ID: {ref}")
        sources[ref] = {"id": ref, "path": path, "digest": digest(data), "data": data}

    def unit(kind, ref, *extra):
        k = key(kind, ref, *extra)
        if k in units:
            raise ValueError(f"duplicate unit: {k}")
        units[k] = {
            "key": k,
            "kind": kind,
            "sourceRef": ref,
            "relatedRefs": list(extra),
        }

    files = sorted(root.rglob("*.json"))
    for legacy in sorted(set(root.rglob("*.yaml")) | set(root.rglob("*.yml"))):
        if "generated" in legacy.relative_to(root).parts:
            continue
        raise ValueError(
            f"FM sources must use .json: {legacy.relative_to(root).as_posix()}"
        )
    for path in files:
        relative = path.relative_to(root)
        if "generated" in relative.parts:
            continue
        if not path.resolve().is_relative_to(root):
            raise ValueError(f"source path escapes FM directory: {relative}")
        data = load(path)
        if data.get("type") not in FM_TYPES:
            raise ValueError(
                f"unsupported FM document type: {relative}: {data.get('type')}"
            )
        source(data.get("id"), data, relative.as_posix())
    models = [s["data"] for s in sources.values() if s["data"]["type"] == "fm_model"]
    if len(models) != 1 or str(models[0].get("schemaVersion")) != "3.0":
        raise ValueError("exactly one FM Schema 3.0 model is required")
    for ref, record in sorted(sources.items()):
        data = record["data"]
        for location, target in _refs(data):
            base = target.split("#", 1)[0]
            if base not in sources:
                raise ValueError(
                    f"unresolved FM reference: {ref}.{location} -> {target}"
                )
            edges.append({"from": ref, "to": base, "locator": location})
        category, kind = data.get("category"), data.get("kind")
        if data["type"] == "entity":
            if category == "context":
                unit("context-design", ref)
                for member in sorted(data.get("rootRefs", [])):
                    unit("root-collection", ref, member)
            elif category == "role":
                unit(
                    "proof-role"
                    if kind == "evidence"
                    else "actor-role"
                    if kind == "party"
                    else "domain-role",
                    ref,
                )
            else:
                unit("evidence" if category == "evidence" else "entity", ref)
        elif data["type"] in {"relationship", "rule", "fm_scenario"}:
            unit(
                {
                    "relationship": "association",
                    "rule": "rule",
                    "fm_scenario": "scenario",
                }[data["type"]],
                ref,
            )
        # Concrete evidence instances are test inputs, not implementation tasks.
    api_digest = None
    capabilities = []
    diagnostics = []
    if api_path is not None:
        api = load(api_path)
        if str(api.get("schemaVersion")) != "4.0":
            raise ValueError("API Schema 4.0 is required")
        api_digest = digest(api)
        resources = {}
        for r in api.get("resources", []):
            ref = text(r.get("id"), "API resource ID")
            source(ref, r, "api:resources")
            resources[ref] = r
            unit("api-resource", ref)
            if r.get("entityRef") not in sources:
                diagnostics.append(
                    f"API resource {ref} has unknown FM entity {r.get('entityRef')}"
                )
        for c in api.get("capabilities", []):
            ref = text(c.get("id"), "API capability ID")
            source(ref, c, "api:capabilities")
            unit("api-capability", ref)
            if c.get("resourceRef") not in resources:
                diagnostics.append(
                    f"API capability {ref} has unknown resource {c.get('resourceRef')}"
                )
            actor = c.get("actorRoleRef")
            if actor is not None and actor not in sources:
                diagnostics.append(f"API capability {ref} has unknown actor {actor}")
            for target in c.get("basis", {}).get("fmRefs", []):
                if target.split("#", 1)[0] not in sources:
                    diagnostics.append(
                        f"API capability {ref} has unknown FM basis {target}"
                    )
            capabilities.append(
                {
                    "id": ref,
                    "resourceRef": c.get("resourceRef"),
                    "actorRoleRef": actor,
                    "method": c.get("method"),
                }
            )
        for activity in api.get("nonApiActivities", []):
            if activity.get("entityRef") not in sources:
                diagnostics.append(
                    f"non-API activity has unknown FM entity {activity.get('entityRef')}"
                )
    for name in (
        "modular-monolith",
        "backend-modules",
        "smart-domain",
        "mybatis",
        "jersey",
    ):
        ref = f"profile.{name}"
        source(ref, {"profile": PROFILE, "component": name}, "policy")
        unit("platform", ref)
    model = models[0]
    return {
        "policyVersion": POLICY_VERSION,
        "profile": dict(PROFILE),
        "modelId": model["id"],
        "inputDigest": digest(
            {
                "sources": [(r, sources[r]["digest"]) for r in sorted(sources)],
                "api": api_digest,
            }
        ),
        "sources": [sources[r] for r in sorted(sources)],
        "units": [units[k] for k in sorted(units)],
        "sourceEdges": sorted(edges, key=canonical),
        "apiCapabilities": sorted(capabilities, key=lambda c: c["id"]),
        "diagnostics": sorted(set(diagnostics)),
    }


def compile_tasks(inv: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    if "profile" in mapping:
        raise ValueError(
            "profile is fixed; record concrete database/module-boundary decisions as designItems"
        )
    known = {s["id"] for s in inv["sources"]}
    units = {u["key"]: dict(u) for u in inv["units"]}
    designs = mapping.get("designItems", [])
    for item in designs:
        ref = text(item.get("id"), "design ID")
        if not ref.startswith("design.") or ref in known:
            raise ValueError(f"invalid or duplicate design ID: {ref}")
        if not item.get("sourceRefs") or any(
            s not in known for s in item["sourceRefs"]
        ):
            raise ValueError(f"unknown design source: {ref}")
        text(item.get("reason"), "design reason")
        units[key("design", ref)] = {
            "key": key("design", ref),
            "kind": "design",
            "sourceRef": ref,
            "relatedRefs": sorted(item["sourceRefs"]),
        }
        # Sources must be inventory IDs, not an order-dependent chain of design decisions.
    known.update(item["id"] for item in designs)
    if len({item["id"] for item in designs}) != len(designs):
        raise ValueError("duplicate design ID")
    groups = {}
    ownership = {}
    for group in mapping.get("groups", []):
        unknown = group.keys() - {
            "concern",
            "ownerRef",
            "operationRef",
            "unitKeys",
            "dependsOn",
        }
        if unknown:
            raise ValueError(f"unknown group fields: {sorted(unknown)}")
        concern = group.get("concern")
        if concern not in CONCERNS:
            raise ValueError(f"unknown concern: {concern}")
        owner, operation = group.get("ownerRef"), group.get("operationRef")
        if owner not in known or operation not in known:
            raise ValueError(f"unknown owner/operation: {owner}/{operation}")
        k = key(concern, owner, operation)
        if k in groups:
            raise ValueError(f"duplicate task key: {k}")
        groups[k] = group
    for k, group in groups.items():
        if not group.get("unitKeys"):
            raise ValueError(f"task has no work units: {k}")
        for u in group["unitKeys"]:
            if u not in units:
                raise ValueError(f"unknown unit: {u}")
            if u in ownership:
                raise ValueError(f"unit already assigned: {u}")
            ownership[u] = k
    dispositions = []
    disposed = set()
    for item in mapping.get("dispositions", []):
        u = item.get("unitKey")
        if u not in units:
            raise ValueError(f"unknown unit: {u}")
        if u in ownership or u in disposed:
            raise ValueError(f"unit already assigned: {u}")
        if units[u]["kind"] in {"platform", "api-capability"}:
            raise ValueError(f"mandatory unit cannot be disposed: {u}")
        if item.get("kind") not in {"external", "not-applicable"}:
            raise ValueError("disposition must be external or not-applicable")
        text(item.get("reason"), "disposition reason")
        if not item.get("sourceRefs") or any(
            ref not in known for ref in item["sourceRefs"]
        ):
            raise ValueError("unknown disposition source")
        disposed.add(u)
        dispositions.append(dict(item, sourceRefs=sorted(set(item["sourceRefs"]))))
    prerequisites = {}
    for k, group in groups.items():
        deps = group.get("dependsOn", [])
        if len(set(deps)) != len(deps) or any(d not in groups for d in deps):
            raise ValueError(f"unknown or duplicate dependency: {k}")
        prerequisites[k] = set(deps)
    remaining = dict(prerequisites)
    order = []
    while remaining:
        ready = sorted(
            (k for k, deps in remaining.items() if deps <= set(order)),
            key=lambda k: (CONCERNS.index(groups[k]["concern"]), k),
        )
        if not ready:
            raise ValueError("execution dependency cycle")
        # One at a time, so newly-ready foundation work wins over unrelated later phases.
        selected = ready[0]
        order.append(selected)
        del remaining[selected]
    api_coverage = []
    api_refs = {k: [] for k in groups}
    for cap in inv["apiCapabilities"]:
        owning = ownership.get(key("api-capability", cap["id"]))
        if owning is None:
            continue
        support = set()
        pending = list(prerequisites[owning])
        while pending:
            dep = pending.pop()
            if dep not in support:
                support.add(dep)
                pending.extend(prerequisites[dep])
        for g in support | {owning}:
            api_refs[g].append(cap["id"])
        api_coverage.append(
            {
                "apiRef": cap["id"],
                "deliveryTaskRef": owning,
                "supportingTaskRefs": sorted(support),
            }
        )
    tasks = []
    for k in sorted(groups):
        g = groups[k]
        tasks.append(
            {
                "taskKey": k,
                "concern": g["concern"],
                "ownerRef": g["ownerRef"],
                "operationRef": g["operationRef"],
                "unitKeys": sorted(g["unitKeys"]),
                "dependsOn": sorted(prerequisites[k]),
                "apiRefs": sorted(api_refs[k]),
            }
        )
    unassigned = sorted(set(units) - set(ownership) - disposed)
    return {
        "policyVersion": POLICY_VERSION,
        "profile": dict(PROFILE),
        "inputDigest": inv["inputDigest"],
        "modelId": inv["modelId"],
        "tasks": tasks,
        "executionOrder": order,
        "apiCoverage": api_coverage,
        "dispositions": sorted(dispositions, key=lambda d: d["unitKey"]),
        "unassignedUnitKeys": unassigned,
        "diagnostics": inv["diagnostics"],
        "coverageComplete": not unassigned and not inv["diagnostics"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("inventory", "compile"))
    parser.add_argument("--fm", required=True, type=Path)
    parser.add_argument("--api", type=Path)
    parser.add_argument("--mapping", type=Path)
    parser.add_argument("--require-complete", action="store_true")
    args = parser.parse_args()
    try:
        inv = inventory(args.fm, args.api)
        result = inv
        if args.command == "compile":
            if args.mapping is None:
                raise ValueError("compile requires --mapping")
            mapping_doc = load(args.mapping)
            result = compile_tasks(inv, mapping_doc.get("slicing", mapping_doc))
        print(
            json.dumps(
                result, ensure_ascii=False, sort_keys=True, indent=2, default=str
            )
        )
        if args.require_complete:
            return int(
                bool(result.get("diagnostics"))
                or (args.command == "compile" and not result["coverageComplete"])
            )
        return 0
    except (ValueError, TypeError, KeyError, OSError, yaml.YAMLError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
