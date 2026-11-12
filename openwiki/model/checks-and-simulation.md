---
type: pipeline
title: The native check and simulation pipeline
description: What one FM check actually proves — static consistency, scope completeness, CEL evaluation, scenario truth, evidence ordering and lineage — and how the report, digest and downstream readiness contract fit together.
tags: [validation, check, scope, simulation, cel, timeline, traceability]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-9e1c9e40521fc9e802e78473
    resource: repo://libs/evidence-model-core/src/cli.ts
  - id: openwiki-source-9008514a60858ff717f539ab
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.ts
  - id: openwiki-source-bb6561cac02f8a21961ea926
    resource: repo://libs/evidence-model-core/src/validation/scope.ts
  - id: openwiki-source-994de753deff0ddcd24eae68
    resource: repo://libs/evidence-model-core/src/validation/simulation.ts
  - id: openwiki-source-74bf91bf839e12ce789cd1b3
    resource: repo://libs/evidence-model-core/src/validation/timeline.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# The native check and simulation pipeline

`evidence-model-core` answers one question with one report: *may this model, or
this scope of it, be trusted?* The answer is deliberately split into three
independent ones, because they fail differently:

| Report field | Question | Blocking? |
| --- | --- | --- |
| `consistent` | does the model close structurally and in its rules | yes |
| `complete` | does the requested scope carry a whole responsibility | only when asked |
| `simulationPassed` | do the scenarios assert what the model claims | yes, once required |

`buildFmCheckReport` is the single entry point; the CLI, the sensors and the agent
tools all call it, so a terminal and a window cannot disagree
(`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L164-L296`).

## The pipeline in order

```text
read sources
  ├── strictValidateDomainModel      structural FM checks
  ├── analyzeTraceability            attribute lineage
  ├── validateValidationSuite        instances + scenarios
  └── buildTimeline                  evidence ordering
        ↓
  scope selection (when --scope given)
        ↓
  completeness gaps
        ↓
  scenario applicability + coverage gaps
        ↓
  digest re-read → inputChanged
        ↓
  simulateValidationSuite (only when nothing blocks and nothing is owed)
        ↓
  FmCheckReport
```

The order is causal, not cosmetic: a broken source stops the timeline, an invalid
model stops completeness (`modelValidated` gates it), and a gap stops simulation.
A scenario run on an inconsistent model would prove nothing.

## Consistency

Static errors are the union of:

- problems found while reading the sources;
- `strictValidateDomainModel` issues, rendered as `path: message`;
- `analyzeTraceability` errors;
- validation-suite errors;
- timeline errors.

They are de-duplicated and become `errors`
(`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L170-L190`).
`consistent` is true only when that list is empty **and** the digest did not move
during the check (`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L254-L256`).

This is where the language's structural rules become blocking findings: a
duplicate id, a contract without two roles, a play-role in the wrong direction, a
derivation whose target does not point back, a `many` binding read without a macro,
or an interval that starts after it expires all stop the model here.

## Scope is a delivery unit, not a filter

`selectScope` takes **independent Context ids** and refuses anything else:

- an id that is not a Context, or that has a `parentContextRef`, is rejected with
  "must be an independent Context, not a fulfillment slice";
- duplicates are rejected.

The walk then keeps whole Contexts, their descendants and real dependencies. Two
rules make it trustworthy
(`repo://libs/evidence-model-core/src/validation/scope.ts#L110-L222`):

- a child stage or a single Fulfillment cannot be selected on its own to hide
  another obligation of the same contract;
- a Participant shared by two Contracts does **not** drag the unrelated Contract
  in: only a non-Party source pulls its outbound references. An unresolved
  `role.context` is retained rather than invented.

`scopeSuite` then keeps only the scenarios and instances the scoped model can
execute, following `basedOn` chains transitively
(`repo://libs/evidence-model-core/src/validation/scope.ts#L225-L278`).

### Completeness gaps

A scope claims completeness only when these hold
(`repo://libs/evidence-model-core/src/validation/scope.ts#L402-L475`,
`repo://libs/evidence-model-core/src/validation/scope.ts#L560-L610`):

- every evidence kind has its mandated business-time attributes;
- every attribute declares `valueType` and `required`;
- every `fulfillment_request` is associated with at least one confirmation or
  Evidence Role;
- every `fulfillment_confirmation` is referenced by at least one request;
- every Contract Context that has requests has **both** contract Parties as right
  holder of at least one primary Fulfillment (`pairingGaps`);
- a Contract Context has a primary Fulfillment Request at all.

Completeness issues already reported as consistency errors are not repeated as
gaps. `complete` is `null` when no scope was asked for, and otherwise true only
when there are no gaps and the model is consistent
(`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L255-L257`).

This separation is the answer to "why not just `consistent`?": consistency is a
statement about the graph, completeness is a statement about delivery. A contract
with one obligation direction can be saved and reviewed while the other is unclear
— but it cannot be handed downstream.

## Scenario requirement and coverage gaps

`simulationRules` keeps the rules the Evidence-instance simulator can execute
(those whose bindings and target are Evidence or Evidence Role entities) and
reports the rest as **limitations**, not as passes
(`repo://libs/evidence-model-core/src/validation/scope.ts#L280-L332`).

The requirement is `required` when the scoped model has any applicable rule **or**
any fulfillment request; otherwise `not-applicable`
(`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L205-L225`).

When a scope was selected and scenarios are required, `coverageGaps` adds a gap for
each of
(`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L112-L160`):

- no executable scenario at all;
- an applicable rule no scenario evaluates;
- a fulfillment request whose status no scenario asserts.

A rule without a scenario has not been executed; a request without a status
assertion has not been decided.

## Simulation is deterministic

Scenarios run only when `errors` and `gaps` are both empty and at least one
scenario exists (`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L228-L252`).

Inside `simulateScenario`:

- values are converted from JSON to the CEL type their declared `valueType`
  implies;
- `asOf` and `now` always come from the scenario clock, never from the machine
  (`repo://libs/evidence-model-core/src/validation/simulation.ts#L153-L205`);
- each evaluation binds instances or literals, evaluates the rule, normalises the
  result and compares it structurally with `expectedResult`;
- a derivation writes its result back into the target instance. If the instance
  already asserts a different value, that is an error, not an overwrite
  (`repo://libs/evidence-model-core/src/validation/simulation.ts#L419-L456`);
- after derivations, every required attribute of every issued instance must have a
  value;
- fulfillment status comes from the issued graph:
  an unissued or non-request instance is `not_requested`;
  a true breach rule wins and returns `breached`;
  a completion rule counts only when a related confirmation was actually issued;
  an explicit `manualCompletionRequestRefs` entry returns `completed`;
  otherwise the status is `pending`
  (`repo://libs/evidence-model-core/src/validation/simulation.ts#L279-L380`).

A suite that fails static validation executes nothing and reports `machineValidated:
false`, because a run over an invalid suite proves nothing
(`repo://libs/evidence-model-core/src/validation/simulation.ts#L631-L675`).

## Timeline: order comes from basis, not timestamps

`buildTimeline` groups instances into Context lanes and records three errors:

- an interval that starts after it expires;
- a `basedOn` cycle;
- a basis evidence formed **after** the instance that depends on it.

Pairs with no basis path between them are not ordered by timestamp. They are
reported in `unresolvedOrder` with the reason "no instance basis path; timestamps
do not imply dependency"
(`repo://libs/evidence-model-core/src/validation/timeline.ts#L166-L345`).

The timeline is canonicalised (sorted keys, no whitespace) and hashed, and
`timelineSummary` carries the counts plus that `sha256`. The digest is part of the
report contract, not a formatting detail
(`repo://libs/evidence-model-core/src/validation/timeline.ts#L84-L110`,
`repo://libs/evidence-model-core/src/validation/timeline.ts#L351-L360`).

## The report contract

Fields a consumer may rely on
(`repo://libs/evidence-model-core/src/validation/fmCheck.ts#L20-L70`):

| Field | Meaning |
| --- | --- |
| `checkVersion` | `5`; downstream refuses anything else |
| `valid` | no errors **and** `complete !== false` |
| `consistent` | no static errors and inputs unchanged |
| `complete` | `null` without a scope, otherwise gaps-free and consistent |
| `scopeRefs` / `contextRefs` | what was asked for and what the scope resolved to |
| `gaps` | completeness and coverage warnings |
| `humanConfirmation` | literal `not-asserted-by-machine` |
| `modelDigest` | `sha256:…` of the sources the report describes |
| `inputChanged` | the sources moved during the check |
| `modelValidated` | structural + lineage checks passed |
| `scenarioRequirement` | `required` / `not-applicable` / `not-checked` |
| `scenarioCount`, `executedScenarioCount`, `simulationPassed` | execution facts |
| `simulationLimitations` | rules the simulator cannot execute |
| `scenarioResults` | per-scenario evaluations and statuses |
| `timelineSummary` | counts and digest |
| `errors` | blocking messages |

The `humanConfirmation` literal is the honest part: the machine never claims a
person approved anything.

### Downstream readiness

`readyScope` is the stricter gate a consumer uses. It rebuilds the delivered scope
from the report and refuses unless version 5, `consistent`, `complete`, `valid`, no
errors, no gaps, `inputChanged === false`, simulation passed or not applicable, and
the report's `scopeRefs`, `contextRefs` and `scenarioRequirement` still match the
current source. When scenarios are required, every applicable scenario must have
executed (`repo://libs/evidence-model-core/src/validation/scope.ts#L624-L690`).

Its error message states the boundary: "consistency is not delivery readiness or
human confirmation".

## Command-line face

`evidence-model check <model> [--scope <context>]... [--json]` runs exactly the
same `buildFmCheckReport`, prints consistency, completeness, scenario counts and
the digest, and exits `1` when the report is not valid
(`repo://libs/evidence-model-core/src/cli.ts#L376-L422`).

`check` reads a `.evidence/fm` directory; a bundle is refused with a hint to
`unpack` first, so a report always names files a reader can open.

The derived commands share the same guard:

| Command | Refuses when |
| --- | --- |
| `compile` | the model does not pass consistency |
| `lineage` | the model does not pass consistency |
| `timeline` | the timeline reports an ordering error |
| `simulate` | the simulation report says `simulationPassed: false` |
| `role-play` | the scenario cannot be built, or `--force` is missing for an existing directory |

## Failure behaviour

| Situation | Result |
| --- | --- |
| structural error | `consistent: false`, `valid: false`, error listed |
| source changed mid-check | `inputChanged: true`, `consistent: false`, error added |
| scope is a child/duplicated Context | `ScopeSelectionError` message becomes a blocking error |
| scope has missing responsibility | gap, `complete: false` |
| no scenarios for a required scope | gap, simulation not run |
| scenario expectation mismatch | error naming rule and both values |
| derived value contradicts an asserted value | error, value not overwritten |
| invalid validation suite | no scenario executes, `machineValidated: false` |
| interval start after expire / basis cycle / future basis | timeline error |
| unordered pair | `unresolvedOrder`, not a guess |

## Tests that protect this contract

- `fmCheck.spec.ts` pins consistency-only reports, the scope report against the
  pinned digest, staleness on source change, refusal of a non-independent scope,
  the Contract Context gap, digest order-independence, and lineage errors
  (`repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts#L48-L205`).
- `scope.spec.ts` pins whole-context selection, dependency retention, child and
  duplicate refusal, suite narrowing, simulator applicability, completeness gaps
  and the "party never holds a request" gap
  (`repo://libs/evidence-model-core/src/validation/scope.spec.ts#L46-L158`).
- `simulation.spec.ts` pins golden-fixture execution, derivation write-back, the
  contradiction error, "no scenario executes on an invalid suite", scenario
  selection, unknown ids and named expectation failures
  (`repo://libs/evidence-model-core/src/validation/simulation.spec.ts#L21-L160`).
- `timeline.spec.ts` pins basis ordering, interval, future-basis and cycle errors,
  the summary counts and canonical digests
  (`repo://libs/evidence-model-core/src/validation/timeline.spec.ts#L21-L129`).
- `validationSuite.spec.ts` pins source reading, filename/id mismatch, duplicate
  ids, suite validation and typed-value checks
  (`repo://libs/evidence-model-core/src/validation/validationSuite.spec.ts#L19-L200`).

## Related pages

- [Sensors, stage gate and the dependency frontier](../agents/sensor-orchestration.md) —
  how this report is folded into one verdict.
- [The Fulfillment Modeling DSL (FM v5)](../language/fm-dsl.md) — the structural
  rules that produce the blocking errors.
- [Key data, business time and provenance](../language/key-data-and-provenance.md) —
  lineage and the ledger.
- [API contract projection](../contracts/api-projection.md) — the first consumer
  that requires a passed scope.
