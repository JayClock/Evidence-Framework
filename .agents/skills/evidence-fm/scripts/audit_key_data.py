#!/usr/bin/env python3
"""Inventory key data items by how their value is established.

Report-only: it never writes the model. Every key data item is classified as a
contract term, a domain source, a negotiation source, a result fact, a request
formation input, a derived value, or a decision still owed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from fm_model import load_model, validate_model
from fm_traceability import analyze_traceability

# Values a requesting party records when it forms the request itself.
REQUEST_FORMATION_FIELDS = {
    "started_at",
    "request_number",
    "delivery_address",
    "return_address",
    "fault_description",
    "asset_code",
    "billing_period",
    "settlement_period",
}


def classify(
    entity: dict[str, Any], attribute: dict[str, Any], derived: bool
) -> str:
    if derived:
        return "derived"
    category = entity.get("category")
    kind = entity.get("kind")
    if category == "evidence" and kind == "contract":
        return "contract-term"
    if category == "participant" and kind == "thing":
        return "domain-source"
    if category == "evidence" and kind in {"rfp", "proposal"}:
        return "negotiation-source"
    if category == "evidence" and kind in {
        "fulfillment_confirmation",
        "other_evidence",
    }:
        return "result-fact"
    if category == "evidence" and kind == "fulfillment_request":
        if attribute.get("name") in REQUEST_FORMATION_FIELDS:
            return "request-input"
        return "needs-decision"
    return "other"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "model_dir",
        help="Directory containing model.json and FM shards, or one *.evidence.json bundle",
    )
    args = parser.parse_args()

    try:
        model = load_model(Path(args.model_dir))
    except (OSError, ValueError) as error:
        print(json.dumps({"checkVersion": 1, "valid": False, "errors": [str(error)]}, ensure_ascii=False, indent=2))
        return 1

    errors = validate_model(model)
    document, traceability_errors = analyze_traceability(model)
    errors = list(dict.fromkeys([*errors, *traceability_errors]))
    if errors:
        print(json.dumps({"checkVersion": 1, "valid": False, "errors": errors}, ensure_ascii=False, indent=2))
        return 1

    sources: dict[str, list[str]] = {}
    for edge in document.get("edges") or []:
        sources.setdefault(edge["target"], []).append(edge["source"])

    counts: dict[str, int] = {}
    needs_decision: list[dict[str, Any]] = []
    derived: list[dict[str, Any]] = []
    for node in document.get("nodes") or []:
        if not node.get("keyData"):
            continue
        entity = model.entities_by_id.get(node["entityRef"], {})
        attribute = next(
            (
                item
                for item in entity.get("attributes") or []
                if item.get("name") == node["attribute"]
            ),
            {},
        )
        origin = str(node.get("origin"))
        bucket = classify(entity, attribute, origin == "derived")
        counts[bucket] = counts.get(bucket, 0) + 1
        entry = {
            "path": node["path"],
            "valueType": node.get("valueType"),
            "meaning": attribute.get("meaning"),
            "contextRef": entity.get("contextRef"),
        }
        if bucket == "derived":
            rule_ref = attribute.get("derivedByRuleRef")
            entry = {
                "path": node["path"],
                "ruleRef": rule_ref,
                "sources": sorted(set(sources.get(node["path"], []))),
            }
            derived.append(entry)
        elif bucket == "needs-decision":
            needs_decision.append(entry)

    report = {
        "checkVersion": 1,
        "valid": True,
        "modelId": model.manifest.get("id"),
        "keyDataCount": sum(counts.values()),
        "counts": dict(sorted(counts.items())),
        "needsDecision": sorted(needs_decision, key=lambda item: item["path"]),
        "derived": sorted(derived, key=lambda item: item["path"]),
        "note": "needsDecision 是待决清单，不是错误：每项须给出提供方结论（合同参数、前序凭证属性或请求形成事实），或补派生规则。",
    }
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
