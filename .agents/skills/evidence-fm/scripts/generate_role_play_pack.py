#!/usr/bin/env python3
"""Generate a human role-play packet from an FM validation scenario."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

from fm_model import load_model, validate_model
from fm_simulation import (
    evaluation_instance_refs,
    load_validation_suite,
    simulate_validation_suite,
    validate_validation_suite,
)
from fm_traceability import entity_attributes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an FM business role-play packet."
    )
    parser.add_argument(
        "model_dir", help="Directory containing the model and validation suite"
    )
    parser.add_argument("scenario_id", help="Scenario id to package")
    parser.add_argument("--output", required=True, help="Empty output directory")
    parser.add_argument(
        "--force", action="store_true", help="Replace an existing output directory"
    )
    return parser.parse_args()


def render_value(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return f"`{json.dumps(value, ensure_ascii=False, sort_keys=True)}`"
    return f"`{value}`"


def document_template(
    instance: dict[str, Any], entity: dict[str, Any], *, reveal_values: bool
) -> str:
    value_column = "Provided value" if reveal_values else "Role-play entry"
    lines = [
        f"# {entity.get('label')} · {instance.get('id')}",
        "",
        f"- Evidence type: `{instance.get('entityRef')}`",
        f"- Based on: {', '.join(f'`{item}`' for item in instance.get('basedOn') or []) or 'none'}",
        "",
        f"| Field | Type | Required | Key data | {value_column} |",
        "|---|---|---:|---:|---|",
    ]
    values = instance.get("values") or {}
    for name, attribute in sorted(entity_attributes(entity).items()):
        supplied = (
            render_value(values[name])
            if reveal_values and name in values
            else "________________"
        )
        lines.append(
            f"| `{name}` | `{attribute.get('valueType')}` | "
            f"{'yes' if attribute.get('required') else 'no'} | "
            f"{'yes' if attribute.get('keyData') else 'no'} | {supplied} |"
        )
    lines.extend(
        [
            "",
            "> During the exercise, use only evidence explicitly available to your Role.",
            "",
        ]
    )
    return "\n".join(lines)


def role_sheet(
    role: dict[str, Any],
    steps: list[dict[str, Any]],
    instances: dict[str, dict[str, Any]],
    scenario: dict[str, Any],
    rules: dict[str, dict[str, Any]],
) -> str:
    lines = [
        f"# Role · {role.get('label')}",
        "",
        f"Role ID: `{role.get('id')}`",
        f"Scenario as-of: `{scenario.get('asOf')}`",
        "",
        "Do not use facilitator expectations or facts that are not present in the listed documents.",
        "",
    ]
    sequence_by_instance = {
        str(step.get("issueInstanceRef")): step.get("sequence", 0)
        for step in scenario.get("steps") or []
        if isinstance(step, dict)
    }
    given_refs = {str(ref) for ref in scenario.get("givenInstanceRefs") or []}
    for step in steps:
        instance_ref = str(step.get("issueInstanceRef"))
        instance = instances.get(instance_ref, {})
        if "availableInstanceRefs" in step:
            available = list(step.get("availableInstanceRefs") or [])
        else:
            available = list(instance.get("basedOn") or [])
        lines.extend(
            [
                f"## Step {step.get('sequence')}",
                "",
                f"Available evidence: {', '.join(f'`{item}`' for item in available) or 'none'}",
                f"Issue document: `{instance_ref}` (`{instance.get('entityRef')}`)",
                "",
                "Questions before issuing:",
                "",
                "- Why is this Role responsible for issuing this Evidence?",
                "- Are all required values available from the listed evidence?",
                "- Which key values are asserted, and which are derived?",
                "- What would prevent this document from being accepted as proof?",
                "",
                "Applicable modeled rules (expressions are policy, not expected answers):",
                "",
            ]
        )
        current_sequence = step.get("sequence", 0)
        issued_so_far = given_refs | {
            ref
            for ref, sequence in sequence_by_instance.items()
            if sequence <= current_sequence
        }
        applicable: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
        for evaluation in scenario.get("evaluations") or []:
            if not isinstance(evaluation, dict):
                continue
            referenced = evaluation_instance_refs(evaluation)
            if instance_ref not in referenced or not referenced.issubset(issued_so_far):
                continue
            rule_ref = str(evaluation.get("ruleRef"))
            rule = rules.get(rule_ref)
            if rule is not None:
                applicable.append((rule_ref, rule, evaluation))
        if not applicable:
            lines.extend(["- none", ""])
        for rule_ref, rule, evaluation in sorted(applicable, key=lambda item: item[0]):
            binding_sources = {
                variable: source.get(
                    "instanceRef", source.get("instanceRefs", "scenario value")
                )
                for variable, source in (evaluation.get("bindings") or {}).items()
                if isinstance(source, dict)
            }
            lines.extend(
                [
                    f"- `{rule_ref}` ({rule.get('kind')}): `{rule.get('expression')}`",
                    f"  - Evidence bindings: `{json.dumps(binding_sources, ensure_ascii=False, sort_keys=True)}`",
                    "",
                ]
            )
    return "\n".join(lines)


def facilitator_sheet(scenario: dict[str, Any], report: dict[str, Any]) -> str:
    lines = [
        f"# Facilitator · {scenario.get('label')}",
        "",
        f"- Scenario: `{scenario.get('id')}`",
        f"- Fixed as-of time: `{scenario.get('asOf')}`",
        f"- Machine validation: `{'passed' if report.get('machineValidated') else 'failed'}`",
        f"- Scenario simulation: `{'passed' if report.get('simulationPassed') else 'failed'}`",
        f"- Stakeholder review: `{(scenario.get('stakeholderReview') or {}).get('status', 'pending')}`",
        "",
        "## Evidence sequence",
        "",
    ]
    final_values = {
        str(item.get("instanceRef")): item
        for item in report.get("instanceValues") or []
        if isinstance(item, dict)
    }
    for instance_ref in report.get("issuedInstanceRefs") or []:
        item = final_values.get(str(instance_ref), {})
        lines.append(
            f"- `{instance_ref}` → `{item.get('entityRef')}`; values: "
            f"`{json.dumps(item.get('values') or {}, ensure_ascii=False, sort_keys=True)}`"
        )
    lines.extend(["", "## Expected rule results", ""])
    for evaluation in report.get("evaluations") or []:
        lines.append(
            f"- `{evaluation.get('ruleRef')}`: "
            f"`{json.dumps(evaluation.get('result'), ensure_ascii=False, sort_keys=True)}`"
        )
    lines.extend(["", "## Expected fulfillment outcomes", ""])
    for status in report.get("fulfillmentStatuses") or []:
        lines.append(
            f"- `{status.get('fulfillmentRef')}` / `{status.get('requestInstanceRef')}`: "
            f"`{status.get('expectedStatus')}`"
        )
    lines.extend(
        [
            "",
            "## Facilitation rule",
            "",
            "Do not reveal later evidence or expected outcomes to a participant before their step.",
            "Record every piece of oral knowledge needed to continue; each one is a model gap candidate.",
            "",
        ]
    )
    return "\n".join(lines)


def audit_checklist() -> str:
    return """# Audit and dispute checklist

- Can the reviewer prove that the Contract or agreement existed?
- Which Role was responsible for each Evidence?
- Was the Request validly issued and available to its recipient?
- What business deadline applied, and where did it come from?
- Does the Confirmation prove full, partial, or no completion?
- Can every critical amount, quantity, time, and KPI be traced to source evidence?
- Were correction, cancellation, refund, reversal, and compensation recorded as new Evidence?
- Can the conclusion be reached without oral background knowledge?
- Would adding another external channel leave the core contract model unchanged?

## Observations

- Missing evidence:
- Missing key data:
- Hidden oral knowledge:
- Ambiguous Evidence responsibility:
- Proposed model correction:
- Stakeholder decision:
"""


def main() -> int:
    args = parse_args()
    model_root = Path(args.model_dir)
    model = load_model(model_root)
    suite = load_validation_suite(model_root)
    errors = [*validate_model(model), *validate_validation_suite(model, suite)]
    scenario = suite.scenarios_by_id.get(args.scenario_id)
    if scenario is None:
        errors.append(f"unknown scenario id '{args.scenario_id}'")
    if errors:
        print("Cannot generate role-play packet:", file=sys.stderr)
        for error in dict.fromkeys(errors):
            print(f"- {error}", file=sys.stderr)
        return 1
    assert scenario is not None

    simulation, simulation_errors = simulate_validation_suite(
        model, suite, [args.scenario_id]
    )
    if simulation_errors:
        print(
            "Cannot generate role-play packet from a failing scenario:", file=sys.stderr
        )
        for error in simulation_errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    result = simulation["scenarioResults"][0]
    output = Path(args.output)
    if output.exists():
        if not args.force:
            print(
                f"Output already exists: {output}; use --force to replace it",
                file=sys.stderr,
            )
            return 1
        try:
            shutil.rmtree(output)
        except OSError as error:
            print(f"Cannot replace role-play packet: {error}", file=sys.stderr)
            return 1
    documents_dir = output / "blank-documents"
    source_documents_dir = output / "source-documents"
    documents_dir.mkdir(parents=True)
    source_documents_dir.mkdir(parents=True)

    instances = suite.instances_by_id
    given_refs = {str(item) for item in scenario.get("givenInstanceRefs") or []}
    issued_refs = [str(item) for item in result.get("issuedInstanceRefs") or []]
    for instance_ref in issued_refs:
        instance = instances[instance_ref]
        entity = model.entities_by_id[str(instance["entityRef"])]
        reveal_values = instance_ref in given_refs
        directory = source_documents_dir if reveal_values else documents_dir
        path = directory / f"{instance_ref.replace('.', '--')}.md"
        path.write_text(
            document_template(instance, entity, reveal_values=reveal_values),
            encoding="utf-8",
        )

    steps_by_role: dict[str, list[dict[str, Any]]] = {}
    for step in scenario.get("steps") or []:
        steps_by_role.setdefault(str(step.get("actingRoleRef")), []).append(step)
    for role_ref, steps in sorted(steps_by_role.items()):
        role = model.entities_by_id[role_ref]
        path = output / f"{role_ref.replace('.', '--')}.md"
        path.write_text(
            role_sheet(role, steps, instances, scenario, model.rules_by_id),
            encoding="utf-8",
        )

    (output / "facilitator.md").write_text(
        facilitator_sheet(scenario, result), encoding="utf-8"
    )
    (output / "audit-checklist.md").write_text(audit_checklist(), encoding="utf-8")
    manifest = {
        "modelId": model.manifest.get("id") if model.manifest else None,
        "scenarioId": args.scenario_id,
        "asOf": result.get("asOf"),
        "machineValidated": bool(result.get("machineValidated")),
        "simulationPassed": bool(result.get("simulationPassed")),
        "stakeholderReview": scenario.get("stakeholderReview") or {"status": "pending"},
        "files": sorted(
            [
                *(
                    path.relative_to(output).as_posix()
                    for path in output.rglob("*")
                    if path.is_file()
                ),
                "manifest.json",
            ]
        ),
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Generated FM role-play packet: {output} (scenario={args.scenario_id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
