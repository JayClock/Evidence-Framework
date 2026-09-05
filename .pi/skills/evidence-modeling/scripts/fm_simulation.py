#!/usr/bin/env python3
"""Deterministic evidence-instance simulation for FM Schema v2."""

from __future__ import annotations

import copy
import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

try:
    from celpy import Environment, celtypes  # pyright: ignore[reportMissingImports]
    from celpy.adapter import json_to_cel  # pyright: ignore[reportMissingImports]
except ImportError:  # pragma: no cover
    Environment = None  # type: ignore[assignment,misc]
    celtypes = None  # type: ignore[assignment]
    json_to_cel = None  # type: ignore[assignment]

from fm_model import (
    ID_RE,
    LoadedModel,
    entity_signature,
    expected_filename,
    load_single_yaml,
    normalize,
    validate_against_schema,
)
from fm_traceability import entity_attributes


@dataclass
class ValidationSuite:
    root: Path
    instances: list[dict[str, Any]] = field(default_factory=list)
    scenarios: list[dict[str, Any]] = field(default_factory=list)
    files_by_id: dict[str, Path] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    @property
    def instances_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(instance["id"]): instance
            for instance in self.instances
            if isinstance(instance.get("id"), str)
        }

    @property
    def scenarios_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(scenario["id"]): scenario
            for scenario in self.scenarios
            if isinstance(scenario.get("id"), str)
        }


def load_validation_suite(model_root: Path) -> ValidationSuite:
    validation_root = model_root / "validation"
    suite = ValidationSuite(root=validation_root.resolve())
    if not validation_root.exists():
        return suite
    if not validation_root.is_dir():
        suite.errors.append("validation must be a directory")
        return suite

    specifications = (
        (
            "instances",
            "evidence_instance",
            "evidence-instance.schema.json",
            suite.instances,
        ),
        ("scenarios", "fm_scenario", "scenario.schema.json", suite.scenarios),
    )
    for directory_name, expected_type, schema_name, collection in specifications:
        directory = validation_root / directory_name
        if not directory.is_dir():
            suite.errors.append(f"validation/{directory_name}/ directory is required")
            continue
        for path in sorted(directory.iterdir()):
            rel_path = path.relative_to(model_root).as_posix()
            if path.is_dir():
                suite.errors.append(f"{rel_path}: nested directories are not allowed")
                continue
            if path.suffix != ".yaml":
                suite.errors.append(f"{rel_path}: only .yaml files are allowed")
                continue
            document = load_single_yaml(path, suite.errors)
            if document is None:
                continue
            if document.get("type") != expected_type:
                suite.errors.append(
                    f"{rel_path}: type must be '{expected_type}', found {document.get('type')!r}"
                )
            validate_against_schema(document, schema_name, rel_path, suite.errors)
            object_id = document.get("id")
            if isinstance(object_id, str) and ID_RE.fullmatch(object_id):
                expected = expected_filename(object_id)
                if path.name != expected:
                    suite.errors.append(
                        f"{rel_path}: filename must be '{expected}' for id '{object_id}'"
                    )
                previous = suite.files_by_id.get(object_id)
                if previous is not None:
                    suite.errors.append(
                        f"duplicate validation id '{object_id}' in "
                        f"{previous.relative_to(model_root)} and {rel_path}"
                    )
                else:
                    suite.files_by_id[object_id] = path
            collection.append(document)
    if not suite.instances:
        suite.errors.append(
            "validation/instances/ must contain at least one Evidence Instance"
        )
    if not suite.scenarios:
        suite.errors.append("validation/scenarios/ must contain at least one Scenario")
    return suite


def validate_validation_suite(model: LoadedModel, suite: ValidationSuite) -> list[str]:
    errors = list(suite.errors)
    entities = model.entities_by_id
    fulfillments = model.fulfillments_by_id
    rules = model.rules_by_id
    instances = suite.instances_by_id

    for instance in suite.instances:
        instance_id = normalize(instance.get("id"))
        if instance_id is None:
            continue
        entity_ref = normalize(instance.get("entityRef"))
        entity = entities.get(entity_ref or "")
        if entity_signature(entity)[0] != "evidence":
            errors.append(
                f"{instance_id}: entityRef must reference an Evidence Entity, found '{entity_ref}'"
            )
            continue
        values = instance.get("values") or {}
        if not isinstance(values, dict):
            continue
        attributes = entity_attributes(entity)
        for name in values:
            if name not in attributes:
                errors.append(f"{instance_id}: unknown value '{entity_ref}#{name}'")
        for name, attribute in attributes.items():
            if (
                attribute.get("required")
                and not attribute.get("derivedByRuleRef")
                and name not in values
            ):
                errors.append(
                    f"{instance_id}: required asserted value '{entity_ref}#{name}' is missing"
                )
            if name in values:
                value_error = validate_typed_value(
                    values[name], str(attribute.get("valueType"))
                )
                if value_error is not None:
                    errors.append(f"{instance_id}.{name}: {value_error}")
        for based_on in instance.get("basedOn") or []:
            if based_on == instance_id:
                errors.append(f"{instance_id}: basedOn must not reference itself")
            elif based_on not in instances:
                errors.append(
                    f"{instance_id}: basedOn references unknown instance '{based_on}'"
                )

    for scenario in suite.scenarios:
        scenario_id = normalize(scenario.get("id"))
        if scenario_id is None:
            continue
        if parse_timestamp(scenario.get("asOf")) is None:
            errors.append(f"{scenario_id}: asOf must be an RFC 3339 timestamp")
        as_of = scenario.get("asOf")
        review = scenario.get("stakeholderReview") or {}
        if not isinstance(review, dict):
            review = {}
        if (
            review.get("status") in {"confirmed", "rejected"}
            and parse_timestamp(review.get("reviewedAt")) is None
        ):
            errors.append(
                f"{scenario_id}: stakeholderReview.reviewedAt must be an RFC 3339 timestamp"
            )

        given = list(scenario.get("givenInstanceRefs") or [])
        given_set = set(given)
        visibility_by_instance: dict[str, set[str]] = {
            str(instance_ref): set(given_set) for instance_ref in given
        }
        issued: set[str] = set()
        for instance_ref in given:
            if instance_ref not in instances:
                errors.append(
                    f"{scenario_id}: givenInstanceRefs contains unknown '{instance_ref}'"
                )
            elif instance_ref in issued:
                errors.append(
                    f"{scenario_id}: instance '{instance_ref}' is issued more than once"
                )
            else:
                given_instance = instances[instance_ref]
                missing_basis = set(given_instance.get("basedOn") or []) - given_set
                if missing_basis:
                    errors.append(
                        f"{scenario_id}: given instance '{instance_ref}' has unavailable basedOn "
                        f"instances {sorted(missing_basis)}"
                    )
                entity = entities.get(str(given_instance.get("entityRef")))
                values = given_instance.get("values") or {}
                for name, attribute in entity_attributes(entity).items():
                    if attribute.get("required") and name not in values:
                        errors.append(
                            f"{scenario_id}: given instance '{instance_ref}' lacks completed "
                            f"required value '{given_instance.get('entityRef')}#{name}'"
                        )
            issued.add(instance_ref)

        sequences: set[int] = set()
        previous_sequence = 0
        for step in scenario.get("steps") or []:
            if not isinstance(step, dict):
                continue
            sequence = step.get("sequence")
            if isinstance(sequence, int):
                if sequence in sequences:
                    errors.append(f"{scenario_id}: duplicate step sequence {sequence}")
                if sequence <= previous_sequence:
                    errors.append(
                        f"{scenario_id}: steps must be ordered by increasing sequence"
                    )
                sequences.add(sequence)
                previous_sequence = sequence
            instance_ref = normalize(step.get("issueInstanceRef"))
            acting_role_ref = normalize(step.get("actingRoleRef"))
            instance = instances.get(instance_ref or "")
            role = entities.get(acting_role_ref or "")
            if entity_signature(role)[0] != "role":
                errors.append(
                    f"{scenario_id}.steps[{sequence}]: actingRoleRef references unknown Role "
                    f"'{acting_role_ref}'"
                )
            if instance is None:
                errors.append(
                    f"{scenario_id}.steps[{sequence}]: issueInstanceRef references unknown instance "
                    f"'{instance_ref}'"
                )
                continue
            if instance_ref in issued:
                errors.append(
                    f"{scenario_id}: instance '{instance_ref}' is issued more than once"
                )
            entity = entities.get(str(instance.get("entityRef")))
            expected_role = (
                normalize(entity.get("responsibleRoleRef")) if entity else None
            )
            if expected_role is not None and acting_role_ref != expected_role:
                errors.append(
                    f"{scenario_id}.steps[{sequence}]: acting Role '{acting_role_ref}' must equal "
                    f"Evidence responsibleRoleRef '{expected_role}'"
                )
            if entity_signature(entity) == ("evidence", "contract"):
                role_refs = set(entity.get("roleRefs") or []) if entity else set()
                if acting_role_ref not in role_refs:
                    errors.append(
                        f"{scenario_id}.steps[{sequence}]: Contract may only be issued by one of "
                        f"its roleRefs"
                    )
            for dependency in instance.get("basedOn") or []:
                if dependency not in issued:
                    errors.append(
                        f"{scenario_id}.steps[{sequence}]: basedOn instance '{dependency}' "
                        "must already be available"
                    )
            visible_refs = (
                step.get("availableInstanceRefs")
                if "availableInstanceRefs" in step
                else instance.get("basedOn")
            )
            visible = set(visible_refs or [])
            for available in sorted(visible):
                if available not in issued:
                    errors.append(
                        f"{scenario_id}.steps[{sequence}]: available instance '{available}' "
                        "has not been issued"
                    )
            hidden_basis = set(instance.get("basedOn") or []) - visible
            if hidden_basis:
                errors.append(
                    f"{scenario_id}.steps[{sequence}]: acting Role cannot see required basedOn "
                    f"instances {sorted(hidden_basis)}"
                )
            visibility_by_instance[str(instance_ref)] = visible
            issued.add(str(instance_ref))

        manual_refs = set(scenario.get("manualCompletionRequestRefs") or [])
        for instance_ref in sorted(manual_refs):
            instance = instances.get(str(instance_ref))
            if instance_ref not in issued:
                errors.append(
                    f"{scenario_id}: manual completion references unissued instance '{instance_ref}'"
                )
            elif instance is None or not any(
                fulfillment.get("requestRef") == instance.get("entityRef")
                and isinstance(fulfillment.get("completionPolicy"), dict)
                and fulfillment["completionPolicy"].get("mode") == "manual"
                for fulfillment in model.fulfillments
            ):
                errors.append(
                    f"{scenario_id}: manual completion '{instance_ref}' must identify a Request "
                    "for a manual-completion Fulfillment"
                )

        for index, evaluation in enumerate(scenario.get("evaluations") or []):
            if not isinstance(evaluation, dict):
                continue
            rule_ref = normalize(evaluation.get("ruleRef"))
            rule = rules.get(rule_ref or "")
            if rule is None:
                errors.append(
                    f"{scenario_id}.evaluations[{index}]: unknown Rule '{rule_ref}'"
                )
                continue
            expected_error = validate_typed_value(
                evaluation.get("expectedResult"), str(rule.get("resultType"))
            )
            if expected_error is not None:
                errors.append(
                    f"{scenario_id}.evaluations[{index}].expectedResult: {expected_error}"
                )
            supplied = evaluation.get("bindings") or {}
            expected_bindings = rule.get("bindings") or {}
            if isinstance(supplied, dict) and isinstance(expected_bindings, dict):
                implicit_as_of = {
                    variable
                    for variable, binding in expected_bindings.items()
                    if isinstance(binding, dict)
                    and binding.get("type") == "timestamp"
                    and variable in {"asOf", "now"}
                }
                missing = sorted(
                    set(expected_bindings) - set(supplied) - implicit_as_of
                )
                extra = sorted(set(supplied) - set(expected_bindings))
                if missing:
                    errors.append(
                        f"{scenario_id}.evaluations[{index}]: missing bindings {missing} for '{rule_ref}'"
                    )
                if extra:
                    errors.append(
                        f"{scenario_id}.evaluations[{index}]: unknown bindings {extra} for '{rule_ref}'"
                    )
                for variable, source in supplied.items():
                    binding = expected_bindings.get(variable)
                    if not isinstance(source, dict) or not isinstance(binding, dict):
                        continue
                    if "instanceRef" in source:
                        validate_instance_binding(
                            scenario_id,
                            index,
                            variable,
                            [source["instanceRef"]],
                            "one",
                            binding,
                            instances,
                            issued,
                            errors,
                        )
                    elif "instanceRefs" in source:
                        validate_instance_binding(
                            scenario_id,
                            index,
                            variable,
                            source["instanceRefs"],
                            "many",
                            binding,
                            instances,
                            issued,
                            errors,
                        )
                    elif "value" in source:
                        if variable in implicit_as_of and source.get("value") != as_of:
                            errors.append(
                                f"{scenario_id}.evaluations[{index}]: binding '{variable}' must "
                                "equal the Scenario asOf timestamp"
                            )
                        if "type" not in binding:
                            errors.append(
                                f"{scenario_id}.evaluations[{index}]: binding '{variable}' expects "
                                "Evidence instance input"
                            )
                        else:
                            value_error = validate_typed_value(
                                source.get("value"), str(binding.get("type"))
                            )
                            if value_error is not None:
                                errors.append(
                                    f"{scenario_id}.evaluations[{index}].bindings.{variable}: "
                                    f"{value_error}"
                                )
            target_instance_ref = normalize(evaluation.get("targetInstanceRef"))
            if rule.get("kind") == "derivation":
                if target_instance_ref is None:
                    errors.append(
                        f"{scenario_id}.evaluations[{index}]: derivation '{rule_ref}' requires "
                        "targetInstanceRef"
                    )
                else:
                    target_instance = instances.get(target_instance_ref)
                    target = rule.get("target") or {}
                    if not isinstance(target, dict):
                        target = {}
                    if target_instance is None or target_instance_ref not in issued:
                        errors.append(
                            f"{scenario_id}.evaluations[{index}]: target instance "
                            f"'{target_instance_ref}' is unknown or unissued"
                        )
                    elif target_instance.get("entityRef") != target.get("entityRef"):
                        errors.append(
                            f"{scenario_id}.evaluations[{index}]: target instance Entity must be "
                            f"'{target.get('entityRef')}'"
                        )
                    source_refs = evaluation_instance_refs(evaluation) - {
                        target_instance_ref
                    }
                    hidden_sources = source_refs - visibility_by_instance.get(
                        target_instance_ref, set()
                    )
                    if hidden_sources:
                        errors.append(
                            f"{scenario_id}.evaluations[{index}]: derivation target "
                            f"'{target_instance_ref}' uses Evidence unavailable to its acting Role: "
                            f"{sorted(hidden_sources)}"
                        )
            elif target_instance_ref is not None:
                errors.append(
                    f"{scenario_id}.evaluations[{index}]: only derivation evaluation may define "
                    "targetInstanceRef"
                )

        expectations = scenario.get("expectations") or {}
        if not isinstance(expectations, dict):
            expectations = {}
        for expectation in expectations.get("fulfillmentStatuses") or []:
            if not isinstance(expectation, dict):
                continue
            fulfillment_ref = normalize(expectation.get("fulfillmentRef"))
            request_instance_ref = normalize(expectation.get("requestInstanceRef"))
            fulfillment = fulfillments.get(fulfillment_ref or "")
            if fulfillment is None:
                errors.append(f"{scenario_id}: unknown Fulfillment '{fulfillment_ref}'")
                continue
            request_instance = instances.get(request_instance_ref or "")
            if request_instance is None:
                errors.append(
                    f"{scenario_id}: unknown request instance '{request_instance_ref}'"
                )
            elif request_instance.get("entityRef") != fulfillment.get("requestRef"):
                errors.append(
                    f"{scenario_id}: request instance '{request_instance_ref}' does not instantiate "
                    f"'{fulfillment.get('requestRef')}'"
                )

    return dedupe(errors)


def validate_instance_binding(
    scenario_id: str,
    evaluation_index: int,
    variable: str,
    instance_refs: list[Any],
    supplied_cardinality: str,
    binding: dict[str, Any],
    instances: dict[str, dict[str, Any]],
    issued: set[str],
    errors: list[str],
) -> None:
    expected_cardinality = str(binding.get("cardinality", "one"))
    if "ref" not in binding:
        errors.append(
            f"{scenario_id}.evaluations[{evaluation_index}]: binding '{variable}' expects a scalar value"
        )
        return
    if supplied_cardinality != expected_cardinality:
        errors.append(
            f"{scenario_id}.evaluations[{evaluation_index}]: binding '{variable}' expects "
            f"cardinality '{expected_cardinality}', found '{supplied_cardinality}'"
        )
    for instance_ref in instance_refs:
        instance = instances.get(str(instance_ref))
        if instance is None or instance_ref not in issued:
            errors.append(
                f"{scenario_id}.evaluations[{evaluation_index}]: binding '{variable}' references "
                f"unknown or unissued instance '{instance_ref}'"
            )
        elif instance.get("entityRef") != binding.get("ref"):
            errors.append(
                f"{scenario_id}.evaluations[{evaluation_index}]: instance '{instance_ref}' must "
                f"instantiate '{binding.get('ref')}'"
            )


def simulate_scenario(
    model: LoadedModel, suite: ValidationSuite, scenario: dict[str, Any]
) -> dict[str, Any]:
    scenario_id = str(scenario.get("id", "<unknown-scenario>"))
    instances = copy.deepcopy(suite.instances_by_id)
    for instance in instances.values():
        entity = model.entities_by_id.get(str(instance.get("entityRef")))
        instance["_attributeTypes"] = {
            name: attribute.get("valueType")
            for name, attribute in entity_attributes(entity).items()
        }
    issued_order = [str(item) for item in scenario.get("givenInstanceRefs") or []]
    issued_order.extend(
        str(step.get("issueInstanceRef"))
        for step in scenario.get("steps") or []
        if isinstance(step, dict)
    )
    issued = set(issued_order)
    errors: list[str] = []
    evaluation_results: list[dict[str, Any]] = []
    rule_results: dict[str, list[dict[str, Any]]] = {}

    if Environment is None or celtypes is None:
        errors.append("cel-python is required for scenario simulation")
    else:
        environment = Environment()
        for index, evaluation in enumerate(scenario.get("evaluations") or []):
            if not isinstance(evaluation, dict):
                continue
            rule_ref = str(evaluation.get("ruleRef"))
            rule = model.rules_by_id.get(rule_ref)
            if rule is None:
                continue
            try:
                activation = build_activation(
                    rule, evaluation, instances, str(scenario.get("asOf"))
                )
                ast = environment.compile(str(rule["expression"]))
                result = environment.program(ast).evaluate(activation)
                normalized_result = from_cel_value(result)
                result_error = validate_typed_value(
                    normalized_result, str(rule.get("resultType"))
                )
                if result_error is not None:
                    errors.append(
                        f"{scenario_id}.evaluations[{index}]: Rule '{rule_ref}' result "
                        f"{result_error}"
                    )
                expected_result = normalize_json_value(evaluation.get("expectedResult"))
                results_match = (
                    result_error is None
                    and normalize_json_value(normalized_result) == expected_result
                )
                if not results_match:
                    errors.append(
                        f"{scenario_id}.evaluations[{index}]: Rule '{rule_ref}' returned "
                        f"{normalized_result!r}, expected {evaluation.get('expectedResult')!r}"
                    )
                if rule.get("kind") == "derivation" and result_error is None:
                    apply_derivation(
                        rule,
                        evaluation,
                        instances,
                        normalized_result,
                        errors,
                        scenario_id,
                        index,
                    )
                if result_error is None:
                    rule_results.setdefault(rule_ref, []).append(
                        {
                            "result": normalized_result,
                            "instanceRefs": evaluation_instance_refs(evaluation),
                        }
                    )
                evaluation_results.append(
                    {
                        "ruleRef": rule_ref,
                        "result": normalize_json_value(normalized_result),
                        "passed": results_match,
                    }
                )
            except (
                Exception
            ) as error:  # cel-python raises several evaluation-specific types
                errors.append(
                    f"{scenario_id}.evaluations[{index}]: cannot evaluate Rule '{rule_ref}': {error}"
                )

    for instance_ref in issued_order:
        instance = instances.get(instance_ref)
        if instance is None:
            continue
        entity = model.entities_by_id.get(str(instance.get("entityRef")))
        values = instance.get("values") or {}
        for name, attribute in entity_attributes(entity).items():
            if attribute.get("required") and name not in values:
                errors.append(
                    f"{scenario_id}: issued instance '{instance_ref}' lacks required value "
                    f"'{instance.get('entityRef')}#{name}' after derivations"
                )

    status_results: list[dict[str, Any]] = []
    for expectation in (scenario.get("expectations") or {}).get(
        "fulfillmentStatuses"
    ) or []:
        if not isinstance(expectation, dict):
            continue
        fulfillment_ref = str(expectation.get("fulfillmentRef"))
        request_instance_ref = str(expectation.get("requestInstanceRef"))
        actual = fulfillment_status(
            model,
            instances,
            issued,
            fulfillment_ref,
            request_instance_ref,
            rule_results,
            set(scenario.get("manualCompletionRequestRefs") or []),
        )
        expected = str(expectation.get("status"))
        passed = actual == expected
        if not passed:
            errors.append(
                f"{scenario_id}: Fulfillment '{fulfillment_ref}' for '{request_instance_ref}' "
                f"is '{actual}', expected '{expected}'"
            )
        status_results.append(
            {
                "fulfillmentRef": fulfillment_ref,
                "requestInstanceRef": request_instance_ref,
                "status": actual,
                "expectedStatus": expected,
                "passed": passed,
            }
        )

    stakeholder_review = scenario.get("stakeholderReview") or {"status": "pending"}
    return {
        "scenarioId": scenario_id,
        "asOf": normalize_json_value(scenario.get("asOf")),
        "machineValidated": True,
        "simulationPassed": not errors,
        "stakeholderReview": stakeholder_review,
        "issuedInstanceRefs": issued_order,
        "instanceValues": [
            {
                "instanceRef": instance_ref,
                "entityRef": instances[instance_ref].get("entityRef"),
                "values": normalize_json_value(
                    instances[instance_ref].get("values") or {}
                ),
            }
            for instance_ref in issued_order
            if instance_ref in instances
        ],
        "evaluations": evaluation_results,
        "fulfillmentStatuses": status_results,
        "errors": dedupe(errors),
    }


def simulate_validation_suite(
    model: LoadedModel,
    suite: ValidationSuite,
    scenario_ids: Iterable[str] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    static_errors = validate_validation_suite(model, suite)
    requested = set(scenario_ids or [])
    if requested:
        missing = sorted(requested - set(suite.scenarios_by_id))
        static_errors.extend(
            f"unknown scenario id '{scenario_id}'" for scenario_id in missing
        )
    scenarios = [
        scenario
        for scenario in suite.scenarios
        if not requested or scenario.get("id") in requested
    ]
    results = (
        []
        if static_errors
        else [simulate_scenario(model, suite, scenario) for scenario in scenarios]
    )
    errors = [*static_errors]
    for result in results:
        errors.extend(result["errors"])
    document = {
        "schemaVersion": "2.0",
        "modelId": model.manifest.get("id") if model.manifest else None,
        "machineValidated": not static_errors,
        "simulationPassed": not errors,
        "scenarioResults": sorted(results, key=lambda item: item["scenarioId"]),
        "errors": dedupe(errors),
    }
    if not errors:
        validate_against_schema(
            document,
            "simulation-report.schema.json",
            "generated/simulation.json",
            errors,
        )
        document["machineValidated"] = not errors
        document["simulationPassed"] = not errors
        document["errors"] = dedupe(errors)
    return document, dedupe(errors)


def build_activation(
    rule: dict[str, Any],
    evaluation: dict[str, Any],
    instances: dict[str, dict[str, Any]],
    as_of: str,
) -> dict[str, Any]:
    assert celtypes is not None and json_to_cel is not None
    activation: dict[str, Any] = {}
    rule_bindings = rule.get("bindings") or {}
    for variable, source in (evaluation.get("bindings") or {}).items():
        binding = rule_bindings.get(variable) or {}
        if "instanceRef" in source:
            instance = instances[str(source["instanceRef"])]
            activation[variable] = instance_to_cel(instance)
        elif "instanceRefs" in source:
            activation[variable] = celtypes.ListType(
                [instance_to_cel(instances[str(ref)]) for ref in source["instanceRefs"]]
            )
        else:
            activation[variable] = typed_to_cel(
                source.get("value"), str(binding.get("type", "dynamic"))
            )
    for variable, binding in rule_bindings.items():
        if (
            variable not in activation
            and isinstance(binding, dict)
            and binding.get("type") == "timestamp"
            and variable in {"asOf", "now"}
        ):
            activation[variable] = typed_to_cel(as_of, "timestamp")
    return activation


def instance_to_cel(instance: dict[str, Any]) -> Any:
    assert celtypes is not None
    entity_ref = str(instance.get("entityRef"))
    # Attribute types are attached temporarily by simulate_scenario before conversion when needed.
    type_map = instance.get("_attributeTypes") or {}
    values = instance.get("values") or {}
    converted = {
        celtypes.StringType(str(name)): typed_to_cel(
            value, str(type_map.get(name, "dynamic"))
        )
        for name, value in values.items()
    }
    converted[celtypes.StringType("id")] = celtypes.StringType(str(instance.get("id")))
    converted[celtypes.StringType("entityRef")] = celtypes.StringType(entity_ref)
    return celtypes.MapType(converted)


def apply_derivation(
    rule: dict[str, Any],
    evaluation: dict[str, Any],
    instances: dict[str, dict[str, Any]],
    result: Any,
    errors: list[str],
    scenario_id: str,
    evaluation_index: int,
) -> None:
    target_instance_ref = str(evaluation.get("targetInstanceRef"))
    instance = instances.get(target_instance_ref)
    if instance is None:
        return
    target = rule.get("target") or {}
    attribute = str(target.get("attribute"))
    values = instance.setdefault("values", {})
    if attribute in values and normalize_json_value(
        values[attribute]
    ) != normalize_json_value(result):
        errors.append(
            f"{scenario_id}.evaluations[{evaluation_index}]: derived value for "
            f"'{target_instance_ref}#{attribute}' conflicts with asserted value"
        )
        return
    values[attribute] = result


def evaluation_instance_refs(evaluation: dict[str, Any]) -> set[str]:
    refs: set[str] = set()
    target_ref = evaluation.get("targetInstanceRef")
    if target_ref:
        refs.add(str(target_ref))
    bindings = evaluation.get("bindings") or {}
    if not isinstance(bindings, dict):
        return refs
    for value in bindings.values():
        if not isinstance(value, dict):
            continue
        if value.get("instanceRef"):
            refs.add(str(value["instanceRef"]))
        refs.update(str(ref) for ref in value.get("instanceRefs") or [])
    return refs


def instance_descends_from(
    instance_ref: str,
    ancestor_ref: str,
    instances: dict[str, dict[str, Any]],
    seen: set[str] | None = None,
) -> bool:
    if instance_ref == ancestor_ref:
        return True
    visited = set(seen or set())
    if instance_ref in visited:
        return False
    visited.add(instance_ref)
    instance = instances.get(instance_ref) or {}
    return any(
        instance_descends_from(str(parent), ancestor_ref, instances, visited)
        for parent in instance.get("basedOn") or []
    )


def scoped_rule_results(
    records: list[dict[str, Any]],
    request_instance_ref: str,
    instances: dict[str, dict[str, Any]],
) -> list[Any]:
    results: list[Any] = []
    for record in records:
        refs = set(record.get("instanceRefs") or [])
        if not refs or any(
            instance_descends_from(ref, request_instance_ref, instances) for ref in refs
        ):
            results.append(record.get("result"))
    return results


def required_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"expected integer, found {value!r}") from error


def required_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"expected number, found {value!r}") from error


def fulfillment_status(
    model: LoadedModel,
    instances: dict[str, dict[str, Any]],
    issued: set[str],
    fulfillment_ref: str,
    request_instance_ref: str,
    rule_results: dict[str, list[dict[str, Any]]],
    manual_completions: set[str],
) -> str:
    fulfillment = model.fulfillments_by_id.get(fulfillment_ref)
    request_instance = instances.get(request_instance_ref)
    if (
        fulfillment is None
        or request_instance is None
        or request_instance_ref not in issued
    ):
        return "not_requested"

    confirmation_types: dict[str, set[str]] = {}
    for target_ref in fulfillment.get("confirmationRefs") or []:
        target = model.entities_by_id.get(str(target_ref))
        if entity_signature(target) == ("role", "evidence"):
            players = {
                str(relation.get("sourceRef"))
                for relation in model.relationships
                if relation.get("kind") == "plays_role"
                and relation.get("targetRef") == target_ref
            }
            confirmation_types[str(target_ref)] = players
        else:
            confirmation_types[str(target_ref)] = {str(target_ref)}

    matching_by_target: dict[str, list[str]] = {
        target: [] for target in confirmation_types
    }
    for instance_ref in sorted(issued):
        instance = instances.get(instance_ref)
        if instance is None or request_instance_ref not in set(
            instance.get("basedOn") or []
        ):
            continue
        entity_ref = str(instance.get("entityRef"))
        for target_ref, types in confirmation_types.items():
            if entity_ref in types:
                matching_by_target[target_ref].append(instance_ref)

    policy = fulfillment.get("completionPolicy") or {}
    mode = policy.get("mode")
    completed = False
    if mode == "all":
        completed = all(matching_by_target.values())
    elif mode == "any":
        completed = any(matching_by_target.values())
    elif mode == "count":
        unique_confirmations = {
            instance_ref
            for values in matching_by_target.values()
            for instance_ref in values
        }
        completed = len(unique_confirmations) >= required_int(
            policy.get("minimumConfirmations", 1)
        )
    elif mode == "amount":
        completion_rule_ref = str(policy.get("completionRuleRef"))
        completed = any(
            bool(result)
            for result in scoped_rule_results(
                rule_results.get(completion_rule_ref, []),
                request_instance_ref,
                instances,
            )
        )
    elif mode == "manual":
        completed = request_instance_ref in manual_completions

    for breach in fulfillment.get("breaches") or []:
        breach_results = scoped_rule_results(
            rule_results.get(str(breach.get("conditionRuleRef")), []),
            request_instance_ref,
            instances,
        )
        if any(bool(result) for result in breach_results):
            return "breached"
    if completed:
        return "completed"
    return "pending"


def attach_attribute_types(model: LoadedModel, suite: ValidationSuite) -> None:
    for instance in suite.instances:
        entity = model.entities_by_id.get(str(instance.get("entityRef")))
        instance["_attributeTypes"] = {
            name: attribute.get("valueType")
            for name, attribute in entity_attributes(entity).items()
        }


def validate_typed_value(value: Any, value_type: str) -> str | None:
    if value_type == "bool" and not isinstance(value, bool):
        return "must be a boolean"
    if value_type == "int" and (not isinstance(value, int) or isinstance(value, bool)):
        return "must be an integer"
    if value_type == "uint" and (
        not isinstance(value, int) or isinstance(value, bool) or value < 0
    ):
        return "must be a non-negative integer"
    if value_type in {"double", "decimal"}:
        if not isinstance(value, (int, float, str)) or isinstance(value, bool):
            return "must be numeric or a decimal string"
        try:
            numeric = Decimal(str(value))
        except (InvalidOperation, ValueError):
            return "must be numeric or a decimal string"
        if not numeric.is_finite():
            return "must be finite"
    if value_type in {"string", "bytes", "enum"} and not isinstance(value, str):
        return "must be a string"
    if value_type == "timestamp" and parse_timestamp(value) is None:
        return "must be an RFC 3339 timestamp"
    if value_type == "date":
        try:
            date.fromisoformat(str(value))
        except (TypeError, ValueError):
            return "must be an ISO date"
    if value_type == "duration":
        if not isinstance(value, str):
            return "must be a CEL duration string"
        if celtypes is not None:
            try:
                celtypes.DurationType(value)
            except (TypeError, ValueError):
                return "must be a valid CEL duration string"
    if value_type == "id" and (
        not isinstance(value, str) or ID_RE.fullmatch(value) is None
    ):
        return "must be a stable FM id"
    if value_type == "list" and not isinstance(value, list):
        return "must be a list"
    if value_type == "map" and not isinstance(value, dict):
        return "must be an object"
    if value_type == "money":
        if not isinstance(value, dict):
            return "must be an object with minorUnits and currency"
        if not isinstance(value.get("minorUnits"), int) or isinstance(
            value.get("minorUnits"), bool
        ):
            return "minorUnits must be an integer"
        if not isinstance(value.get("currency"), str) or not value.get("currency"):
            return "currency must be a non-empty string"
    return None


def typed_to_cel(value: Any, value_type: str) -> Any:
    assert celtypes is not None and json_to_cel is not None
    if value_type == "timestamp":
        return celtypes.TimestampType(str(value))
    if value_type == "duration":
        return celtypes.DurationType(str(value))
    if value_type == "bool":
        return celtypes.BoolType(value)
    if value_type == "int":
        return celtypes.IntType(value)
    if value_type == "uint":
        return celtypes.UintType(value)
    if value_type in {"double", "decimal"}:
        return celtypes.DoubleType(required_float(value))
    if value_type in {"string", "bytes", "enum", "id", "date"}:
        return celtypes.StringType(str(value))
    return json_to_cel(value)


def from_cel_value(value: Any) -> Any:
    if celtypes is None:
        return value
    if isinstance(value, celtypes.TimestampType):
        text = value.astimezone(timezone.utc).isoformat(timespec="seconds")
        return text.replace("+00:00", "Z")
    if isinstance(value, celtypes.DurationType):
        return f"{required_int(value.total_seconds())}s"
    if isinstance(value, (celtypes.BoolType, bool)):
        return bool(value)
    if isinstance(value, celtypes.IntType):
        return required_int(value)
    if isinstance(value, (celtypes.UintType,)):
        return required_int(value)
    if isinstance(value, celtypes.DoubleType):
        return required_float(value)
    if isinstance(value, (celtypes.StringType, str)):
        return str(value)
    if isinstance(value, (list, tuple, celtypes.ListType)):
        return [from_cel_value(item) for item in value]
    if isinstance(value, (dict, celtypes.MapType)):
        return {str(key): from_cel_value(child) for key, child in value.items()}
    return value


def parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def normalize_json_value(value: Any) -> Any:
    if isinstance(value, str):
        timestamp = parse_timestamp(value)
        if timestamp is not None and ("T" in value or value.endswith("Z")):
            text = timestamp.astimezone(timezone.utc).isoformat(timespec="seconds")
            return text.replace("+00:00", "Z")
        return value
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return required_int(value)
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalize_json_value(child) for key, child in value.items()}
    return value


def dedupe(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))
