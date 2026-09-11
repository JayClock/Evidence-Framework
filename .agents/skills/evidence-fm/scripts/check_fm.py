#!/usr/bin/env python3
"""Read-only portable FM check; no executed scenarios means no simulation claim."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from build_fm_timeline import (  # pyright: ignore[reportMissingImports]
    build_timeline,
    timeline_summary,
)
from fm_model import load_model, validate_model
from fm_simulation import (
    load_validation_suite,
    simulate_validation_suite,
    validate_validation_suite,
)


def check_model(root: Path) -> dict[str, Any]:
    model = load_model(root)
    model_errors = validate_model(model)
    suite = load_validation_suite(root)
    suite_errors = validate_validation_suite(model, suite)
    timeline, timeline_errors = build_timeline(model, suite)
    errors = list(dict.fromkeys([*model_errors, *suite_errors, *timeline_errors]))
    simulation_passed: bool | None = None
    executed = 0
    if not errors and suite.scenarios:
        simulation, simulation_errors = simulate_validation_suite(model, suite)
        executed = len(simulation["scenarioResults"])
        if executed:
            simulation_passed = bool(simulation["simulationPassed"])
        errors = list(dict.fromkeys([*errors, *simulation_errors]))
    manifest = model.manifest or {}
    return {
        "valid": not errors,
        "modelValidated": not model_errors,
        "modelStatus": manifest.get("modelStatus"),
        "stakeholderReview": manifest.get("stakeholderReview"),
        "scenarioCount": len(suite.scenarios),
        "executedScenarioCount": executed,
        "simulationPassed": simulation_passed,
        "timelineSummary": timeline_summary(timeline),
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model_dir", type=Path, help="Directory containing model.yaml")
    args = parser.parse_args()
    report = check_model(args.model_dir)
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
