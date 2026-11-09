"""Rebuild a responsibility scope from the single FM source; never persist a second model."""
from __future__ import annotations

from dataclasses import replace
from typing import Any

from fm_model import (
    LoadedModel,
    entity_signature,
    fulfillment_members,
    normalize,
    validate_model,
)
from fm_simulation import ValidationSuite


def references(value: Any) -> set[str]:
    result: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith("Ref") or key == "ref":
                if isinstance(item, str):
                    result.add(item)
            elif (key.endswith("Refs") or key == "basedOn") and isinstance(item, list):
                result.update(ref for ref in item if isinstance(ref, str))
            else:
                result.update(references(item))
    elif isinstance(value, list):
        for item in value:
            result.update(references(item))
    return result


def select_scope(model: LoadedModel, scope_refs: list[str]) -> LoadedModel:
    """Include whole independent contexts, descendants and real outbound dependencies.

    A child stage or a Fulfillment cannot be selected to hide another obligation of
    the same contract. A shared Participant does not pull in unrelated contracts.
    An unresolved Context Role is retained; its player is never invented.
    """
    entities = model.entities_by_id
    objects = {**entities, **model.rules_by_id, **model.relationships_by_id}
    contexts: set[str] = set()
    members: set[str] = set()

    def include(ref: str) -> None:
        item = objects.get(ref)
        if item is None:
            return
        members.add(ref)
        context = item if item.get("category") == "context" else entities.get(str(item.get("contextRef")))
        seen: set[str] = set()
        while context and context.get("id") not in seen:
            context_id = str(context["id"])
            seen.add(context_id)
            contexts.add(context_id)
            context = entities.get(str(context.get("parentContextRef")))

    if not scope_refs or len(set(scope_refs)) != len(scope_refs):
        raise ValueError("scopeRefs must contain distinct independent Context IDs")
    for ref in scope_refs:
        context = entities.get(ref)
        if entity_signature(context)[0] != "context" or (context or {}).get("parentContextRef"):
            raise ValueError(f"scope '{ref}' must be an independent Context, not a fulfillment slice")
        include(ref)
    previous: tuple[frozenset[str], frozenset[str]] | None = None
    relations: list[dict[str, Any]] = []
    while previous != (frozenset(members), frozenset(contexts)):
        previous = (frozenset(members), frozenset(contexts))
        for ref, item in objects.items():
            if ref in contexts or item.get("contextRef") in contexts or item.get("parentContextRef") in contexts:
                include(ref)
        for ref in list(members):
            for dependency in references(objects[ref]):
                include(dependency)
        relations = []
        for relation in model.relationships:
            source, target = relation.get("sourceRef"), relation.get("targetRef")
            source_item = objects.get(str(source), {})
            outgoing = source in members and entity_signature(source_item) != ("participant", "party")
            player = relation.get("kind") == "plays_role" and target in members
            if outgoing or player or (source in members and target in members):
                relations.append(relation)
                include(str(relation["id"]))
                for dependency in references(relation):
                    include(dependency)
    manifest = dict(model.manifest or {})
    manifest["entryContextRefs"] = list(scope_refs)
    return replace(
        model, manifest=manifest,
        entities=[item for item in model.entities if item.get("id") in members],
        relationships=relations,
        rules=[item for item in model.rules if item.get("id") in members],
    )


def scope_suite(model: LoadedModel, suite: ValidationSuite) -> ValidationSuite:
    entities, rules = model.entities_by_id, model.rules_by_id
    instances = suite.instances_by_id
    scenarios = [
        scenario for scenario in suite.scenarios
        if any(ref in rules for ref in references(scenario))
        or any(instances.get(ref, {}).get("entityRef") in entities for ref in references(scenario))
    ]
    needed = set().union(*(references(scenario) for scenario in scenarios)) if scenarios else set()
    previous: set[str] = set()
    while needed != previous:
        previous = set(needed)
        for ref in list(needed):
            needed.update(references(instances.get(ref)))
    return replace(suite, scenarios=scenarios, instances=[item for item in suite.instances if item.get("id") in needed])


def simulation_rules(model: LoadedModel) -> tuple[list[dict[str, Any]], list[str]]:
    """Evidence Instances cannot execute Thing/Participant or capability behavior."""
    entities = model.entities_by_id
    has_evidence = any(item.get("category") == "evidence" for item in model.entities)
    applicable, limitations = [], []
    for rule in model.rules:
        refs = [binding["ref"] for binding in rule.get("bindings", {}).values() if "ref" in binding]
        target = rule.get("target", {}).get("entityRef")
        if target:
            refs.append(target)
        supported = has_evidence and all(
            entity_signature(entities.get(ref)) in {
                ("evidence", "rfp"), ("evidence", "proposal"), ("evidence", "contract"),
                ("evidence", "fulfillment_request"), ("evidence", "fulfillment_confirmation"),
                ("evidence", "other_evidence"), ("role", "evidence"),
            } for ref in refs
        )
        if supported:
            applicable.append(rule)
        else:
            limitations.append(f"{rule['id']}: behavior is not executed by the Evidence Instance simulator")
    return applicable, limitations


def pairing_gaps(model: LoadedModel) -> list[str]:
    """Both Contract Parties must each claim a main Fulfillment as the right holder.

    A Contract only exists between two Parties, and a Fulfillment Request is issued by
    the right holder against the other Party. Requiring a claim from each Party keeps
    both obligation directions in the same Contract; it is a scope gap so that a single
    identified direction can still be saved and checked while the other is unclear.
    """
    entities = model.entities_by_id
    claimants: dict[str, set[str]] = {}
    contexts_with_requests: set[str] = set()
    requests = [
        item for item in model.entities
        if entity_signature(item) == ("evidence", "fulfillment_request")
    ]
    for request in requests:
        context_ref = str(request.get("contextRef"))
        contexts_with_requests.add(context_ref)
        role_ref = normalize(request.get("responsibleRoleRef"))
        if role_ref is not None:
            claimants.setdefault(context_ref, set()).add(role_ref)
    gaps: list[str] = []
    for context in model.entities:
        if entity_signature(context) != ("context", "contract"):
            continue
        if str(context["id"]) not in contexts_with_requests:
            continue  # Reported as the missing primary Fulfillment gap instead.
        contracts = [
            entities[ref]
            for ref in context.get("rootRefs") or []
            if entity_signature(entities.get(str(ref))) == ("evidence", "contract")
        ]
        if len(contracts) != 1:
            continue  # Reported as a consistency error by the Context root check.
        claimed = claimants.get(str(context["id"]), set())
        for role_ref in contracts[0].get("roleRefs") or []:
            if str(role_ref) in claimed:
                continue
            gaps.append(
                f"{context['id']}: primary Fulfillments must cover both Contract Parties; "
                f"Party Role '{role_ref}' is not the right holder of any Fulfillment Request"
            )
    return gaps


def completeness_gaps(model: LoadedModel) -> list[str]:
    consistent_errors = set(validate_model(model))
    gaps = [error for error in validate_model(model, complete=True) if error not in consistent_errors]
    requests = [
        item for item in model.entities
        if entity_signature(item) == ("evidence", "fulfillment_request")
    ]
    contexts_with_requests = {str(item.get("contextRef")) for item in requests}
    for entity in model.entities:
        if entity_signature(entity) == ("context", "contract") and str(entity["id"]) not in contexts_with_requests:
            gaps.append(f"{entity['id']}: Contract Context requires its primary Fulfillment Request before scope completion")
    gaps.extend(pairing_gaps(model))
    return gaps


def ready_scope(model: LoadedModel, report: dict[str, Any]) -> LoadedModel:
    """Consume checked scope identity, not a bare `valid: true` or human approval."""
    if not (
        report.get("checkVersion") == 5
        and report.get("consistent") is True and report.get("complete") is True
        and report.get("valid") is True and report.get("errors") == []
        and report.get("gaps") == [] and report.get("inputChanged") is False
        and (report.get("simulationPassed") is True or report.get("scenarioRequirement") == "not-applicable")
        and isinstance(report.get("scopeRefs"), list)
        and all(isinstance(ref, str) for ref in report["scopeRefs"])
    ):
        raise ValueError("FM needs a successful scope completeness check; consistency is not delivery readiness or human confirmation")
    selected = select_scope(model, report["scopeRefs"])
    actual = sorted(item["id"] for item in selected.entities if item.get("category") == "context")
    if actual != report.get("contextRefs"):
        raise ValueError("FM checked scope dependencies do not match current source")
    rules, _ = simulation_rules(selected)
    requirement = "required" if rules or selected.requests_by_id else "not-applicable"
    if report.get("scenarioRequirement") != requirement:
        raise ValueError("FM scenario applicability does not match checked scope")
    if requirement == "required" and not (
        report.get("simulationPassed") is True
        and type(report.get("scenarioCount")) is int
        and report["scenarioCount"] > 0
        and type(report.get("executedScenarioCount")) is int
        and report["executedScenarioCount"] == report["scenarioCount"]
    ):
        raise ValueError("FM scope requires all applicable scenarios to have executed successfully")
    return selected
