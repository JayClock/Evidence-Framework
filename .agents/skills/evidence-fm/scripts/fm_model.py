#!/usr/bin/env python3
"""Load, validate, and compile Fulfillment Modeling Schema v3 directories."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - dependency failure is reported by CLI
    yaml = None  # type: ignore[assignment]

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - dependency failure is reported by CLI
    Draft202012Validator = None  # type: ignore[assignment,misc]

try:
    from celpy import Environment  # pyright: ignore[reportMissingImports]
except ImportError:  # pragma: no cover - dependency failure is reported by validator
    Environment = None  # type: ignore[assignment,misc]


SCHEMA_VERSION = "3.0"
DOCUMENT_DIRS = {
    "entity": "entities",
    "relationship": "relationships",
    "rule": "rules",
    "business_pattern": "business-patterns",
}
REQUIRED_DOCUMENT_TYPES = {"entity"}
MOMENT_EVIDENCE_KINDS = {"fulfillment_confirmation", "other_evidence"}
BOOL_RULE_KINDS = {"precondition", "invariant", "eligibility", "completion", "breach"}
RFC3339_TIMESTAMP_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)
IMPLEMENTATION_PARTY_TERMS = {
    "system",
    "scheduler",
    "queue",
    "api",
    "系统",
    "调度器",
    "队列",
    "接口",
}
CEL_BUILTINS = {
    "true",
    "false",
    "null",
    "in",
    "has",
    "all",
    "exists",
    "exists_one",
    "map",
    "filter",
    "size",
    "contains",
    "startsWith",
    "endsWith",
    "matches",
    "timestamp",
    "duration",
    "type",
    "dyn",
    "bool",
    "bytes",
    "double",
    "int",
    "string",
    "uint",
}
ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
ATTRIBUTE_NAME_RE = re.compile(r"[a-z][a-z0-9]*(?:_[a-z0-9]+)*")
TOP_LEVEL_IDENTIFIER_RE = re.compile(r"(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*)")
STRING_RE = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')


@dataclass
class LoadedModel:
    root: Path
    manifest: dict[str, Any] | None = None
    entities: list[dict[str, Any]] = field(default_factory=list)
    relationships: list[dict[str, Any]] = field(default_factory=list)
    rules: list[dict[str, Any]] = field(default_factory=list)
    business_patterns: list[dict[str, Any]] = field(default_factory=list)
    files_by_id: dict[str, Path] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)

    @property
    def entities_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item["id"]): item
            for item in self.entities
            if isinstance(item.get("id"), str)
        }

    @property
    def fulfillment_contexts_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item["id"]): item
            for item in self.entities
            if item.get("category") == "context"
            and item.get("kind") == "fulfillment"
            and isinstance(item.get("id"), str)
        }

    @property
    def relationships_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item["id"]): item
            for item in self.relationships
            if isinstance(item.get("id"), str)
        }

    @property
    def rules_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item["id"]): item
            for item in self.rules
            if isinstance(item.get("id"), str)
        }

    @property
    def business_patterns_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item["id"]): item
            for item in self.business_patterns
            if isinstance(item.get("id"), str)
        }


def schema_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "schemas"


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot load JSON from {path}: {error}") from error


def expected_filename(object_id: str) -> str:
    return object_id.replace(".", "--") + ".yaml"


def format_json_path(parts: Iterable[Any]) -> str:
    result = "$"
    for part in parts:
        if isinstance(part, int):
            result += f"[{part}]"
        else:
            result += f".{part}"
    return result


def load_single_yaml(path: Path, errors: list[str]) -> dict[str, Any] | None:
    if yaml is None:
        errors.append("PyYAML is required; install requirements.txt")
        return None
    try:
        documents = [
            doc
            for doc in yaml.safe_load_all(path.read_text(encoding="utf-8"))
            if doc is not None
        ]
    except OSError as error:
        errors.append(f"{path}: cannot read file: {error}")
        return None
    except yaml.YAMLError as error:
        errors.append(f"{path}: invalid YAML: {error}")
        return None
    if len(documents) != 1:
        errors.append(
            f"{path}: expected exactly one YAML document, found {len(documents)}"
        )
        return None
    document = documents[0]
    if not isinstance(document, dict):
        errors.append(f"{path}: YAML document must be an object")
        return None
    return document


def validate_against_schema(
    document: dict[str, Any], schema_name: str, display_path: str, errors: list[str]
) -> None:
    if Draft202012Validator is None:
        errors.append("jsonschema is required; install requirements.txt")
        return
    try:
        schema = load_json(schema_dir() / schema_name)
    except ValueError as error:
        errors.append(f"cannot load schema '{schema_name}': {error}")
        return
    validator = Draft202012Validator(schema)
    for error in sorted(
        validator.iter_errors(document), key=lambda item: list(item.absolute_path)
    ):
        errors.append(
            f"{display_path}:{format_json_path(error.absolute_path)}: {error.message}"
        )


def load_model(root: Path) -> LoadedModel:
    model = LoadedModel(root=root.resolve())
    if not root.exists() or not root.is_dir():
        model.errors.append(
            f"model directory does not exist or is not a directory: {root}"
        )
        return model

    manifest_path = root / "model.yaml"
    if not manifest_path.is_file():
        model.errors.append("model.yaml is required at the model root")
    else:
        manifest = load_single_yaml(manifest_path, model.errors)
        if manifest is not None:
            model.manifest = manifest
            validate_against_schema(
                manifest, "model.schema.json", "model.yaml", model.errors
            )

    allowed_directories = {
        *DOCUMENT_DIRS.values(),
        "discovery",
        "generated",
        "validation",
    }
    for child in root.iterdir():
        if (
            child.is_dir()
            and not child.name.startswith(".")
            and child.name not in allowed_directories
        ):
            model.errors.append(f"unexpected model directory: {child.name}/")

    collections: dict[str, list[dict[str, Any]]] = {
        "entity": model.entities,
        "relationship": model.relationships,
        "rule": model.rules,
        "business_pattern": model.business_patterns,
    }
    schemas = {
        "entity": "entity.schema.json",
        "relationship": "relationship.schema.json",
        "rule": "rule.schema.json",
        "business_pattern": "business-pattern.schema.json",
    }

    for expected_type, directory_name in DOCUMENT_DIRS.items():
        directory = root / directory_name
        if not directory.is_dir():
            if directory.exists():
                model.errors.append(f"{directory_name}/ must be a directory")
            elif expected_type in REQUIRED_DOCUMENT_TYPES:
                model.errors.append(f"{directory_name}/ directory is required")
            continue
        for path in sorted(directory.iterdir()):
            if path.is_dir():
                model.errors.append(
                    f"{path.relative_to(root)}: nested directories are not allowed"
                )
                continue
            if path.suffix != ".yaml":
                model.errors.append(
                    f"{path.relative_to(root)}: only .yaml files are allowed"
                )
                continue
            document = load_single_yaml(path, model.errors)
            if document is None:
                continue
            rel_path = path.relative_to(root).as_posix()
            if document.get("type") != expected_type:
                model.errors.append(
                    f"{rel_path}: type must be '{expected_type}', found {document.get('type')!r}"
                )
            validate_against_schema(
                document, schemas[expected_type], rel_path, model.errors
            )
            object_id = document.get("id")
            if isinstance(object_id, str) and ID_RE.fullmatch(object_id):
                expected = expected_filename(object_id)
                if path.name != expected:
                    model.errors.append(
                        f"{rel_path}: filename must be '{expected}' for id '{object_id}'"
                    )
                previous = model.files_by_id.get(object_id)
                if previous is not None:
                    model.errors.append(
                        f"duplicate id '{object_id}' in {previous.relative_to(root)} and {rel_path}"
                    )
                else:
                    model.files_by_id[object_id] = path
            collections[expected_type].append(document)

    if not model.entities:
        model.errors.append("entities/ must contain at least one entity")
    return model


def entity_signature(entity: dict[str, Any] | None) -> tuple[str | None, str | None]:
    if not isinstance(entity, dict):
        return (None, None)
    return (normalize(entity.get("category")), normalize(entity.get("kind")))


def normalize(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def object_context_ref(item: dict[str, Any] | None) -> str | None:
    if not isinstance(item, dict):
        return None
    if item.get("type") == "entity" and item.get("category") == "context":
        return normalize(item.get("id"))
    return normalize(item.get("contextRef"))


def require_ref(
    errors: list[str],
    owner_id: str,
    field_name: str,
    ref: Any,
    objects: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    normalized = normalize(ref)
    if normalized is None:
        return None
    target = objects.get(normalized)
    if target is None:
        errors.append(f"{owner_id}.{field_name} references unknown id '{normalized}'")
    return target


def validate_model(model: LoadedModel) -> list[str]:
    errors = list(model.errors)
    if model.manifest is None:
        return dedupe(errors)

    entities = model.entities_by_id
    fulfillment_contexts = model.fulfillment_contexts_by_id
    relationships = model.relationships_by_id
    rules = model.rules_by_id

    validate_manifest(model.manifest, entities, errors)
    validate_entities(model.entities, entities, rules, errors)
    validate_fulfillment_contexts(fulfillment_contexts, entities, rules, errors)
    validate_relationships(model.relationships, entities, rules, errors)
    validate_rules(model.rules, entities, rules, errors)
    validate_business_patterns(
        model.business_patterns,
        entities,
        fulfillment_contexts,
        relationships,
        rules,
        errors,
    )
    validate_derived_attributes(model.entities, rules, errors)

    # Imported lazily because the traceability module reuses LoadedModel and CEL helpers.
    from fm_traceability import analyze_traceability

    _, traceability_errors = analyze_traceability(model)
    errors.extend(traceability_errors)
    return dedupe(errors)


def is_rfc3339_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or RFC3339_TIMESTAMP_RE.fullmatch(value) is None:
        return False
    normalized = f"{value[:-1]}+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return False
    return parsed.tzinfo is not None


def validate_manifest(
    manifest: dict[str, Any], entities: dict[str, dict[str, Any]], errors: list[str]
) -> None:
    for ref in manifest.get("entryContextRefs") or []:
        target = entities.get(ref)
        if entity_signature(target)[0] != "context":
            errors.append(
                f"model.entryContextRefs contains non-Context or unknown id '{ref}'"
            )

    model_status = manifest.get("modelStatus")
    raw_review = manifest.get("stakeholderReview")
    review = raw_review if isinstance(raw_review, dict) else {}
    review_status = review.get("status")
    if review_status in {
        "reviewed",
        "confirmed",
        "rejected",
    } and not is_rfc3339_timestamp(review.get("reviewedAt")):
        errors.append(
            "model: stakeholderReview.reviewedAt must be an RFC 3339 timestamp"
        )
    if model_status == "confirmed" and review_status != "confirmed":
        errors.append(
            "model: confirmed status requires stakeholderReview.status 'confirmed'"
        )
    if model_status == "reviewed" and review_status != "reviewed":
        errors.append(
            "model: reviewed status requires stakeholderReview.status 'reviewed'"
        )
    if model_status == "draft" and review_status in {"reviewed", "confirmed"}:
        errors.append(
            f"model: stakeholderReview.status '{review_status}' is inconsistent with modelStatus 'draft'"
        )


EVIDENCE_TIME_ATTRIBUTES = {
    "rfp": ("started_at", "expired_at"),
    "proposal": ("started_at", "expired_at"),
    "fulfillment_request": ("started_at", "expired_at"),
    "contract": ("signed_at",),
    "fulfillment_confirmation": ("confirmed_at",),
    "other_evidence": ("created_at",),
}


def validate_attribute_names(entity: dict[str, Any], errors: list[str]) -> None:
    """Check every category, including Context; do not normalize source names."""
    for attribute in entity.get("attributes") or []:
        if not isinstance(attribute, dict):
            continue  # Structural errors are reported by JSON Schema.
        name = attribute.get("name")
        if not isinstance(name, str) or ATTRIBUTE_NAME_RE.fullmatch(name) is None:
            errors.append(
                f"{entity.get('id')}: attribute name {name!r} must use lower snake_case"
            )


def validate_evidence_times(entity: dict[str, Any], errors: list[str]) -> None:
    """Also protect in-memory validation; never insert missing source attributes."""
    category, kind = entity_signature(entity)
    if category != "evidence":
        return
    attributes = {
        attribute.get("name"): attribute
        for attribute in entity.get("attributes") or []
        if isinstance(attribute, dict)
    }
    for name in EVIDENCE_TIME_ATTRIBUTES.get(kind or "", ()):
        attribute = attributes.get(name)
        if attribute is None:
            errors.append(
                f"{entity.get('id')}: {kind} requires explicit time attribute '{name}'"
            )
        elif not (
            attribute.get("valueType") == "timestamp"
            and isinstance(attribute.get("required"), bool)
            and attribute["required"]
            and isinstance(attribute.get("keyData"), bool)
            and attribute["keyData"]
        ):
            errors.append(
                f"{entity.get('id')}.{name}: must be a required keyData timestamp"
            )


def validate_entities(
    entity_list: list[dict[str, Any]],
    entities: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    for entity in entity_list:
        entity_id = normalize(entity.get("id"))
        if entity_id is None:
            continue
        category, kind = entity_signature(entity)
        validate_attribute_names(entity, errors)
        validate_evidence_times(entity, errors)
        context_ref = normalize(entity.get("contextRef"))

        if category == "context":
            if context_ref is not None:
                errors.append(f"{entity_id}: Context must not define contextRef")
            parent_ref = normalize(entity.get("parentContextRef"))
            if kind == "fulfillment":
                parent = require_ref(
                    errors, entity_id, "parentContextRef", parent_ref, entities
                )
                if entity_signature(parent) != ("context", "contract"):
                    errors.append(
                        f"{entity_id}: Fulfillment Context parent must be a Contract Context"
                    )
            elif parent_ref is not None:
                parent = require_ref(
                    errors, entity_id, "parentContextRef", parent_ref, entities
                )
                if entity_signature(parent)[0] != "context":
                    errors.append(
                        f"{entity_id}: parentContextRef must reference a Context"
                    )
            roots = entity.get("rootRefs") or []
            if kind in {"contract", "domain"} and not roots:
                errors.append(f"{entity_id}: {kind} Context must define rootRefs")
            for ref in roots:
                target = require_ref(errors, entity_id, "rootRefs", ref, entities)
                if target is not None and object_context_ref(target) != entity_id:
                    errors.append(
                        f"{entity_id}: root '{ref}' must belong to this Context"
                    )
            continue

        context: dict[str, Any] | None = None
        if category in {"evidence", "role"} or (
            category == "participant" and kind == "thing"
        ):
            context = require_ref(
                errors, entity_id, "contextRef", context_ref, entities
            )
            if entity_signature(context)[0] != "context":
                errors.append(f"{entity_id}: contextRef must reference a Context")

        if (category, kind) == ("participant", "party") and context_ref is not None:
            errors.append(
                f"{entity_id}: Participant Party must stay outside every Context"
            )
        if (category, kind) == ("participant", "party"):
            searchable = f"{entity_id} {entity.get('label', '')}".lower()
            hits = sorted(
                term for term in IMPLEMENTATION_PARTY_TERMS if term in searchable
            )
            if hits:
                errors.append(
                    f"{entity_id}: Participant Party looks like an implementation actor {hits}; keep the Evidence responsibleRoleRef business-facing"
                )
        if (category, kind) == (
            "participant",
            "thing",
        ) and entity_signature(context) != ("context", "domain"):
            errors.append(
                f"{entity_id}: Participant Thing must belong to a Domain Context"
            )
        if (category, kind) == ("role", "party") and entity_signature(context) == (
            "context",
            "fulfillment",
        ):
            errors.append(
                f"{entity_id}: Party Role must stay in the parent Contract Context, not a Fulfillment Context"
            )

        attribute_names: set[str] = set()
        for attribute in entity.get("attributes") or []:
            name = normalize(attribute.get("name"))
            if name is None:
                continue
            if name in attribute_names:
                errors.append(f"{entity_id}: duplicate attribute name '{name}'")
            attribute_names.add(name)
            rule_ref = normalize(attribute.get("derivedByRuleRef"))
            if rule_ref is not None and rule_ref not in rules:
                errors.append(
                    f"{entity_id}.{name}: unknown derivedByRuleRef '{rule_ref}'"
                )

        if (category, kind) == ("evidence", "contract"):
            if entity_signature(context) != ("context", "contract"):
                errors.append(
                    f"{entity_id}: Contract must belong to a Contract Context"
                )
            if context is not None and entity_id not in (context.get("rootRefs") or []):
                errors.append(
                    f"{entity_id}: Contract must be listed in its Context rootRefs"
                )
            role_refs = [str(ref) for ref in entity.get("roleRefs") or []]
            if len(set(role_refs)) != 2:
                errors.append(
                    f"{entity_id}: Contract requires exactly two distinct Party Roles"
                )
            for role_ref in role_refs:
                role = entities.get(role_ref)
                if entity_signature(role) != ("role", "party"):
                    errors.append(
                        f"{entity_id}: roleRef '{role_ref}' must reference Party Role"
                    )
                elif object_context_ref(role) != context_ref:
                    errors.append(
                        f"{entity_id}: Party Role '{role_ref}' must belong to the Contract Context"
                    )
        elif category == "evidence":
            role_ref = normalize(entity.get("responsibleRoleRef"))
            role = entities.get(role_ref or "")
            if entity_signature(role) != ("role", "party"):
                errors.append(
                    f"{entity_id}: responsibleRoleRef must reference a Party Role"
                )
                continue

            context_kind = entity_signature(context)[1]
            expected_role_context = context_ref
            if context_kind == "fulfillment" and context is not None:
                expected_role_context = normalize(context.get("parentContextRef"))
            if object_context_ref(role) != expected_role_context:
                errors.append(
                    f"{entity_id}: responsible Party Role must belong to Context '{expected_role_context}'"
                )

            if (
                kind in {"fulfillment_request", "fulfillment_confirmation"}
                and context_kind != "fulfillment"
            ):
                errors.append(
                    f"{entity_id}: {kind} must belong to a Fulfillment Context"
                )
            if kind in {"rfp", "proposal"} and context_kind not in {
                "pre_contract",
                "channel",
            }:
                errors.append(
                    f"{entity_id}: {kind} must belong to a Pre-contract or Channel Context"
                )


def fulfillment_members(
    fulfillment_id: str, entities: dict[str, dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Return requests, confirmations, and evidence roles owned by a Fulfillment."""
    members = [
        entity
        for entity in entities.values()
        if object_context_ref(entity) == fulfillment_id
    ]
    return (
        [
            item
            for item in members
            if entity_signature(item) == ("evidence", "fulfillment_request")
        ],
        [
            item
            for item in members
            if entity_signature(item) == ("evidence", "fulfillment_confirmation")
        ],
        [item for item in members if entity_signature(item) == ("role", "evidence")],
    )


def fulfillment_contract(
    fulfillment: dict[str, Any], entities: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """Resolve the single contract rooted in the parent Contract Context."""
    parent = entities.get(str(fulfillment.get("parentContextRef")))
    contracts = (
        [
            entities[ref]
            for ref in parent.get("rootRefs", [])
            if ref in entities
            and entity_signature(entities[ref]) == ("evidence", "contract")
        ]
        if isinstance(parent, dict)
        else []
    )
    return contracts[0] if len(contracts) == 1 else None


def validate_fulfillment_contexts(
    fulfillment_contexts: dict[str, dict[str, Any]],
    entities: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    for fulfillment_id, fulfillment in fulfillment_contexts.items():
        contract = fulfillment_contract(fulfillment, entities)
        if contract is None:
            errors.append(
                f"{fulfillment_id}: parent Contract Context must have exactly one root Contract"
            )
            contract_roles: set[str] = set()
        else:
            contract_roles = {str(ref) for ref in contract.get("roleRefs") or []}

        requests, confirmations, evidence_roles = fulfillment_members(
            fulfillment_id, entities
        )
        if len(requests) != 1:
            errors.append(
                f"{fulfillment_id}: must contain exactly one Fulfillment Request; found {len(requests)}"
            )
        if not confirmations and not evidence_roles:
            errors.append(
                f"{fulfillment_id}: must contain a Fulfillment Confirmation or Evidence Role"
            )
        for member in [*requests, *confirmations]:
            role_ref = normalize(member.get("responsibleRoleRef"))
            if role_ref not in contract_roles:
                errors.append(
                    f"{member['id']}: responsibleRoleRef must be a Party Role of the parent Contract"
                )

        context_rules = [
            rule
            for rule in rules.values()
            if object_context_ref(rule) == fulfillment_id
        ]
        completion_rules = [
            rule for rule in context_rules if rule.get("kind") == "completion"
        ]
        if len(completion_rules) != 1:
            errors.append(
                f"{fulfillment_id}: must define exactly one completion Rule; found {len(completion_rules)}"
            )
        for rule in context_rules:
            if (
                rule.get("kind") in {"completion", "breach"}
                and rule.get("resultType") != "bool"
            ):
                errors.append(
                    f"{rule['id']}: {rule['kind']} Rule resultType must be bool"
                )

    for entity_id, entity in entities.items():
        if entity_signature(entity) not in {
            ("evidence", "fulfillment_request"),
            ("evidence", "fulfillment_confirmation"),
        }:
            continue
        context_ref = object_context_ref(entity)
        if context_ref not in fulfillment_contexts:
            errors.append(
                f"{entity_id}: must belong to an existing Fulfillment Context"
            )


def validate_trigger(
    owner_id: str,
    field_name: str,
    trigger: dict[str, Any],
    expected_role_ref: str | None,
    contract_role_refs: set[str],
    expected_context_ref: str | None,
    entities: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    role_ref = normalize(trigger.get("actsForRoleRef"))
    if expected_role_ref is not None and role_ref != expected_role_ref:
        errors.append(
            f"{owner_id}.{field_name}.actsForRoleRef must match the Evidence responsibleRoleRef '{expected_role_ref}'"
        )
    if entity_signature(entities.get(role_ref or "")) != ("role", "party"):
        errors.append(
            f"{owner_id}.{field_name}.actsForRoleRef must reference Party Role"
        )
    elif role_ref not in contract_role_refs:
        errors.append(
            f"{owner_id}.{field_name}.actsForRoleRef must be a Party Role of the Contract"
        )
    source_context_ref = normalize(trigger.get("sourceContextRef"))
    if (
        source_context_ref is not None
        and entity_signature(entities.get(source_context_ref))[0] != "context"
    ):
        errors.append(
            f"{owner_id}.{field_name}.sourceContextRef references unknown Context '{source_context_ref}'"
        )
    rule_ref = normalize(trigger.get("ruleRef"))
    if trigger.get("kind") == "rule":
        rule = rules.get(rule_ref or "")
        if rule is None:
            errors.append(
                f"{owner_id}.{field_name}.ruleRef references unknown Rule '{rule_ref}'"
            )
        elif object_context_ref(rule) != expected_context_ref:
            errors.append(
                f"{owner_id}.{field_name}.ruleRef must belong to the Fulfillment Context"
            )


def validate_relationship_cardinality(
    relationship_id: str,
    endpoint: str,
    cardinality: Any,
    errors: list[str],
) -> None:
    """Validate bounds JSON Schema cannot compare with each other."""
    if not isinstance(cardinality, dict):
        return
    minimum = cardinality.get("min")
    maximum = cardinality.get("max")
    if (
        isinstance(minimum, int)
        and not isinstance(minimum, bool)
        and isinstance(maximum, int)
        and not isinstance(maximum, bool)
        and maximum < minimum
    ):
        errors.append(
            f"{relationship_id}: {endpoint}Cardinality.max must be greater than or equal to min"
        )


def validate_relationships(
    relationship_list: list[dict[str, Any]],
    entities: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    objects: dict[str, dict[str, Any]] = {**entities, **rules}
    for relationship in relationship_list:
        relationship_id = normalize(relationship.get("id"))
        if relationship_id is None:
            continue
        for endpoint in ("source", "target"):
            validate_relationship_cardinality(
                relationship_id,
                endpoint,
                relationship.get(f"{endpoint}Cardinality"),
                errors,
            )
        source_ref = normalize(relationship.get("sourceRef"))
        target_ref = normalize(relationship.get("targetRef"))
        source = objects.get(source_ref or "")
        target = objects.get(target_ref or "")
        if source is None:
            errors.append(f"{relationship_id}: unknown sourceRef '{source_ref}'")
        if target is None:
            errors.append(f"{relationship_id}: unknown targetRef '{target_ref}'")
        if source is None or target is None:
            continue
        if source_ref == target_ref:
            errors.append(f"{relationship_id}: self relationships are not allowed")
            continue
        kind = relationship.get("kind")
        source_sig = entity_signature(source)
        target_sig = entity_signature(target)
        source_context = object_context_ref(source)
        target_context = object_context_ref(target)

        if source_sig == ("evidence", "contract") and target_sig == (
            "evidence",
            "contract",
        ):
            errors.append(
                f"{relationship_id}: Contract must not connect directly to Contract"
            )

        if kind == "plays_role":
            moment_evidence_plays_evidence_role = (
                source_sig[0] == "evidence"
                and source_sig[1] in MOMENT_EVIDENCE_KINDS
                and target_sig == ("role", "evidence")
            )
            participant_plays_role = (
                source_sig == ("participant", "party")
                and target_sig in {("role", "party"), ("role", "third_party")}
            ) or (
                source_sig == ("participant", "thing")
                and target_sig == ("role", "domain")
            )
            context_plays_role = (
                source_sig[0] == "context" and target_sig == ("role", "context")
            ) or (
                source_sig == ("context", "external")
                and target_sig == ("role", "third_party")
            )
            if not (
                moment_evidence_plays_evidence_role
                or participant_plays_role
                or context_plays_role
            ):
                errors.append(
                    f"{relationship_id}: invalid plays_role direction or endpoint types"
                )
            elif (
                moment_evidence_plays_evidence_role and source_context == target_context
            ):
                errors.append(
                    f"{relationship_id}: Evidence Role player must come from another Context"
                )
            continue

        if kind == "uses_role":
            if target_sig[0] != "role" or target_sig[1] == "party":
                errors.append(
                    f"{relationship_id}: uses_role target must be a non-Party Role"
                )
            if source.get("type") != "entity":
                errors.append(f"{relationship_id}: uses_role source must be an Entity")
            continue

        if kind in {"references", "evidences", "precedes", "derived_from"}:
            if source.get("type") != "entity" or target.get("type") != "entity":
                errors.append(f"{relationship_id}: {kind} requires Entity endpoints")
                continue
            if source_sig == ("context", "fulfillment") or target_sig == (
                "context",
                "fulfillment",
            ):
                errors.append(
                    f"{relationship_id}: Fulfillment must not be an endpoint of {kind}"
                )
                continue

            proposal_to_contract = source_sig == (
                "evidence",
                "proposal",
            ) and target_sig == ("evidence", "contract")
            contract_to_request = (
                source_sig == ("evidence", "contract")
                and target_sig == ("evidence", "fulfillment_request")
                and isinstance(target_context, str)
                and entities.get(target_context, {}).get("parentContextRef")
                == source_context
            )
            evidence_to_thing = source_sig[0] == "evidence" and target_sig == (
                "participant",
                "thing",
            )
            if source_context != target_context and not (
                (kind == "precedes" and (proposal_to_contract or contract_to_request))
                or (kind == "references" and evidence_to_thing)
            ):
                errors.append(
                    f"{relationship_id}: unsupported cross-context {kind} relationship"
                )

            if kind == "precedes" and not (
                source_sig[0] == "evidence" and target_sig[0] == "evidence"
            ):
                errors.append(
                    f"{relationship_id}: precedes requires Evidence -> Evidence"
                )
            elif kind == "evidences" and not (
                source_sig == ("evidence", "other_evidence")
                and target_sig[0] == "evidence"
            ):
                errors.append(
                    f"{relationship_id}: evidences requires Other Evidence -> Evidence"
                )
            elif (
                kind == "references"
                and source_sig[0] == "evidence"
                and not evidence_to_thing
            ):
                errors.append(
                    f"{relationship_id}: Evidence references must target a Thing"
                )
            elif kind == "derived_from" and not (
                source_sig[0] == "evidence" and target_sig[0] == "evidence"
            ):
                errors.append(
                    f"{relationship_id}: derived_from requires Evidence endpoints"
                )


def validate_rules(
    rule_list: list[dict[str, Any]],
    entities: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    objects = entities
    dependency_reported = False
    for rule in rule_list:
        rule_id = normalize(rule.get("id"))
        if rule_id is None:
            continue
        context_ref = normalize(rule.get("contextRef"))
        if entity_signature(entities.get(context_ref or ""))[0] != "context":
            errors.append(f"{rule_id}: contextRef must reference Context")
        kind = rule.get("kind")
        if kind in BOOL_RULE_KINDS and rule.get("resultType") != "bool":
            errors.append(f"{rule_id}: {kind} Rule resultType must be bool")
        if kind != "derivation" and rule.get("target") is not None:
            errors.append(f"{rule_id}: only derivation Rule may define target")

        bindings = rule.get("bindings") or {}
        if isinstance(bindings, dict):
            for variable, binding in bindings.items():
                if (
                    isinstance(binding, dict)
                    and "ref" in binding
                    and binding.get("ref") not in objects
                ):
                    errors.append(
                        f"{rule_id}: binding '{variable}' references unknown id '{binding.get('ref')}'"
                    )

        target = rule.get("target")
        if isinstance(target, dict):
            entity_ref = normalize(target.get("entityRef"))
            attribute_name = normalize(target.get("attribute"))
            entity = entities.get(entity_ref or "")
            if entity is None:
                errors.append(
                    f"{rule_id}: target.entityRef references unknown Entity '{entity_ref}'"
                )
            else:
                attributes = {
                    item.get("name"): item
                    for item in entity.get("attributes") or []
                    if isinstance(item, dict)
                }
                attribute = attributes.get(attribute_name)
                if attribute is None:
                    errors.append(
                        f"{rule_id}: target attribute '{entity_ref}.{attribute_name}' does not exist"
                    )
                elif object_context_ref(entity) != context_ref:
                    errors.append(
                        f"{rule_id}: derivation target must belong to the Rule Context"
                    )
                elif attribute.get("valueType") != rule.get("resultType"):
                    errors.append(
                        f"{rule_id}: resultType '{rule.get('resultType')}' does not match target valueType '{attribute.get('valueType')}'"
                    )

        expression = rule.get("expression")
        if not isinstance(expression, str):
            continue
        expression_without_strings = STRING_RE.sub("", expression)
        if re.search(r"(?<![=!<>])=(?!=)", expression_without_strings):
            errors.append(f"{rule_id}: CEL expression must not contain assignment")
        if Environment is None:
            undeclared = undeclared_cel_identifiers_fallback(
                expression, set(bindings) if isinstance(bindings, dict) else set()
            )
            if not dependency_reported:
                errors.append(
                    "cel-python is required for CEL validation; install requirements.txt"
                )
                dependency_reported = True
        else:
            try:
                ast = Environment().compile(expression)
                undeclared = undeclared_cel_identifiers(
                    ast, set(bindings) if isinstance(bindings, dict) else set()
                )
            except Exception as error:  # cel-python exposes parser-specific exceptions
                errors.append(f"{rule_id}: invalid CEL: {error}")
                undeclared = set()
        if undeclared:
            errors.append(
                f"{rule_id}: CEL uses undeclared top-level identifiers {sorted(undeclared)}"
            )


def validate_business_patterns(
    pattern_list: list[dict[str, Any]],
    entities: dict[str, dict[str, Any]],
    fulfillment_contexts: dict[str, dict[str, Any]],
    relationships: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    objects = {**entities, **relationships, **rules}
    allowed_variation_roles = {"domain", "third_party", "context", "evidence"}
    allowed_variation_contexts = {"pre_contract", "channel", "fulfillment", "domain"}

    for pattern in pattern_list:
        pattern_id = normalize(pattern.get("id"))
        if pattern_id is None:
            continue

        spine_contract_contexts: set[str] = set()
        for ref in pattern.get("businessSpineRefs") or []:
            fulfillment = fulfillment_contexts.get(ref)
            if fulfillment is None:
                errors.append(
                    f"{pattern_id}: businessSpineRef '{ref}' must reference Fulfillment"
                )
                continue
            contract_context = normalize(fulfillment.get("parentContextRef"))
            if contract_context is not None:
                spine_contract_contexts.add(contract_context)
        for ref in pattern.get("invariantRefs") or []:
            if ref not in objects:
                errors.append(
                    f"{pattern_id}: invariantRef '{ref}' references unknown model object"
                )

        for ref in pattern.get("variationPointRefs") or []:
            target = entities.get(ref)
            category, kind = entity_signature(target)
            is_variation_role = category == "role" and kind in allowed_variation_roles
            is_variation_context = (
                category == "context" and kind in allowed_variation_contexts
            )
            if not (is_variation_role or is_variation_context):
                errors.append(
                    f"{pattern_id}: variationPointRef '{ref}' must reference a variation Role "
                    "or Pre-contract, Channel, Fulfillment, or Domain Context"
                )

        for ref in pattern.get("domainInputRefs") or []:
            target = entities.get(ref)
            signature = entity_signature(target)
            if signature not in {
                ("participant", "thing"),
                ("role", "domain"),
                ("context", "domain"),
            }:
                errors.append(
                    f"{pattern_id}: domainInputRef '{ref}' must reference a domain input"
                )

        contract_context_refs = pattern.get("supportedByContractContextRefs") or []
        for ref in contract_context_refs:
            if entity_signature(entities.get(ref)) != ("context", "contract"):
                errors.append(
                    f"{pattern_id}: supportedByContractContextRef '{ref}' must reference Contract Context"
                )
        missing_spine_contexts = spine_contract_contexts - set(contract_context_refs)
        if missing_spine_contexts:
            errors.append(
                f"{pattern_id}: supportedByContractContextRefs omit business-spine Contexts "
                f"{sorted(missing_spine_contexts)}"
            )
        empty_contract_examples = set(contract_context_refs) - spine_contract_contexts
        if empty_contract_examples:
            errors.append(
                f"{pattern_id}: Contract examples lack referenced business-spine Fulfillments "
                f"{sorted(empty_contract_examples)}"
            )

        domain_context_refs = pattern.get("domainExampleContextRefs") or []
        for ref in domain_context_refs:
            if entity_signature(entities.get(ref)) != ("context", "domain"):
                errors.append(
                    f"{pattern_id}: domainExampleContextRef '{ref}' must reference Domain Context"
                )
        domain_input_contexts: set[str] = set()
        for ref in pattern.get("domainInputRefs") or []:
            target = entities.get(ref)
            signature = entity_signature(target)
            if signature == ("context", "domain"):
                domain_input_contexts.add(ref)
                continue
            if signature == ("participant", "thing"):
                input_context_ref = object_context_ref(target)
                if input_context_ref is not None:
                    domain_input_contexts.add(input_context_ref)
                continue
            if signature == ("role", "domain"):
                role_context_ref = object_context_ref(target)
                if entity_signature(entities.get(role_context_ref or "")) == (
                    "context",
                    "domain",
                ):
                    domain_input_contexts.add(str(role_context_ref))
                for relationship in relationships.values():
                    if (
                        relationship.get("kind") == "plays_role"
                        and relationship.get("targetRef") == ref
                    ):
                        player_context_ref = object_context_ref(
                            entities.get(str(relationship.get("sourceRef")))
                        )
                        if entity_signature(entities.get(player_context_ref or "")) == (
                            "context",
                            "domain",
                        ):
                            domain_input_contexts.add(str(player_context_ref))
        missing_domain_examples = domain_input_contexts - set(domain_context_refs)
        if missing_domain_examples:
            errors.append(
                f"{pattern_id}: domainExampleContextRefs omit Domain inputs "
                f"{sorted(missing_domain_examples)}"
            )
        empty_domain_examples = set(domain_context_refs) - domain_input_contexts
        if empty_domain_examples:
            errors.append(
                f"{pattern_id}: Domain examples lack referenced Domain inputs "
                f"{sorted(empty_domain_examples)}"
            )

        reuse_status = pattern.get("reuseStatus")
        if reuse_status in {"supported", "confirmed"}:
            if len(set(contract_context_refs)) < 2:
                errors.append(
                    f"{pattern_id}: reuseStatus '{reuse_status}' requires at least two Contract Context examples"
                )
            if len(set(domain_context_refs)) < 2:
                errors.append(
                    f"{pattern_id}: reuseStatus '{reuse_status}' requires at least two Domain Context examples"
                )

        raw_review = pattern.get("stakeholderReview")
        review = raw_review if isinstance(raw_review, dict) else {}
        review_status = review.get("status")
        if review_status in {
            "reviewed",
            "confirmed",
            "rejected",
        } and not is_rfc3339_timestamp(review.get("reviewedAt")):
            errors.append(
                f"{pattern_id}: stakeholderReview.reviewedAt must be an RFC 3339 timestamp"
            )
        if reuse_status == "confirmed" and review_status != "confirmed":
            errors.append(
                f"{pattern_id}: confirmed reuse requires stakeholderReview.status 'confirmed'"
            )
        if reuse_status != "confirmed" and review_status == "confirmed":
            errors.append(
                f"{pattern_id}: confirmed stakeholder review requires reuseStatus 'confirmed'"
            )


def undeclared_cel_identifiers(ast: Any, declared: set[str]) -> set[str]:
    """Return free CEL identifiers while respecting standard macro-local variables."""

    macro_names = {"all", "exists", "exists_one", "map", "filter"}
    free: set[str] = set()

    def single_identifier(node: Any) -> str | None:
        found: list[str] = []

        def collect(current: Any) -> None:
            if getattr(current, "data", None) == "ident" and getattr(
                current, "children", None
            ):
                found.append(str(current.children[0]))
                return
            for child in getattr(current, "children", []):
                collect(child)

        collect(node)
        return found[0] if len(found) == 1 else None

    def walk(node: Any, locals_: set[str]) -> None:
        data = str(getattr(node, "data", ""))
        children = list(getattr(node, "children", []))
        if data == "ident" and children:
            identifier = str(children[0])
            if identifier not in locals_ and identifier not in CEL_BUILTINS:
                free.add(identifier)
            return
        if data == "member_dot_arg" and len(children) >= 3:
            method = str(children[1])
            if method in macro_names:
                walk(children[0], locals_)
                arguments = list(getattr(children[2], "children", []))
                binder = single_identifier(arguments[0]) if arguments else None
                if binder is not None:
                    for argument in arguments[1:]:
                        walk(argument, locals_ | {binder})
                    return
        for child in children:
            walk(child, locals_)

    walk(ast, set())
    return free - declared


def undeclared_cel_identifiers_fallback(
    expression: str, declared: set[str]
) -> set[str]:
    without_strings = STRING_RE.sub("", expression)
    without_comments = re.sub(r"//.*", "", without_strings)
    candidates: set[str] = set()
    for match in TOP_LEVEL_IDENTIFIER_RE.finditer(without_comments):
        identifier = match.group(1)
        tail = without_comments[match.end() :]
        if re.match(r"\s*:", tail):  # map literal key
            continue
        candidates.add(identifier)
    return candidates - declared - CEL_BUILTINS


def validate_derived_attributes(
    entity_list: list[dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    for entity in entity_list:
        entity_id = normalize(entity.get("id"))
        if entity_id is None:
            continue
        for attribute in entity.get("attributes") or []:
            if not isinstance(attribute, dict):
                continue
            attribute_name = attribute.get("name")
            rule_ref = normalize(attribute.get("derivedByRuleRef"))
            if rule_ref is None:
                continue
            rule = rules.get(rule_ref)
            if rule is None:
                continue
            target = rule.get("target") or {}
            if (
                rule.get("kind") != "derivation"
                or target.get("entityRef") != entity_id
                or target.get("attribute") != attribute_name
            ):
                errors.append(
                    f"{entity_id}.{attribute_name}: derivedByRuleRef '{rule_ref}' must target this exact attribute"
                )
            if object_context_ref(rule) != object_context_ref(entity):
                errors.append(
                    f"{entity_id}.{attribute_name}: derivation Rule must belong to the target Entity Context"
                )


def dedupe(errors: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for error in errors:
        if error not in seen:
            seen.add(error)
            result.append(error)
    return result


def compiled_document(model: LoadedModel) -> dict[str, Any]:
    if model.manifest is None:
        raise ValueError("cannot compile model without model.yaml")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "model": model.manifest,
        "entities": sorted(model.entities, key=lambda item: str(item.get("id", ""))),
        "relationships": sorted(
            model.relationships, key=lambda item: str(item.get("id", ""))
        ),
        "rules": sorted(model.rules, key=lambda item: str(item.get("id", ""))),
        "businessPatterns": sorted(
            model.business_patterns,
            key=lambda item: str(item.get("id", "")),
        ),
    }
