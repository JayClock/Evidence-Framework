#!/usr/bin/env python3
"""Validate a Fulfillment Modeling Schema v2 directory."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from fm_model import load_model, validate_model
from fm_simulation import load_validation_suite, simulate_validation_suite


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate an FM Schema v2 model directory."
    )
    parser.add_argument(
        "model_dir", help="Directory containing model.yaml and FM shards"
    )
    parser.add_argument(
        "--json", action="store_true", help="Emit a machine-readable validation result"
    )
    parser.add_argument(
        "--model-only",
        action="store_true",
        help="Validate model structure, semantics and lineage without running scenarios",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.model_dir)
    model = load_model(root)
    model_errors = validate_model(model)
    errors = list(model_errors)
    suite = None if args.model_only else load_validation_suite(root)
    simulation = None
    if suite is not None and suite.root.exists():
        simulation, simulation_errors = simulate_validation_suite(model, suite)
        errors = list(dict.fromkeys([*errors, *simulation_errors]))
    result = {
        "valid": not errors,
        "machineValidated": not model_errors
        and (simulation is None or bool(simulation.get("machineValidated"))),
        "modelDir": str(root.resolve()),
        "schemaVersion": model.manifest.get("schemaVersion")
        if model.manifest
        else None,
        "counts": {
            "entities": len(model.entities),
            "fulfillments": len(model.fulfillments),
            "relationships": len(model.relationships),
            "rules": len(model.rules),
            "evidenceInstances": len(suite.instances) if suite is not None else 0,
            "scenarios": len(suite.scenarios) if suite is not None else 0,
        },
        "simulationPassed": simulation.get("simulationPassed")
        if simulation is not None
        else None,
        "errors": errors,
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif errors:
        print("FM Schema v2 validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
    else:
        counts = result["counts"]
        scenario_summary = (
            f", evidenceInstances={counts['evidenceInstances']}, scenarios={counts['scenarios']}, "
            f"simulation={'passed' if result['simulationPassed'] else 'not-run'}"
            if counts["scenarios"]
            else ""
        )
        print(
            "FM Schema v2 validation passed "
            f"(entities={counts['entities']}, fulfillments={counts['fulfillments']}, "
            f"relationships={counts['relationships']}, rules={counts['rules']}"
            f"{scenario_summary})."
        )
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
