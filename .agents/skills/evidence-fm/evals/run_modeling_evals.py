#!/usr/bin/env python3
"""Prepare, optionally run, and grade Fulfillment Modeling Schema v3 evals."""

from __future__ import annotations

import argparse
import json
import re
import shlex
import shutil
import subprocess
import sys
import time
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

EVAL_DIR = Path(__file__).resolve().parent
SKILL_DIR = EVAL_DIR.parent
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from fm_model import (  # type: ignore[import-not-found]  # noqa: E402
    LoadedModel,
    compiled_document,
    load_model,
    validate_model,
)
from fm_simulation import (  # type: ignore[import-not-found]  # noqa: E402
    load_validation_suite,
    simulate_validation_suite,
)
from fm_traceability import (  # noqa: E402  # pyright: ignore[reportMissingImports]
    analyze_traceability,
)


@dataclass
class Expectation:
    text: str
    passed: bool
    evidence: str

    def as_dict(self) -> dict[str, Any]:
        return {"text": self.text, "passed": self.passed, "evidence": self.evidence}


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read JSON from {path}: {error}") from error


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def selected(items: list[dict[str, Any]], only: str | None) -> list[dict[str, Any]]:
    if not only:
        return items
    wanted = {part.strip() for part in only.split(",") if part.strip()}
    return [
        item for item in items if str(item["id"]) in wanted or item["name"] in wanted
    ]


def eval_root(workspace: Path, item: dict[str, Any]) -> Path:
    return workspace / f"eval-{item['id']}-{item['name']}"


def copy_inputs(item: dict[str, Any], destination: Path) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for relative in item.get("files", []):
        source = EVAL_DIR / relative
        target = destination / source.name
        try:
            if target.exists():
                shutil.rmtree(target) if target.is_dir() else target.unlink()
            shutil.copytree(source, target) if source.is_dir() else shutil.copy2(
                source, target
            )
        except OSError as error:
            raise RuntimeError(
                f"cannot copy eval input {source} to {target}: {error}"
            ) from error
        copied.append(str(target))
    return copied


def prepare(item: dict[str, Any], workspace: Path, configuration: str) -> None:
    root = eval_root(workspace, item)
    output = root / configuration / "outputs"
    output.mkdir(parents=True, exist_ok=True)
    copied = copy_inputs(item, root / "inputs")
    prompt = item["prompt"].replace("$modeling", "$evidence-fm")
    (root / "prompt.md").write_text(prompt + "\n", encoding="utf-8")
    (root / "expected_output.md").write_text(
        item["expected_output"] + "\n", encoding="utf-8"
    )
    write_json(
        root / "eval_metadata.json",
        {
            "eval_id": item["id"],
            "eval_name": item["name"],
            "prompt": prompt,
            "expected_output": item["expected_output"],
            "input_files": copied,
            "assertions": item.get("assertions", []),
        },
    )


def subprocess_text(value: str | bytes | None) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value or ""


def run_command(
    template: str,
    item: dict[str, Any],
    workspace: Path,
    configuration: str,
    timeout: int,
) -> None:
    root = eval_root(workspace, item)
    run_dir = root / configuration
    values = {
        "repo_root": str(Path.cwd()),
        "skill_dir": str(SKILL_DIR),
        "workspace": str(workspace),
        "eval_dir": str(root),
        "input_dir": str(root / "inputs"),
        "output_dir": str(run_dir / "outputs"),
        "prompt_file": str(root / "prompt.md"),
        "eval_id": str(item["id"]),
        "eval_name": item["name"],
    }
    command = template.format(**values)
    argv = shlex.split(command)
    started = time.monotonic()
    try:
        result = subprocess.run(
            argv,
            shell=False,
            cwd=workspace,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        stdout = result.stdout
        stderr = result.stderr
        returncode: int | None = result.returncode
        timed_out = False
    except subprocess.TimeoutExpired as error:
        stdout = subprocess_text(error.stdout)
        stderr = (
            subprocess_text(error.stderr)
            + f"\ncommand timed out after {timeout} seconds\n"
        )
        returncode = None
        timed_out = True
    except OSError as error:
        stdout = ""
        stderr = f"cannot execute command: {error}\n"
        returncode = None
        timed_out = False
    duration = time.monotonic() - started
    (run_dir / "command.txt").write_text(command + "\n", encoding="utf-8")
    (run_dir / "stdout.txt").write_text(stdout, encoding="utf-8")
    (run_dir / "stderr.txt").write_text(stderr, encoding="utf-8")
    write_json(
        run_dir / "timing.json",
        {
            "returncode": returncode,
            "timed_out": timed_out,
            "duration_seconds": round(duration, 3),
        },
    )


def find_model(output: Path) -> Path | None:
    candidates = [output / "fm-model", output]
    candidates.extend(path.parent for path in output.rglob("model.yaml"))
    seen: set[Path] = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if (candidate / "model.yaml").is_file() and (candidate / "entities").is_dir():
            return candidate
    return None


def collect_docs(output: Path) -> str:
    parts: list[str] = []
    for pattern in ("*.md", "*.txt"):
        for path in sorted(output.rglob(pattern)):
            with suppress(UnicodeDecodeError):
                parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts)


def text_of(item: dict[str, Any]) -> str:
    parts = [
        str(item.get(key, "")) for key in ("id", "label", "category", "kind", "notes")
    ]
    return " ".join(parts)


def identity_text_of(item: dict[str, Any]) -> str:
    """Return only identity-bearing fields, excluding explanatory notes."""
    return " ".join(str(item.get(key, "")) for key in ("id", "label"))


def matches(items: list[dict[str, Any]], pattern: str, **fields: str) -> bool:
    regex = re.compile(pattern, re.IGNORECASE)
    for item in items:
        if any(item.get(key) != value for key, value in fields.items()):
            continue
        if regex.search(text_of(item)):
            return True
    return False


def contains_key(value: Any, forbidden: set[str]) -> bool:
    if isinstance(value, dict):
        return any(
            key in forbidden or contains_key(child, forbidden)
            for key, child in value.items()
        )
    if isinstance(value, list):
        return any(contains_key(child, forbidden) for child in value)
    return False


def add(result: list[Expectation], text: str, passed: bool, evidence: str) -> None:
    result.append(Expectation(text, bool(passed), evidence))


def grade_context_scope(
    eval_id: int, model: LoadedModel, expectations: list[Expectation]
) -> None:
    """Check scope-specific structure; semantic coverage still needs human review."""
    entities = model.entities_by_id
    contracts = [
        item
        for item in model.entities
        if (item.get("category"), item.get("kind")) == ("evidence", "contract")
    ]
    domains = {
        key
        for key, item in entities.items()
        if (item.get("category"), item.get("kind")) == ("context", "domain")
    }
    domain_objects = {
        key
        for key, item in entities.items()
        if item.get("category") == "participant" and item.get("contextRef") in domains
    }
    if eval_id in {15, 16}:
        add(
            expectations,
            "Local scope does not invent Contracts or Fulfillments.",
            not contracts and not model.fulfillment_contexts_by_id,
            str([item.get("id") for item in contracts]),
        )
    if eval_id in {15, 19}:
        domain_rules = [
            item for item in model.rules if item.get("contextRef") in domains
        ]
        domain_relations = [
            item
            for item in model.relationships
            if item.get("sourceRef") in domain_objects
            and item.get("targetRef") in domain_objects
        ]
        add(
            expectations,
            "Domain is more than a Thing list: objects, relationships, and local CEL rules exist.",
            len(domain_objects) >= 2 and bool(domain_relations) and bool(domain_rules),
            str([item.get("id") for item in domain_rules + domain_relations]),
        )
        lineage, errors = analyze_traceability(model)
        domain_edges = [
            edge
            for edge in lineage["edges"]
            if edge["target"].split("#")[0] in domain_objects
        ]
        add(
            expectations,
            "Domain derivation has Entity-attribute lineage.",
            not errors and bool(domain_edges),
            str(domain_edges),
        )
    if eval_id == 15:
        parties = [
            item
            for item in model.entities
            if (item.get("category"), item.get("kind")) == ("participant", "party")
        ]
        add(
            expectations,
            "Customer Party is separate from the profile Thing.",
            bool(parties) and len(domain_objects) >= 2,
            str([item.get("id") for item in parties]),
        )
    if eval_id in {16, 17}:
        rfp_ids = {key for key, item in entities.items() if item.get("kind") == "rfp"}
        proposal_ids = {
            key for key, item in entities.items() if item.get("kind") == "proposal"
        }
        contract_ids = {item.get("id") for item in contracts}
        source_ids, target_ids = (
            (rfp_ids, proposal_ids) if eval_id == 16 else (proposal_ids, contract_ids)
        )
        linked = any(
            item.get("kind") == "precedes"
            and item.get("sourceRef") in source_ids
            and item.get("targetRef") in target_ids
            for item in model.relationships
        )
        add(
            expectations,
            "Channel evidence and its in-scope traceability are present.",
            bool(rfp_ids) and bool(proposal_ids) and linked,
            f"rfp={rfp_ids}; proposals={proposal_ids}; linked={linked}",
        )
    if eval_id in {17, 18}:
        targets = [
            item
            for item in model.fulfillment_contexts_by_id.values()
            if re.search(r"目标|target", identity_text_of(item), re.IGNORECASE)
        ]
        reviews = [
            item
            for item in model.fulfillment_contexts_by_id.values()
            if re.search(
                r"检查|进度|review|progress", identity_text_of(item), re.IGNORECASE
            )
        ]
        employee = r"电话销售|执行方|编辑|employee|operator|salesperson"
        manager = r"管理方|主管|主编|manager|supervisor"

        def directed(
            items: list[dict[str, Any]], request_role: str, confirmation_role: str
        ) -> bool:
            def members(context_ref: object, kind: str) -> list[dict[str, Any]]:
                return [
                    entity
                    for entity in entities.values()
                    if entity.get("contextRef") == context_ref
                    and entity.get("kind") == kind
                ]

            def responsible_role(evidence: dict[str, Any]) -> dict[str, Any]:
                return entities.get(str(evidence.get("responsibleRoleRef")), {})

            return bool(items) and all(
                any(
                    re.search(
                        request_role,
                        identity_text_of(responsible_role(evidence)),
                        re.IGNORECASE,
                    )
                    for evidence in members(item.get("id"), "fulfillment_request")
                )
                and any(
                    re.search(
                        confirmation_role,
                        identity_text_of(responsible_role(evidence)),
                        re.IGNORECASE,
                    )
                    for evidence in members(
                        item.get("id"), "fulfillment_confirmation"
                    )
                )
                for item in items
            )

        add(
            expectations,
            "KPI agreement uses ordinary Contract and manager-to-executor progress review.",
            bool(contracts) and directed(reviews, manager, employee),
            str([item.get("id") for item in reviews]),
        )
        if eval_id == 17:
            add(
                expectations,
                "Pre-agreement negotiation does not become target-setting Fulfillment.",
                not targets,
                str(targets),
            )
        else:
            add(
                expectations,
                "Target change reverses only its own Evidence responsibility direction.",
                directed(targets, employee, manager),
                str(targets),
            )
            decisions = [
                entity
                for item in targets
                for entity in entities.values()
                if entity.get("contextRef") == item.get("id")
                and entity.get("kind") == "fulfillment_confirmation"
            ]
            explicit_decision = any(
                re.search(
                    r"approved|decision|同意|批准|决定", str(attribute), re.IGNORECASE
                )
                for item in decisions
                for attribute in item.get("attributes") or []
            )
            add(
                expectations,
                "Decision evidence distinguishes approval from merely replying.",
                explicit_decision,
                str(decisions),
            )
    if eval_id == 19:
        subjects = {
            relation.get("targetRef")
            for relation in model.relationships
            if relation.get("kind") == "references"
            and (entities.get(str(relation.get("sourceRef"))) or {}).get("kind")
            == "fulfillment_request"
        }
        add(
            expectations,
            "Fulfillment consumes domain Participants without treating them as confirmation.",
            bool(subjects & domain_objects),
            str(subjects),
        )
        parties = [
            item.get("id")
            for item in model.entities
            if (item.get("category"), item.get("kind")) == ("participant", "party")
        ]
        add(
            expectations,
            "Unknown Customer identity is not fabricated.",
            not parties,
            str(parties),
        )


def grade(item: dict[str, Any], workspace: Path, configuration: str) -> dict[str, Any]:
    output = eval_root(workspace, item) / configuration / "outputs"
    model_dir = find_model(output)
    docs = collect_docs(output)
    expectations: list[Expectation] = []
    raw_eval_id = item.get("id")
    eval_id = raw_eval_id if isinstance(raw_eval_id, int) else -1

    if eval_id == 6:
        add(
            expectations,
            "Pure tool case does not force an FM model.",
            model_dir is None,
            str(model_dir),
        )
        add(
            expectations,
            "Simple glue integration ends with an explicit no-model scope explanation.",
            (output / "analysis.md").is_file()
            and bool(
                re.search(
                    r"不需.*建模|无需.*建模|简单集成|胶水|无独立.*领域",
                    docs,
                    re.IGNORECASE,
                )
            ),
            docs[:400],
        )
        return save_grade(item, workspace, configuration, expectations, model_dir)

    if eval_id == 13:
        discovery_files = [
            path
            for path in output.rglob("*")
            if path.is_file() and "discovery" in path.parts
        ]
        discovery_text_parts = [docs]
        for path in discovery_files:
            with suppress(UnicodeDecodeError):
                discovery_text_parts.append(path.read_text(encoding="utf-8"))
        discovery_text = "\n".join(discovery_text_parts)
        add(
            expectations,
            "Ambiguous narrative produces discovery artifacts before a final model.",
            bool(discovery_files),
            str(discovery_files),
        )
        add(
            expectations,
            "Discovery asks about contract Roles, Evidence responsibility, confirmation, interval, and breach.",
            bool(
                re.search(r"合同|签约", discovery_text, re.IGNORECASE)
                and re.search(r"角色|责任", discovery_text, re.IGNORECASE)
                and re.search(r"确认|凭证|证明", discovery_text, re.IGNORECASE)
                and re.search(r"时限|期限|interval", discovery_text, re.IGNORECASE)
                and re.search(r"违约|异常|补偿", discovery_text, re.IGNORECASE)
            ),
            discovery_text[:800],
        )
        draft_only = model_dir is None
        if model_dir is not None:
            discovery_model = load_model(model_dir)
            discovery_errors = validate_model(discovery_model)
            draft_only = bool(
                not discovery_errors
                and discovery_model.manifest
                and discovery_model.manifest.get("modelStatus") == "draft"
                and (discovery_model.manifest.get("stakeholderReview") or {}).get(
                    "status"
                )
                == "pending"
            )
        add(
            expectations,
            "No confirmed model or stakeholder review is fabricated.",
            draft_only,
            str(model_dir),
        )
        return save_grade(item, workspace, configuration, expectations, model_dir)

    if model_dir is None:
        add(
            expectations,
            "Output contains an fm-model directory.",
            False,
            "No model.yaml found",
        )
        return save_grade(item, workspace, configuration, expectations, model_dir)

    model = load_model(model_dir)
    errors = validate_model(model)
    add(
        expectations,
        "FM Schema v3 validation passes.",
        not errors,
        "\n".join(errors) or "valid",
    )
    add(
        expectations,
        "Manifest declares Schema v3 and CEL.",
        bool(
            model.manifest
            and model.manifest.get("schemaVersion") == "3.0"
            and model.manifest.get("ruleLanguage") == "CEL"
        ),
        str(model.manifest),
    )
    generated = model_dir / "generated" / "model.json"
    compiled_ok = False
    if generated.is_file() and not errors:
        try:
            compiled_ok = read_json(generated) == compiled_document(model)
        except (OSError, json.JSONDecodeError):
            compiled_ok = False
    add(
        expectations,
        "Deterministic generated/model.json matches YAML.",
        compiled_ok,
        str(generated),
    )
    add(
        expectations,
        "No legacy custom rule or forced Role-player fields remain.",
        not contains_key(
            compiled_document(model),
            {
                "calculationRule",
                "precondition",
                "partyAssignments",
                "sourceEvidenceRefs",
            },
        )
        if model.manifest
        else False,
        "Searched compiled model for calculationRule/precondition/partyAssignments/sourceEvidenceRefs",
    )

    entities = model.entities
    fulfillments = list(model.fulfillment_contexts_by_id.values())
    relationships = model.relationships
    rules = model.rules
    business_patterns = model.business_patterns
    entities_by_id = model.entities_by_id
    strict_boundaries = all(
        fulfillment.get("category") == "context"
        and fulfillment.get("kind") == "fulfillment"
        and (entities_by_id.get(str(fulfillment.get("parentContextRef"))) or {}).get(
            "kind"
        )
        == "contract"
        for fulfillment in fulfillments
    )
    request_entities = [
        entity
        for entity in entities
        if entity.get("kind") == "fulfillment_request"
    ]
    explicit_intervals = all(
        {attribute.get("name") for attribute in request.get("attributes") or []}
        >= {"started_at", "expired_at"}
        for request in request_entities
    ) and len(request_entities) == len(fulfillments)
    add(
        expectations,
        "Every Fulfillment is a child Context of its Contract Context.",
        strict_boundaries,
        str([item.get("parentContextRef") for item in fulfillments]),
    )
    add(
        expectations,
        "Every Fulfillment Request declares its evidence interval.",
        explicit_intervals,
        str([item.get("id") for item in request_entities]),
    )
    if eval_id not in {15, 16}:
        add(
            expectations,
            "This scenario includes at least one actual Fulfillment.",
            bool(fulfillments),
            str(len(fulfillments)),
        )
    thing_entities = [
        entity
        for entity in entities
        if (entity.get("category"), entity.get("kind")) == ("participant", "thing")
    ]
    domain_inputs_are_bounded = all(
        (entities_by_id.get(str(entity.get("contextRef"))) or {}).get("kind")
        == "domain"
        for entity in thing_entities
    )
    add(
        expectations,
        "Every Thing belongs to a Domain Context.",
        domain_inputs_are_bounded,
        str([entity.get("id") for entity in thing_entities]),
    )

    if eval_id in {15, 16, 17, 18, 19}:
        grade_context_scope(eval_id, model, expectations)

    if eval_id == 0:
        add(
            expectations,
            "VIP agreement is a Contract.",
            matches(entities, r"VIP|会员", category="evidence", kind="contract"),
            "Contract lookup",
        )
        add(
            expectations,
            "Purchase, activation, and refund are explicit Fulfillments.",
            all(
                matches(fulfillments, pattern)
                for pattern in (r"购买|充值", r"开通|权益", r"退款|退费")
            ),
            "Fulfillment lookup",
        )
        add(
            expectations,
            "Entitlement calculation is a Domain Role.",
            matches(entities, r"权益.*计算|计算.*权益", category="role", kind="domain"),
            "Domain Role lookup",
        )
    elif eval_id == 1:
        evidence_role_ids = {
            entity.get("id")
            for entity in entities
            if entity.get("category") == "role"
            and entity.get("kind") == "evidence"
            and re.search(r"支付|付款|退款", text_of(entity), re.IGNORECASE)
        }
        add(
            expectations,
            "Payment variation uses Evidence Role.",
            bool(evidence_role_ids),
            str(evidence_role_ids),
        )
        role_bridges = [
            relation
            for relation in relationships
            if relation.get("kind") == "plays_role"
            and relation.get("targetRef") in evidence_role_ids
        ]
        add(
            expectations,
            "Cross-context moment Evidence plays the Evidence Role.",
            bool(role_bridges),
            str(role_bridges),
        )
        provider_parties = [
            entity.get("id")
            for entity in entities
            if entity.get("category") == "participant"
            and entity.get("kind") == "party"
            and re.search(
                r"微信|支付宝|支付.*供应|payment.*provider",
                text_of(entity),
                re.IGNORECASE,
            )
        ]
        add(
            expectations,
            "Unknown payment providers are not fabricated as Party.",
            not provider_parties,
            str(provider_parties),
        )
    elif eval_id == 2:
        add(
            expectations,
            "Pre-contract/channel Context exists.",
            any(
                entity.get("category") == "context"
                and entity.get("kind") in {"pre_contract", "channel"}
                for entity in entities
            ),
            "Context lookup",
        )
        add(
            expectations,
            "RFP and multiple Proposal evidence exist.",
            matches(entities, r".", category="evidence", kind="rfp")
            and sum(1 for entity in entities if entity.get("kind") == "proposal") >= 3,
            "Evidence counts",
        )
        add(
            expectations,
            "Proposal precedes Contract.",
            any(rel.get("kind") == "precedes" for rel in relationships),
            "precedes relationship",
        )
    elif eval_id == 3:
        add(
            expectations,
            "Performance agreement is a Contract.",
            matches(entities, r"绩效|KPI", category="evidence", kind="contract"),
            "Contract lookup",
        )
        add(
            expectations,
            "Coaching is an explicit Fulfillment.",
            matches(fulfillments, r"辅导|改进"),
            "Fulfillment lookup",
        )
        add(
            expectations,
            "KPI rules use CEL Rule documents.",
            matches(rules, r"KPI|指标|联系|达成"),
            "Rule lookup",
        )
    elif eval_id == 4:
        add(
            expectations,
            "Missing payment Confirmation is restored.",
            matches(
                entities,
                r"付款|支付",
                category="evidence",
                kind="fulfillment_confirmation",
            ),
            "Confirmation lookup",
        )
    elif eval_id == 5:
        add(
            expectations,
            "Cancellation, return, and refund are new Fulfillments.",
            all(
                matches(fulfillments, pattern)
                for pattern in (r"取消", r"退货", r"退款|退费")
            ),
            "Reverse Fulfillment lookup",
        )
    elif eval_id == 7:
        policy_ok = any(
            (item.get("completionPolicy") or {}).get("mode") in {"count", "amount"}
            for item in fulfillments
        )
        add(
            expectations,
            "Partial confirmations use count/amount completion policy.",
            policy_ok,
            "completionPolicy lookup",
        )
        add(
            expectations,
            "A completion CEL Rule exists.",
            any(rule.get("kind") == "completion" for rule in rules),
            "Rule lookup",
        )
        add(
            expectations,
            "Compensation is a new Fulfillment.",
            matches(fulfillments, r"赔偿|补偿"),
            "Fulfillment lookup",
        )
    elif eval_id == 8:
        triggers = [item.get("requestTrigger") or {} for item in fulfillments]
        add(
            expectations,
            "Scheduled trigger acts for a business Role.",
            any(
                trigger.get("kind") == "schedule" and trigger.get("actsForRoleRef")
                for trigger in triggers
            ),
            str(triggers),
        )
        system_participants = [
            entity.get("id")
            for entity in entities
            if entity.get("category") == "participant"
            and re.search(r"系统|调度|system|scheduler", text_of(entity), re.IGNORECASE)
        ]
        add(
            expectations,
            "System/scheduler is not modeled as Participant.",
            not system_participants,
            str(system_participants),
        )
    elif eval_id == 9:
        add(
            expectations,
            "All rules are CEL expressions with bindings.",
            bool(rules)
            and all(
                rule.get("expression") and isinstance(rule.get("bindings"), dict)
                for rule in rules
            ),
            "Rule structure lookup",
        )
        add(
            expectations,
            "Derivation rules declare targets.",
            all(
                rule.get("target") for rule in rules if rule.get("kind") == "derivation"
            ),
            "Derivation target lookup",
        )
    elif eval_id == 10:
        entity_ids = {str(entity.get("id")) for entity in entities}
        customer_party_ids = {
            str(entity.get("id"))
            for entity in entities
            if entity.get("category") == "participant"
            and entity.get("kind") == "party"
            and re.search(r"客户|\bcustomer\b", text_of(entity), re.IGNORECASE)
        }
        subscriber_role_ids = {
            str(entity.get("id"))
            for entity in entities
            if entity.get("category") == "role"
            and re.search(r"订阅方|订阅者|subscriber", text_of(entity), re.IGNORECASE)
        }
        payment_holder_role_ids = {
            str(entity.get("id"))
            for entity in entities
            if entity.get("category") == "role"
            and re.search(
                r"支付.*持有人|账户.*持有人|payment.*holder|account.*holder",
                text_of(entity),
                re.IGNORECASE,
            )
        }
        customer_role_targets = {
            relation.get("targetRef")
            for relation in relationships
            if relation.get("kind") == "plays_role"
            and relation.get("sourceRef") in customer_party_ids
        }
        expected_customer_bindings = bool(
            customer_party_ids
            and customer_role_targets & subscriber_role_ids
            and customer_role_targets & payment_holder_role_ids
        )
        add(
            expectations,
            "Customer Party explicitly plays subscriber and payment-account-holder Roles.",
            expected_customer_bindings,
            str(customer_role_targets),
        )
        forbidden_parties = [
            entity.get("id")
            for entity in entities
            if entity.get("category") == "participant"
            and entity.get("kind") == "party"
            and re.search(
                r"订阅方|内容平台|支付服务提供方|subscriber|content.*platform|payment.*provider",
                identity_text_of(entity),
                re.IGNORECASE,
            )
        ]
        add(
            expectations,
            "No role-name placeholder Party is fabricated.",
            not forbidden_parties,
            str(forbidden_parties),
        )
        evidence_roles = {
            str(entity.get("id"))
            for entity in entities
            if entity.get("category") == "role" and entity.get("kind") == "evidence"
        }
        external_payment_bridges = [
            relation
            for relation in relationships
            if relation.get("kind") == "plays_role"
            and relation.get("sourceRef") in entity_ids
            and relation.get("targetRef") in evidence_roles
            and re.search(
                r"外部支付|渠道支付|external.*payment|channel.*payment",
                text_of(model.entities_by_id.get(str(relation.get("sourceRef")), {})),
                re.IGNORECASE,
            )
        ]
        add(
            expectations,
            "External payment Confirmation plays the subscription Evidence Role.",
            bool(external_payment_bridges),
            str(external_payment_bridges),
        )
    elif eval_id == 11:
        contracts = [
            entity
            for entity in entities
            if entity.get("category") == "evidence" and entity.get("kind") == "contract"
        ]
        add(
            expectations,
            "Content-platform model contains exactly three Contracts.",
            len(contracts) == 3,
            str([item.get("id") for item in contracts]),
        )
        add(
            expectations,
            "Content-platform model contains exactly nine Fulfillments.",
            len(fulfillments) == 9,
            str([item.get("id") for item in fulfillments]),
        )
        contexts = {(entity.get("category"), entity.get("kind")) for entity in entities}
        add(
            expectations,
            "Pre-contract and domain Contexts are present.",
            {("context", "pre_contract"), ("context", "domain")}.issubset(contexts),
            str(contexts),
        )
        placeholders = [
            entity.get("id")
            for entity in entities
            if entity.get("category") == "participant"
            and entity.get("kind") == "party"
            and re.search(
                r"订阅方|创作者|运营方|内容平台|subscriber|creator|operator|content.*platform",
                identity_text_of(entity),
                re.IGNORECASE,
            )
        ]
        add(
            expectations,
            "Multi-contract model does not fabricate Role-name Parties.",
            not placeholders,
            str(placeholders),
        )
        customer_ids = {
            str(entity.get("id"))
            for entity in entities
            if entity.get("category") == "participant"
            and entity.get("kind") == "party"
            and re.search(r"客户|\bcustomer\b", text_of(entity), re.IGNORECASE)
        }
        subscriber_ids = {
            str(entity.get("id"))
            for entity in entities
            if entity.get("category") == "role"
            and re.search(r"订阅方|订阅者|subscriber", text_of(entity), re.IGNORECASE)
        }
        customer_subscriber = any(
            relation.get("kind") == "plays_role"
            and relation.get("sourceRef") in customer_ids
            and relation.get("targetRef") in subscriber_ids
            for relation in relationships
        )
        add(
            expectations,
            "Customer explicitly plays Subscriber.",
            customer_subscriber,
            f"customers={customer_ids}; subscribers={subscriber_ids}",
        )
        candidate_patterns = [
            pattern
            for pattern in business_patterns
            if pattern.get("reuseStatus") == "candidate"
        ]
        add(
            expectations,
            "Single-domain content operation remains a candidate Business Pattern.",
            bool(candidate_patterns),
            str(candidate_patterns),
        )
        add(
            expectations,
            "Derived business-pattern Markdown exists.",
            (model_dir / "02-business-patterns.md").is_file(),
            str(model_dir / "02-business-patterns.md"),
        )
    elif eval_id == 12:
        lineage, lineage_errors = analyze_traceability(model)
        key_nodes = [node for node in lineage["nodes"] if node.get("keyData")]
        add(
            expectations,
            "Key data has valid CEL-derived attribute lineage.",
            not lineage_errors and bool(key_nodes) and len(lineage["edges"]) >= 3,
            "\n".join(lineage_errors)
            or f"nodes={len(key_nodes)}; edges={len(lineage['edges'])}",
        )
        suite = load_validation_suite(model_dir)
        simulation, simulation_errors = simulate_validation_suite(model, suite)
        statuses = {
            status.get("status")
            for result in simulation.get("scenarioResults") or []
            for status in result.get("fulfillmentStatuses") or []
        }
        add(
            expectations,
            "A successful and an overdue evidence scenario both pass.",
            not simulation_errors
            and len(simulation.get("scenarioResults") or []) >= 2
            and {"completed", "breached"}.issubset(statuses),
            "\n".join(simulation_errors) or str(sorted(statuses)),
        )
        reviews = [
            (result.get("stakeholderReview") or {}).get("status")
            for result in simulation.get("scenarioResults") or []
        ]
        add(
            expectations,
            "Machine simulation does not claim stakeholder confirmation.",
            bool(reviews) and all(status == "pending" for status in reviews),
            str(reviews),
        )
        generated_lineage = model_dir / "generated" / "traceability.json"
        generated_simulation = model_dir / "generated" / "simulation.json"
        try:
            lineage_matches = read_json(generated_lineage) == lineage
        except ValueError:
            lineage_matches = False
        try:
            simulation_matches = read_json(generated_simulation) == simulation
        except ValueError:
            simulation_matches = False
        add(
            expectations,
            "Generated traceability and simulation reports are deterministic.",
            lineage_matches and simulation_matches,
            f"lineage={generated_lineage}; simulation={generated_simulation}",
        )
    elif eval_id == 14:
        domain_contexts = [
            entity
            for entity in entities
            if (entity.get("category"), entity.get("kind")) == ("context", "domain")
        ]
        supported_patterns = [
            pattern
            for pattern in business_patterns
            if pattern.get("reuseStatus") == "supported"
            and len(pattern.get("supportedByContractContextRefs") or []) >= 2
            and len(pattern.get("domainExampleContextRefs") or []) >= 2
            and (pattern.get("stakeholderReview") or {}).get("status") == "pending"
        ]
        add(
            expectations,
            "Cross-domain model contains at least two Domain Contexts.",
            len(domain_contexts) >= 2,
            str([item.get("id") for item in domain_contexts]),
        )
        add(
            expectations,
            "Business Pattern is supported by two contracts and two domains but not confirmed.",
            bool(supported_patterns),
            str(supported_patterns),
        )
        pattern_markdown = model_dir / "02-business-patterns.md"
        add(
            expectations,
            "Derived business-pattern Markdown exists and names the pattern.",
            pattern_markdown.is_file()
            and bool(
                re.search(
                    r"付款|权益|访问", pattern_markdown.read_text(encoding="utf-8")
                )
            ),
            str(pattern_markdown),
        )

    return save_grade(item, workspace, configuration, expectations, model_dir)


def save_grade(
    item: dict[str, Any],
    workspace: Path,
    configuration: str,
    expectations: list[Expectation],
    model_dir: Path | None,
) -> dict[str, Any]:
    passed = sum(expectation.passed for expectation in expectations)
    result = {
        "run_id": f"eval-{item['id']}-{configuration}",
        "eval_id": item["id"],
        "eval_name": item["name"],
        "configuration": configuration,
        "model_dir": str(model_dir) if model_dir else None,
        "expectations": [expectation.as_dict() for expectation in expectations],
        "passed": passed,
        "total": len(expectations),
        "pass_rate": round(passed / len(expectations), 4) if expectations else 0,
        "graded_at": now(),
    }
    write_json(eval_root(workspace, item) / configuration / "grading.json", result)
    return result


def write_benchmark(
    workspace: Path, configuration: str, results: list[dict[str, Any]]
) -> None:
    total = sum(item["total"] for item in results)
    passed = sum(item["passed"] for item in results)
    payload = {
        "skill_name": "evidence-fm",
        "schema_version": "3.0",
        "configuration": configuration,
        "generated_at": now(),
        "summary": {
            "evals_passed": sum(item["passed"] == item["total"] for item in results),
            "evals_total": len(results),
            "assertions_passed": passed,
            "assertions_total": total,
            "assertion_pass_rate": round(passed / total, 4) if total else 0,
        },
        "eval_results": results,
    }
    write_json(workspace / "results.json", payload)
    write_json(workspace / "benchmark.json", payload)
    lines = [
        "# modeling Schema v3 eval benchmark",
        "",
        f"- Configuration: `{configuration}`",
        f"- Evals passed: {payload['summary']['evals_passed']}/{len(results)}",
        f"- Assertions passed: {passed}/{total}",
        "",
        "| Eval | Name | Result |",
        "|---:|---|---:|",
    ]
    lines.extend(
        f"| {item['eval_id']} | {item['eval_name']} | {item['passed']}/{item['total']} |"
        for item in results
    )
    (workspace / "benchmark.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run or grade modeling Schema v3 evals"
    )
    parser.add_argument("--evals", default=str(Path(__file__).with_name("evals.json")))
    parser.add_argument(
        "--workspace", default=str(Path.cwd() / "modeling-workspace" / "iteration-1")
    )
    parser.add_argument("--configuration", default="with_skill")
    parser.add_argument("--only")
    parser.add_argument("--clean", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--grade-only", action="store_true")
    parser.add_argument("--command-template")
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--fail-on-grade-failure", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workspace = Path(args.workspace).resolve()
    payload = read_json(Path(args.evals))
    items = selected(payload["evals"], args.only)
    if args.clean and workspace.exists() and not args.grade_only:
        try:
            shutil.rmtree(workspace)
        except OSError as error:
            print(f"cannot clean workspace {workspace}: {error}", file=sys.stderr)
            return 2
    workspace.mkdir(parents=True, exist_ok=True)

    if not args.grade_only:
        for item in items:
            prepare(item, workspace, args.configuration)
            print(f"prepared eval {item['id']} {item['name']}")
    if args.prepare_only:
        return 0
    if args.command_template and not args.grade_only:
        for position, item in enumerate(items, start=1):
            print(
                f"running eval {item['id']} {item['name']} "
                f"({position}/{len(items)}, timeout={args.timeout_seconds}s)",
                flush=True,
            )
            run_command(
                args.command_template,
                item,
                workspace,
                args.configuration,
                args.timeout_seconds,
            )
            timing_path = (
                eval_root(workspace, item) / args.configuration / "timing.json"
            )
            timing = read_json(timing_path)
            outcome = (
                "timed out"
                if timing.get("timed_out")
                else f"returncode={timing.get('returncode')}"
            )
            print(
                f"finished eval {item['id']} in {timing.get('duration_seconds')}s ({outcome})",
                flush=True,
            )

    results = [grade(item, workspace, args.configuration) for item in items]
    write_benchmark(workspace, args.configuration, results)
    for result in results:
        print(f"eval {result['eval_id']}: {result['passed']}/{result['total']}")
    if args.fail_on_grade_failure and any(
        item["passed"] != item["total"] for item in results
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
