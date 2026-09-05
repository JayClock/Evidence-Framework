#!/usr/bin/env python3
"""Attribute-level traceability for Fulfillment Modeling Schema v2."""

from __future__ import annotations

import ast as python_ast
from collections.abc import Iterable
from contextlib import suppress
from dataclasses import dataclass
from typing import Any

try:
    from celpy import Environment  # pyright: ignore[reportMissingImports]
except ImportError:  # pragma: no cover
    Environment = None  # type: ignore[assignment,misc]

from fm_model import LoadedModel, normalize, undeclared_cel_identifiers

MACRO_NAMES = {"all", "exists", "exists_one", "filter", "map"}


@dataclass(frozen=True, order=True)
class AttributeAccess:
    """One CEL read of a modeled Entity attribute."""

    entity_ref: str
    attribute: str
    binding: str

    @property
    def path(self) -> str:
        return f"{self.entity_ref}#{self.attribute}"


def attribute_path(entity_ref: str, attribute: str) -> str:
    return f"{entity_ref}#{attribute}"


def entity_attributes(entity: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not isinstance(entity, dict):
        return {}
    return {
        str(attribute.get("name")): attribute
        for attribute in entity.get("attributes") or []
        if isinstance(attribute, dict) and isinstance(attribute.get("name"), str)
    }


def _single_identifier(node: Any) -> str | None:
    found: list[str] = []

    def collect(current: Any) -> None:
        if str(getattr(current, "data", "")) == "ident" and getattr(
            current, "children", None
        ):
            found.append(str(current.children[0]))
            return
        for child in getattr(current, "children", []):
            collect(child)

    collect(node)
    return found[0] if len(found) == 1 else None


def _literal_string(node: Any) -> str | None:
    data = str(getattr(node, "data", ""))
    children = list(getattr(node, "children", []))
    if data == "literal" and children:
        try:
            value = python_ast.literal_eval(str(children[0]))
        except (SyntaxError, ValueError):
            return None
        return value if isinstance(value, str) else None
    wrappers = {
        "expr",
        "conditionalor",
        "conditionaland",
        "relation",
        "addition",
        "multiplication",
        "unary",
        "member",
        "primary",
    }
    if data in wrappers and len(children) == 1:
        return _literal_string(children[0])
    return None


def _member_path(node: Any) -> list[str] | None:
    data = str(getattr(node, "data", ""))
    children = list(getattr(node, "children", []))
    if data == "ident" and children:
        return [str(children[0])]
    if data == "member_dot" and len(children) >= 2:
        base = _member_path(children[0])
        return None if base is None else [*base, str(children[1])]
    if data == "member_index" and len(children) >= 2:
        base = _member_path(children[0])
        attribute = _literal_string(children[1])
        return None if base is None or attribute is None else [*base, attribute]
    if data in {"member", "primary", "unary"} and len(children) == 1:
        return _member_path(children[0])
    return None


def extract_rule_attribute_accesses(
    rule: dict[str, Any],
) -> tuple[list[AttributeAccess], list[str]]:
    """Extract Entity.attribute reads from CEL, including macro-local element reads."""

    rule_id = normalize(rule.get("id")) or "<unknown-rule>"
    expression = rule.get("expression")
    bindings = rule.get("bindings") or {}
    if (
        not isinstance(expression, str)
        or not isinstance(bindings, dict)
        or Environment is None
    ):
        return [], []

    try:
        ast = Environment().compile(expression)
    except Exception:
        return [], []  # Syntax diagnostics are owned by fm_model.validate_rules.

    accesses: set[AttributeAccess] = set()
    errors: list[str] = []

    def binding_source(name: str) -> tuple[str, str, str] | None:
        binding = bindings.get(name)
        if not isinstance(binding, dict) or not isinstance(binding.get("ref"), str):
            return None
        return name, str(binding["ref"]), str(binding.get("cardinality", "one"))

    def resolve_root(
        root: str, local_sources: dict[str, tuple[str, str, str]]
    ) -> tuple[str, str, str] | None:
        return local_sources.get(root) or binding_source(root)

    def collection_source(
        node: Any, local_sources: dict[str, tuple[str, str, str]]
    ) -> tuple[str, str, str] | None:
        path = _member_path(node)
        if path is not None and len(path) == 1:
            return resolve_root(path[0], local_sources)
        data = str(getattr(node, "data", ""))
        children = list(getattr(node, "children", []))
        if (
            data == "member_dot_arg"
            and len(children) >= 2
            and str(children[1]) == "filter"
        ):
            return collection_source(children[0], local_sources)
        if data in {"member", "primary", "unary"} and len(children) == 1:
            return collection_source(children[0], local_sources)
        return None

    def walk(node: Any, local_sources: dict[str, tuple[str, str, str]]) -> None:
        data = str(getattr(node, "data", ""))
        children = list(getattr(node, "children", []))

        if data == "member_dot_arg" and len(children) >= 3:
            method = str(children[1])
            if method in MACRO_NAMES:
                walk(children[0], local_sources)
                arguments = list(getattr(children[2], "children", []))
                binder = _single_identifier(arguments[0]) if arguments else None
                source = collection_source(children[0], local_sources)
                nested_sources = dict(local_sources)
                if binder is not None and source is not None:
                    binding_name, entity_ref, cardinality = source
                    if cardinality != "many":
                        errors.append(
                            f"{rule_id}: CEL macro '{method}' iterates binding '{binding_name}', "
                            "which must declare cardinality: many"
                        )
                    nested_sources[binder] = (binding_name, entity_ref, "one")
                for argument in arguments[1:]:
                    walk(argument, nested_sources)
                return

        if data in {"member_dot", "member_index"}:
            path = _member_path(node)
            if data == "member_index" and path is None and children:
                base_path = _member_path(children[0])
                source = (
                    resolve_root(base_path[0], local_sources)
                    if base_path is not None and len(base_path) == 1
                    else None
                )
                if source is not None:
                    if source[2] == "many":
                        errors.append(
                            f"{rule_id}: many binding '{source[0]}' must be accessed through "
                            "a CEL collection macro"
                        )
                    else:
                        errors.append(
                            f"{rule_id}: Entity binding '{source[0]}' must use a static string "
                            "attribute index for traceability"
                        )
            if path is not None and len(path) >= 2:
                source = resolve_root(path[0], local_sources)
                if source is not None:
                    binding_name, entity_ref, cardinality = source
                    if cardinality == "many" and path[0] not in local_sources:
                        errors.append(
                            f"{rule_id}: many binding '{binding_name}' must be accessed through "
                            "a CEL collection macro"
                        )
                    accesses.add(
                        AttributeAccess(
                            entity_ref=entity_ref,
                            attribute=path[1],
                            binding=binding_name,
                        )
                    )
        for child in children:
            walk(child, local_sources)

    walk(ast, {})
    return sorted(accesses), _dedupe(errors)


def analyze_traceability(model: LoadedModel) -> tuple[dict[str, Any], list[str]]:
    """Build a deterministic attribute-lineage document and semantic diagnostics."""

    entities = model.entities_by_id
    accesses_by_rule: dict[str, list[AttributeAccess]] = {}
    errors: list[str] = []

    for entity in model.entities:
        entity_id = normalize(entity.get("id"))
        if entity_id is None:
            continue
        names: set[str] = set()
        for attribute in entity.get("attributes") or []:
            if not isinstance(attribute, dict) or not isinstance(
                attribute.get("name"), str
            ):
                continue
            name = str(attribute["name"])
            if name in names:
                errors.append(f"{entity_id}: duplicate attribute name '{name}'")
            names.add(name)

    for rule in model.rules:
        rule_id = normalize(rule.get("id"))
        if rule_id is None:
            continue
        accesses, access_errors = extract_rule_attribute_accesses(rule)
        accesses_by_rule[rule_id] = accesses
        errors.extend(access_errors)
        bindings = rule.get("bindings") or {}
        for access in accesses:
            attributes = entity_attributes(entities.get(access.entity_ref))
            if access.attribute not in attributes:
                errors.append(
                    f"{rule_id}: CEL binding '{access.binding}' reads unknown attribute "
                    f"'{access.entity_ref}#{access.attribute}'"
                )
            binding = (
                bindings.get(access.binding) if isinstance(bindings, dict) else None
            )
            if isinstance(binding, dict) and binding.get("ref") != access.entity_ref:
                errors.append(
                    f"{rule_id}: attribute access '{access.path}' does not match binding "
                    f"'{access.binding}'"
                )

    edges: list[dict[str, str]] = []
    constraints: list[dict[str, Any]] = []
    target_to_rule: dict[str, str] = {}
    accessed_paths = {
        access.path for accesses in accesses_by_rule.values() for access in accesses
    }

    for rule in model.rules:
        rule_id = normalize(rule.get("id"))
        if rule_id is None:
            continue
        accesses = accesses_by_rule.get(rule_id, [])
        if rule.get("kind") == "derivation":
            target = rule.get("target") or {}
            if not isinstance(target, dict):
                continue
            entity_ref = normalize(target.get("entityRef"))
            attribute_name = normalize(target.get("attribute"))
            if entity_ref is None or attribute_name is None:
                continue
            target_path = attribute_path(entity_ref, attribute_name)
            previous_rule = target_to_rule.get(target_path)
            if previous_rule is not None and previous_rule != rule_id:
                errors.append(
                    f"{target_path}: multiple derivation Rules target this attribute: "
                    f"'{previous_rule}', '{rule_id}'"
                )
            else:
                target_to_rule[target_path] = rule_id
            for access in accesses:
                edges.append(
                    {
                        "source": access.path,
                        "target": target_path,
                        "ruleRef": rule_id,
                    }
                )
        else:
            constraints.append(
                {
                    "ruleRef": rule_id,
                    "kind": str(rule.get("kind")),
                    "attributeRefs": sorted({access.path for access in accesses}),
                }
            )

    nodes: list[dict[str, Any]] = []
    for entity in sorted(model.entities, key=lambda item: str(item.get("id", ""))):
        entity_id = normalize(entity.get("id"))
        if entity_id is None:
            continue
        for attribute in sorted(
            (item for item in entity.get("attributes") or [] if isinstance(item, dict)),
            key=lambda item: str(item.get("name", "")),
        ):
            name = normalize(attribute.get("name"))
            if name is None:
                continue
            path = attribute_path(entity_id, name)
            derived_by = normalize(attribute.get("derivedByRuleRef"))
            include = (
                bool(attribute.get("keyData"))
                or derived_by is not None
                or path in accessed_paths
            )
            if not include:
                continue
            node: dict[str, Any] = {
                "path": path,
                "entityRef": entity_id,
                "attribute": name,
                "valueType": attribute.get("valueType"),
                "keyData": bool(attribute.get("keyData", False)),
                "origin": "derived" if derived_by is not None else "asserted",
            }
            if derived_by is not None:
                node["derivedByRuleRef"] = derived_by
            nodes.append(node)

            if derived_by is not None:
                matching_target = target_to_rule.get(path)
                if matching_target != derived_by:
                    errors.append(
                        f"{path}: derivedByRuleRef '{derived_by}' has no matching derivation target"
                    )
                if attribute.get("keyData") and not accesses_by_rule.get(derived_by):
                    errors.append(
                        f"{path}: key derived attribute must trace to at least one modeled Entity attribute"
                    )
                derivation_rule = model.rules_by_id.get(derived_by) or {}
                derivation_bindings = derivation_rule.get("bindings") or {}
                if not isinstance(derivation_bindings, dict):
                    derivation_bindings = {}
                used_variables: set[str] = set()
                expression = derivation_rule.get("expression")
                if Environment is not None and isinstance(expression, str):
                    with suppress(Exception):
                        used_variables = undeclared_cel_identifiers(
                            Environment().compile(expression), set()
                        )
                scalar_inputs = [
                    variable
                    for variable, binding in derivation_bindings.items()
                    if variable in used_variables
                    and isinstance(binding, dict)
                    and "type" in binding
                ]
                if attribute.get("keyData") and scalar_inputs:
                    errors.append(
                        f"{path}: key derivation scalar inputs {sorted(scalar_inputs)} must be "
                        "modeled as Evidence attributes"
                    )

    for target_path, rule_id in target_to_rule.items():
        entity_ref, _, attribute_name = target_path.partition("#")
        attribute = entity_attributes(entities.get(entity_ref)).get(attribute_name)
        if attribute is not None and attribute.get("derivedByRuleRef") != rule_id:
            errors.append(
                f"{target_path}: derivation Rule '{rule_id}' must be declared by derivedByRuleRef"
            )

    errors.extend(_lineage_cycle_errors(edges))
    document = {
        "schemaVersion": "2.0",
        "modelId": model.manifest.get("id") if model.manifest else None,
        "nodes": sorted(nodes, key=lambda item: item["path"]),
        "edges": sorted(
            edges, key=lambda item: (item["target"], item["source"], item["ruleRef"])
        ),
        "constraints": sorted(constraints, key=lambda item: item["ruleRef"]),
    }
    return document, _dedupe(errors)


def _lineage_cycle_errors(edges: list[dict[str, str]]) -> list[str]:
    adjacency: dict[str, set[str]] = {}
    for edge in edges:
        adjacency.setdefault(edge["source"], set()).add(edge["target"])

    visiting: list[str] = []
    active: set[str] = set()
    complete: set[str] = set()
    cycles: set[tuple[str, ...]] = set()

    def walk(node: str) -> None:
        if node in complete:
            return
        if node in active:
            start = visiting.index(node)
            cycles.add((*visiting[start:], node))
            return
        active.add(node)
        visiting.append(node)
        for target in sorted(adjacency.get(node, set())):
            walk(target)
        visiting.pop()
        active.remove(node)
        complete.add(node)

    for node in sorted(adjacency):
        walk(node)
    return [
        f"attribute lineage cycle: {' -> '.join(cycle)}" for cycle in sorted(cycles)
    ]


def _dedupe(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))
