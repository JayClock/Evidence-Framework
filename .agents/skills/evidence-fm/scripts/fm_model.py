#!/usr/bin/env python3
"""Load, validate, and compile Fulfillment Modeling Schema v5 directories."""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - dependency failure is reported by CLI
    Draft202012Validator = None  # type: ignore[assignment,misc]

try:
    from celpy import Environment  # pyright: ignore[reportMissingImports]
except ImportError:  # pragma: no cover - dependency failure is reported by validator
    Environment = None  # type: ignore[assignment,misc]


SCHEMA_VERSION = "5.0"
# A single-file bundle holds what this directory keeps in a tree; both forms are
# the same model, so every reader accepts either one.
BUNDLE_TYPE = "fm_bundle"
BUNDLE_SUFFIX = ".evidence.json"
# These trees are inputs/outputs of other readers, not FM type definitions.
NON_SOURCE_TREES = {"discovery", "generated", "validation"}
MOMENT_EVIDENCE_KINDS = {"fulfillment_confirmation", "other_evidence"}
BOOL_RULE_KINDS = {"precondition", "invariant", "eligibility", "completion", "breach"}
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
    def requests_by_id(self) -> dict[str, dict[str, Any]]:
        return {
            str(item["id"]): item
            for item in self.entities
            if entity_signature(item) == ("evidence", "fulfillment_request")
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

    def fulfillment_members(
        self, request_id: str
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
        return fulfillment_members(
            request_id, self.entities_by_id, self.relationships, self.rules
        )

    def fulfillment_results(
        self, request_id: str
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        return fulfillment_results(
            request_id, self.entities_by_id, self.relationships, self.rules
        )


def schema_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "schemas"


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot load JSON from {path}: {error}") from error


def expected_filename(document: dict[str, Any]) -> str:
    object_id = str(document["id"])
    if document.get("type") == "entity":
        category = str(document["category"]).replace("_", "-")
        kind = str(document.get("kind", "")).replace("_", "-")
        object_suffix = object_id.split(".", 1)[-1].replace(".", "--")
        return f"{category}{'-' + kind if kind else ''}--{object_suffix}.json"
    return object_id.replace(".", "--") + ".json"


def format_json_path(parts: Iterable[Any]) -> str:
    result = "$"
    for part in parts:
        if isinstance(part, int):
            result += f"[{part}]"
        else:
            result += f".{part}"
    return result


def reject_nonstandard_constant(value: str) -> Any:
    raise ValueError(f"non-standard JSON constant {value!r}")


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate key {key!r}")
        result[key] = value
    return result


def load_single_json(path: Path, errors: list[str]) -> dict[str, Any] | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        errors.append(f"{path}: cannot read file: {error}")
        return None
    try:
        document = json.loads(
            text,
            object_pairs_hook=unique_object,
            parse_constant=reject_nonstandard_constant,
        )
    except ValueError as error:
        errors.append(f"{path}: invalid JSON: {error}")
        return None
    if not isinstance(document, dict):
        errors.append(f"{path}: JSON document must be an object")
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


BUNDLE_COLLECTIONS = (
    ("entities", "entity", "entity.schema.json"),
    ("relationships", "relationship", "relationship.schema.json"),
    ("rules", "rule", "rule.schema.json"),
)


def load_model_bundle(file_path: Path) -> LoadedModel:
    """Loads a `*.evidence.json` bundle as if it were a source tree."""
    model = LoadedModel(root=file_path.resolve())
    document = load_single_json(file_path, model.errors)
    if document is None:
        return model

    display = file_path.name
    if document.get("type") != BUNDLE_TYPE:
        model.errors.append(
            f"{display}: type must be '{BUNDLE_TYPE}', "
            f"found {document.get('type')!r}"
        )
        return model

    manifest = document.get("manifest")
    if not isinstance(manifest, dict):
        model.errors.append(f"{display}: bundle requires a manifest object")
        return model
    model.manifest = manifest
    validate_against_schema(
        manifest, "model.schema.json", f"{display}:manifest", model.errors
    )

    collections: dict[str, list[dict[str, Any]]] = {
        "entity": model.entities,
        "relationship": model.relationships,
        "rule": model.rules,
    }
    seen: dict[str, str] = {}
    for key, expected_type, schema_name in BUNDLE_COLLECTIONS:
        items = document.get(key)
        if items is None:
            model.errors.append(f"{display}.{key}: bundle requires {key}")
            continue
        if not isinstance(items, list):
            model.errors.append(f"{display}.{key}: must be an array")
            continue
        for index, item in enumerate(items):
            item_path = f"{display}:{key}[{index}]"
            if not isinstance(item, dict):
                model.errors.append(f"{item_path}: must be an object")
                continue
            if item.get("type") != expected_type:
                model.errors.append(
                    f"{item_path}: type must be '{expected_type}', "
                    f"found {item.get('type')!r}"
                )
                continue
            validate_against_schema(item, schema_name, item_path, model.errors)
            object_id = item.get("id")
            if isinstance(object_id, str):
                previous = seen.get(object_id)
                if previous is not None:
                    model.errors.append(
                        f"{item_path}: duplicate id '{object_id}' "
                        f"also defined at {previous}"
                    )
                else:
                    seen[object_id] = item_path
                    model.files_by_id[object_id] = file_path
            collections[expected_type].append(item)

    if not model.entities:
        model.errors.append(f"{display}: model must contain at least one entity")
    return model


def is_bundle_path(path: Path) -> bool:
    """True when `path` names a single-file model bundle."""
    return path.name.lower().endswith(BUNDLE_SUFFIX)


def load_model(root: Path) -> LoadedModel:
    if root.is_file() or (not root.exists() and is_bundle_path(root)):
        return load_model_bundle(root)
    # A tree keeps `model.json` at the root and one object per file below it.
    model = LoadedModel(root=root.resolve())
    if not root.exists() or not root.is_dir():
        model.errors.append(
            f"model directory does not exist or is not a directory: {root}"
        )
        return model

    manifest_path = root / "model.json"
    if not manifest_path.is_file():
        model.errors.append("model.json is required at the model root")
    else:
        manifest = load_single_json(manifest_path, model.errors)
        if manifest is not None:
            model.manifest = manifest
            validate_against_schema(
                manifest, "model.schema.json", "model.json", model.errors
            )

    collections: dict[str, list[dict[str, Any]]] = {
        "entity": model.entities,
        "relationship": model.relationships,
        "rule": model.rules,
    }
    schemas = {
        "entity": "entity.schema.json",
        "relationship": "relationship.schema.json",
        "rule": "rule.schema.json",
    }

    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if (
            path == manifest_path
            or relative.parts[0] in NON_SOURCE_TREES
            or any(
                part.startswith(".") or part == "__pycache__" for part in relative.parts
            )
        ):
            continue
        rel_path = relative.as_posix()
        if path.is_symlink():
            model.errors.append(f"{rel_path}: model sources must not be symbolic links")
            continue
        if not path.is_file():
            continue
        if path.suffix in {".yaml", ".yml"}:
            model.errors.append(f"{rel_path}: model sources must use .json")
            continue
        if path.suffix != ".json":
            continue
        document = load_single_json(path, model.errors)
        if document is None:
            continue
        document_type = document.get("type")
        if not isinstance(document_type, str) or document_type not in schemas:
            model.errors.append(
                f"{rel_path}: unsupported document type {document_type!r}"
            )
            continue
        validate_against_schema(
            document, schemas[document_type], rel_path, model.errors
        )
        object_id = document.get("id")
        if isinstance(object_id, str) and ID_RE.fullmatch(object_id):
            previous = model.files_by_id.get(object_id)
            if previous is not None:
                model.errors.append(
                    f"duplicate id '{object_id}' in {previous.relative_to(root)} and {rel_path}"
                )
            else:
                model.files_by_id[object_id] = path
        collections[document_type].append(document)

    if not model.entities:
        model.errors.append("model must contain at least one entity")
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


def contract_context_ref(
    item: dict[str, Any] | None, entities: dict[str, dict[str, Any]]
) -> str | None:
    """Resolve the Contract Context that owns an Entity's responsibility."""
    context_ref = object_context_ref(item)
    context = entities.get(context_ref or "")
    signature = entity_signature(context)
    if signature == ("context", "contract"):
        return context_ref
    if signature == ("context", "pre_contract"):
        parent_ref = normalize(context.get("parentContextRef")) if context else None
        if entity_signature(entities.get(parent_ref or "")) == (
            "context",
            "contract",
        ):
            return parent_ref
    return None


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


def validate_model(model: LoadedModel, *, complete: bool = False) -> list[str]:
    errors = list(model.errors)
    if model.manifest is None or model.errors:
        return dedupe(errors)

    entities = model.entities_by_id
    rules = model.rules_by_id

    validate_manifest(model.manifest, entities, errors)
    validate_entities(model.entities, entities, rules, errors, complete=complete)
    validate_relationships(model.relationships, entities, rules, errors)
    validate_request_contract_references(entities, model.relationships, errors)
    validate_fulfillment_pairs(
        entities, model.relationships, rules, errors, complete=complete
    )
    validate_rules(model.rules, entities, rules, errors)
    validate_derived_attributes(model.entities, rules, errors)

    # Imported lazily because the traceability module reuses LoadedModel and CEL helpers.
    from fm_traceability import analyze_traceability

    _, traceability_errors = analyze_traceability(model)
    errors.extend(traceability_errors)
    return dedupe(errors)


def validate_manifest(
    manifest: dict[str, Any], entities: dict[str, dict[str, Any]], errors: list[str]
) -> None:
    for entity_id, entity in entities.items():
        if entity.get("category") != "context":
            continue
        seen: set[str] = set()
        current = entity_id
        while current in entities:
            if current in seen:
                errors.append(f"{entity_id}: Context parentContextRef cycle")
                break
            seen.add(current)
            current = str(entities[current].get("parentContextRef"))
    for ref in manifest.get("entryContextRefs") or []:
        target = entities.get(ref)
        if entity_signature(target)[0] != "context":
            errors.append(
                f"model.entryContextRefs contains non-Context or unknown id '{ref}'"
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


def validate_evidence_times(
    entity: dict[str, Any], errors: list[str], *, complete: bool = True
) -> None:
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
            if complete:
                errors.append(
                    f"{entity.get('id')}: {kind} requires explicit time attribute '{name}'"
                )
            continue
        expected = {"valueType": "timestamp", "required": True, "keyData": True}
        if any(
            (key in attribute or complete) and attribute.get(key) != value
            for key, value in expected.items()
        ):
            errors.append(
                f"{entity.get('id')}.{name}: must be a required keyData timestamp"
            )


def validate_evidence_responsibility(
    entity: dict[str, Any],
    context: dict[str, Any] | None,
    entities: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    """Use the explicitly bound contract parties, or a standalone context role."""
    entity_id = entity["id"]
    role_ref = normalize(entity.get("responsibleRoleRef"))
    role = entities.get(role_ref or "")
    if entity_signature(role) != ("role", "party"):
        errors.append(f"{entity_id}: responsibleRoleRef must reference a Party Role")
        return

    context = context or {}
    owner = context
    parent = entities.get(str(context.get("parentContextRef")))
    if (
        context.get("kind") == "pre_contract"
        and parent is not None
        and entity_signature(parent) == ("context", "contract")
    ):
        owner = parent
    if entity_signature(owner) == ("context", "contract"):
        contracts = [
            entities[ref]
            for ref in owner.get("rootRefs", [])
            if ref in entities
            and entity_signature(entities[ref]) == ("evidence", "contract")
        ]
        if len(contracts) != 1:
            errors.append(
                f"{entity_id}: responsibility requires exactly one root Contract"
            )
        elif role_ref not in contracts[0].get("roleRefs", []):
            errors.append(
                f"{entity_id}: responsibleRoleRef must be a Party Role bound by "
                f"Contract '{contracts[0]['id']}'"
            )
    expected_context = owner.get("id")
    if object_context_ref(role) != expected_context:
        errors.append(
            f"{entity_id}: responsible Party Role must belong to Context "
            f"'{expected_context}'"
        )


def validate_party_role_owner(
    role: dict[str, Any],
    context: dict[str, Any] | None,
    entities: dict[str, dict[str, Any]],
    errors: list[str],
) -> None:
    context = context or {}
    parent = entities.get(str(context.get("parentContextRef")))
    if (
        context.get("kind") == "pre_contract"
        and entity_signature(parent) == ("context", "contract")
    ):
        errors.append(
            f"{role['id']}: Party Role must stay in the parent Contract Context; "
            "responsibility stages cannot define additional Party Roles"
        )
    if entity_signature(context) == ("context", "contract"):
        bound_roles = {
            ref
            for root in context.get("rootRefs", [])
            for ref in entities.get(root, {}).get("roleRefs", [])
        }
        if role["id"] not in bound_roles:
            errors.append(
                f"{role['id']}: Party Role must be bound by the root Contract"
            )


def validate_context_roots(
    context: dict[str, Any], entities: dict[str, dict[str, Any]], errors: list[str],
) -> None:
    """A Context is saved with real content, never as a named placeholder."""
    context_id, kind = context["id"], context.get("kind")
    roots = context.get("rootRefs") or []
    if kind in {"contract", "domain"} and not roots:
        errors.append(f"{context_id}: {kind} Context must define rootRefs")
    if kind == "contract" and (
        len(roots) != 1 or entity_signature(entities.get(roots[0])) != ("evidence", "contract")
    ):
        errors.append(f"{context_id}: Contract Context must have exactly one root Contract")
    domain_roots = {("participant", "thing"), ("role", "party"), ("evidence", "other_evidence")}
    negotiation_roots = {("evidence", "rfp"), ("evidence", "proposal"), ("evidence", "other_evidence")}
    for ref in roots:
        target = require_ref(errors, context_id, "rootRefs", ref, entities)
        if target is None:
            continue
        if object_context_ref(target) != context_id:
            errors.append(f"{context_id}: root '{ref}' must belong to this Context")
        if kind == "domain" and entity_signature(target) not in domain_roots:
            errors.append(f"{context_id}: Domain Context root '{ref}' must be a local business object, not a container or collaboration placeholder")
        if kind == "pre_contract" and entity_signature(target) not in negotiation_roots:
            errors.append(f"{context_id}: Pre-contract Context root '{ref}' must be a negotiation Evidence")
    if kind == "pre_contract" and not any(
        item.get("contextRef") == context_id and entity_signature(item) in negotiation_roots
        for item in entities.values()
    ):
        errors.append(f"{context_id}: Pre-contract Context requires actual local negotiation Evidence; roles or child Contexts alone are not content")


def validate_entities(
    entity_list: list[dict[str, Any]],
    entities: dict[str, dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    complete: bool = True,
) -> None:
    for entity in entity_list:
        entity_id = normalize(entity.get("id"))
        if entity_id is None:
            continue
        category, kind = entity_signature(entity)
        validate_attribute_names(entity, errors)
        validate_evidence_times(entity, errors, complete=complete)
        if complete:
            for attribute in entity.get("attributes") or []:
                for field in ("valueType", "required"):
                    if field not in attribute:
                        errors.append(f"{entity_id}.{attribute.get('name')}: missing {field}")
        context_ref = normalize(entity.get("contextRef"))

        if category == "context":
            if context_ref is not None:
                errors.append(f"{entity_id}: Context must not define contextRef")
            parent_ref = normalize(entity.get("parentContextRef"))
            if kind not in {"contract", "pre_contract", "domain"}:
                errors.append(f"{entity_id}: invalid Context kind '{kind}'")
            if parent_ref is not None:
                parent = require_ref(
                    errors, entity_id, "parentContextRef", parent_ref, entities
                )
                if entity_signature(parent)[0] != "context":
                    errors.append(
                        f"{entity_id}: parentContextRef must reference a Context"
                    )
            validate_context_roots(entity, entities, errors)
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
        if category == "role" and (
            "responsibleRoleRef" in entity or "roleRefs" in entity
        ):
            errors.append(
                f"{entity_id}: Role must not declare Evidence responsibility fields"
            )
        if (category, kind) == ("role", "party"):
            validate_party_role_owner(entity, context, entities, errors)

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
            validate_evidence_responsibility(entity, context, entities, errors)
            context_kind = entity_signature(context)[1]

            if kind in {"fulfillment_request", "fulfillment_confirmation"} and context_kind != "contract":
                errors.append(
                    f"{entity_id}: {kind} must belong to a Contract Context"
                )
            if kind == "other_evidence" and context_kind not in {
                "contract",
                "pre_contract",
                "domain",
            }:
                errors.append(
                    f"{entity_id}: other_evidence must belong to its owning Contract, "
                    "Pre-contract, or Domain Context"
                )
            if kind in {"rfp", "proposal"} and context_kind != "pre_contract":
                errors.append(
                    f"{entity_id}: {kind} must belong to a Pre-contract Context"
                )


def fulfillment_results(
    request_id: str,
    entities: dict[str, dict[str, Any]],
    relationships: Iterable[dict[str, Any]] = (),
    rules: Iterable[dict[str, Any]] = (),
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Resolve confirmations and proof roles associated with a request via references relationships or rule bindings."""
    relationships = tuple(relationships)
    rules = tuple(rules)
    request = entities.get(request_id)
    if not request:
        return [], []
    context_id = object_context_ref(request)
    confirmation_refs: set[str] = set()
    role_refs: set[str] = set()
    for relation in relationships:
        if relation.get("kind") != "references":
            continue
        source_ref = normalize(relation.get("sourceRef"))
        target_ref = normalize(relation.get("targetRef"))
        if target_ref == request_id:
            if source_ref and source_ref in entities:
                other = entities[source_ref]
                sig = entity_signature(other)
                if (
                    sig == ("evidence", "fulfillment_confirmation")
                    and object_context_ref(other) == context_id
                ):
                    confirmation_refs.add(source_ref)
                elif sig == ("role", "evidence") and object_context_ref(other) == context_id:
                    role_refs.add(source_ref)

    for rule in rules:
        if rule.get("contextRef") != context_id or rule.get("kind") not in {"completion", "breach"}:
            continue
        bindings = rule.get("bindings") or {}
        binds_request = any(
            isinstance(b, dict) and b.get("ref") == request_id
            for b in bindings.values()
        )
        if not binds_request:
            continue
        for b in bindings.values():
            if not isinstance(b, dict):
                continue
            ref = b.get("ref")
            if not ref or ref == request_id or ref not in entities:
                continue
            other = entities[ref]
            sig = entity_signature(other)
            if (
                sig == ("evidence", "fulfillment_confirmation")
                and object_context_ref(other) == context_id
            ):
                confirmation_refs.add(ref)
            elif sig == ("role", "evidence") and object_context_ref(other) == context_id:
                role_refs.add(ref)

    return (
        [entities[ref] for ref in sorted(confirmation_refs)],
        [entities[ref] for ref in sorted(role_refs)],
    )


def fulfillment_members(
    request_id: str,
    entities: dict[str, dict[str, Any]],
    relationships: Iterable[dict[str, Any]] = (),
    rules: Iterable[dict[str, Any]] = (),
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Resolve a request and its associated result confirmations / proof roles."""
    request = entities.get(request_id)
    if not request or entity_signature(request) != ("evidence", "fulfillment_request"):
        return [], [], []
    confirmations, roles = fulfillment_results(request_id, entities, relationships, rules)
    return [request], confirmations, roles


def owning_contract(
    item: dict[str, Any], entities: dict[str, dict[str, Any]]
) -> dict[str, Any] | None:
    """Resolve the local root Contract for a request or evidence."""
    parent = entities.get(str(item.get("contextRef")))
    if parent is None or entity_signature(parent) != ("context", "contract"):
        return None
    contracts = [
        entities[ref]
        for ref in parent.get("rootRefs", [])
        if ref in entities
        and entity_signature(entities[ref]) == ("evidence", "contract")
        and entities[ref].get("contextRef") == parent["id"]
    ]
    return contracts[0] if len(contracts) == 1 else None


def validate_request_contract_references(
    entities: dict[str, dict[str, Any]],
    relationships: list[dict[str, Any]],
    errors: list[str],
) -> None:
    """Contract authority is mandatory for every Fulfillment Request."""
    references = {
        (relation.get("sourceRef"), relation.get("targetRef"))
        for relation in relationships
        if relation.get("kind") == "references"
    }
    for request in entities.values():
        if entity_signature(request) != ("evidence", "fulfillment_request"):
            continue
        contract = owning_contract(request, entities)
        if contract is None or (request["id"], contract["id"]) not in references:
            errors.append(
                f"{request['id']}: Fulfillment Request must directly reference the root Contract "
                "of its owning Contract Context through a Request -> Contract references Relationship"
            )


def validate_fulfillment_pairs(
    entities: dict[str, dict[str, Any]],
    relationships: list[dict[str, Any]],
    rules: dict[str, dict[str, Any]],
    errors: list[str],
    *,
    complete: bool = True,
) -> None:
    requests = [
        entity
        for entity in entities.values()
        if entity_signature(entity) == ("evidence", "fulfillment_request")
    ]
    confirmations = [
        entity
        for entity in entities.values()
        if entity_signature(entity) == ("evidence", "fulfillment_confirmation")
    ]
    associated_confirmation_refs: set[str] = set()

    for request in requests:
        request_id = str(request["id"])
        contract = owning_contract(request, entities)
        if contract is None:
            errors.append(
                f"{request_id}: parent Contract Context must have exactly one root Contract"
            )
            contract_roles: set[str] = set()
        else:
            contract_roles = {str(ref) for ref in contract.get("roleRefs") or []}

        req_confirmations, evidence_roles = fulfillment_results(
            request_id, entities, relationships, rules.values()
        )
        associated_confirmation_refs.update(str(item["id"]) for item in req_confirmations)

        role_ref = normalize(request.get("responsibleRoleRef"))
        if role_ref not in contract_roles:
            errors.append(
                f"{request_id}: responsibleRoleRef must be a Party Role of the parent Contract"
            )

        if complete and not req_confirmations and not evidence_roles:
            errors.append(
                f"{request_id}: must be associated with at least one Fulfillment Confirmation or Evidence Role"
            )

    for confirmation in confirmations:
        conf_id = str(confirmation["id"])
        contract = owning_contract(confirmation, entities)
        if contract is not None:
            contract_roles = {str(ref) for ref in contract.get("roleRefs") or []}
            role_ref = normalize(confirmation.get("responsibleRoleRef"))
            if role_ref not in contract_roles:
                errors.append(
                    f"{conf_id}: responsibleRoleRef must be a Party Role of the parent Contract"
                )
        if complete and conf_id not in associated_confirmation_refs:
            errors.append(
                f"{conf_id}: must be associated with at least one Fulfillment Request "
                "through a references Relationship"
            )

    for rule in rules.values():
        if rule.get("kind") in {"completion", "breach"}:
            if rule.get("resultType") != "bool":
                errors.append(
                    f"{rule['id']}: {rule['kind']} Rule resultType must be bool"
                )
            bindings = rule.get("bindings") or {}
            has_request_binding = any(
                isinstance(b, dict)
                and entity_signature(entities.get(b.get("ref", ""))) == ("evidence", "fulfillment_request")
                for b in bindings.values()
            )
            if not has_request_binding:
                errors.append(
                    f"{rule['id']}: {rule['kind']} Rule must bind at least one fulfillment_request in its bindings"
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
                f"{owner_id}.{field_name}.ruleRef must belong to the expected Context"
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

        if kind not in {"references", "plays_role"}:
            errors.append(f"{relationship_id}: unsupported relationship kind '{kind}'")
            continue

        if kind == "references":
            if source.get("type") != "entity" or target.get("type") != "entity":
                errors.append(f"{relationship_id}: {kind} requires Entity endpoints")
                continue
            contract_to_proposal = source_sig == ("evidence", "contract") and target_sig == (
                "evidence", "proposal",
            )
            if contract_to_proposal:
                proposal_context = entities.get(target_context or "", {})
                if proposal_context.get("parentContextRef") != source_context:
                    errors.append(
                        f"{relationship_id}: Proposal Context must bind its "
                        "parentContextRef to the referencing Contract Context"
                    )
            evidence_to_thing = source_sig[0] == "evidence" and target_sig == (
                "participant", "thing",
            )
            if source_context != target_context and not (
                contract_to_proposal
                or evidence_to_thing
                or (source_sig[0] == "evidence" and target_sig[0] == "evidence"
                    and target_sig[1] in MOMENT_EVIDENCE_KINDS)
            ):
                errors.append(
                    f"{relationship_id}: unsupported cross-context {kind} relationship"
                )

            if (
                source_sig[0] == "evidence"
                and not (
                    evidence_to_thing
                    or target_sig[0] == "evidence"
                    or target_sig == ("role", "evidence")
                )
            ):
                errors.append(
                    f"{relationship_id}: Evidence references must target a Thing, Evidence, or Evidence Role"
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
                elif attribute.get("valueType") is not None and attribute.get("valueType") != rule.get("resultType"):
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
        raise ValueError("cannot compile model without model.json")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "model": model.manifest,
        "entities": sorted(model.entities, key=lambda item: str(item.get("id", ""))),
        "relationships": sorted(
            model.relationships, key=lambda item: str(item.get("id", ""))
        ),
        "rules": sorted(model.rules, key=lambda item: str(item.get("id", ""))),
    }
