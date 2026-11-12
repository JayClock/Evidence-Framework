---
type: orchestration
title: Sensors, stage gate and the dependency frontier
description: How one in-process sensor run folds consistency, key data, trace and scenario results into a severity-ranked verdict, how the gate decides downstream hand-off from saved evidence, and how interview and branch comparisons avoid treating silence as agreement.
tags: [sensors, stage-gate, interview, verdict, dialog]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-c77c160c8bb2154dbf87975b
    resource: repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.spec.ts
  - id: openwiki-source-543390fd1186c3dcc8294761
    resource: repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.ts
  - id: openwiki-source-845c7c5192ad9a0fd154d84c
    resource: repo://libs/evidence-modeling-orchestrator/src/discovery/frontierTracker.ts
  - id: openwiki-source-314d8ab58629f91e55cbcf46
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/native/modelSources.ts
  - id: openwiki-source-416ed00dd8f9170d7f23cd6c
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.spec.ts
  - id: openwiki-source-cd65768167691fea1e3b2661
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.ts
  - id: openwiki-source-d6b7bfe593ff478a83bb666f
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts
  - id: openwiki-source-5b13f202e262c23c7ce5bd77
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.spec.ts
  - id: openwiki-source-55f021b101b38881437ad306
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts
  - id: openwiki-source-11bd8ad0e59bddff7011666d
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/sensorsEngine.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Sensors, stage gate and the dependency frontier

`libs/evidence-modeling-orchestrator` is the layer the agent and the desktop share
for one question: *may this model move on?* It never owns the model and never
writes files. It reads one model tree, runs the checks that already live in
`evidence-model-core`, folds the results into one `SensorReport`, and separately
compares interviews and branches.

Four capabilities sit here:

| Module | Answers |
| --- | --- |
| `sensors/` | is the model consistent, is the ledger resolved, is the trace usable, and what is the one verdict |
| `sensors/native/nativeStageGate.ts` | may this scope be handed to API or review-page generation |
| `discovery/` | what is the newest interview round still asking, and what does it cite that no longer exists |
| `diff/` | what did a branch fix, what did it introduce, and did the gate move |

## One read, one verdict

A full run reads the model exactly once. `loadModelSources` reads the document,
the validation suite and the raw bytes together, computes a `sha256` digest, and
keeps a `rereadDigest` closure
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/modelSources.ts#L6-L55`).
That single read is what makes `inputChanged` meaningful: the FM check compares
the digest it started with against a second read, so a file edited mid-check
invalidates its own result instead of producing a report about two versions.

The native set runs three checks over those sources:

1. `buildFmCheckReport` — static consistency, scope completeness, scenario
   simulation and the timeline (see [The native check and simulation
   pipeline](../model/checks-and-simulation.md)).
2. `runNativeKeyDataAudit` — the ledger classification, plus the traceability
   edges that explain which modeled sources feed each derived value
   (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeKeyDataAudit.ts#L6-L60`).
3. `checkInterviewTrace` — schema, reference and provenance checks against the
   model itself (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeTraceCheck.ts#L300-L420`).

`runNativeSensors` composes them, then folds the trace findings into the base
report only when the trace is invalid
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.ts#L69-L127`).
A trace file that cannot even be read is converted into an invalid-trace finding
rather than an exception, because the status bar still has to describe the model
when the interview record is gone
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.ts#L59-L67`,
`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.ts#L86-L92`).

## How findings become severity

`buildSensorReport` maps each source onto the same three-level vocabulary the
skills use:

| Source condition | Severity | Code |
| --- | --- | --- |
| FM `errors` | `block` | `FM_INCONSISTENT` |
| FM `gaps` | `warn` | `FM_SCOPE_GAP` |
| FM `inputChanged` | `warn` | `FM_INPUT_CHANGED` |
| zero executed scenarios | `info` | `FM_NO_SCENARIO` |
| key data still owed | `warn` | `KEY_DATA_DECISION_OWED` |
| every key data item resolved | `info` | `KEY_DATA_RESOLVED` |
| a sensor could not run | `block` | `SENSOR_UNAVAILABLE` |
| invalid interview trace | `block` | `TRACE_INVALID` |

The mapping is in `fmCheckIssues`, `keyDataSummaryOf` and `buildSensorReport`
(`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L123-L175`,
`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L177-L225`,
`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L285-L323`).

A scope gap is intentionally a warning, not a blocker: consistency and
completeness are different questions, and a model may be consistent while a scope
it has not yet asked for is incomplete. The gate closes on gaps later, once a
scope is actually requested.

Counters and `passed` are recomputed from the de-duplicated issue list, keyed by
`issueId` (source, code and message). `passed` means "no blocking issue", nothing
more
(`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L237-L276`).

### A caveat about `isStageGateReady`

`finalizeSensorReport` computes:

```text
isStageGateReady = stageGate?.passed === true
                && keyDataSummary.decisionOwedCount === 0
                && blockCount === 0
```

Because of the `stageGate?.passed === true` term, a report that was **not** given a
gate summary is never gate-ready, even when it is consistent, complete and fully
resolved. `buildSensorReport` is called in production only from
`runNativeSensors`, which does not pass a gate summary, so a `runFullSensors`
result always reports `isStageGateReady: false`. Gate readiness is obtained by
calling `checkStageGate` and reading the returned summary — not by reading the
boolean off a plain sensor run
(`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L242-L276`,
`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.ts#L94-L98`).
Callers that read `report.isStageGateReady` without merging a gate result will
conclude the model is never ready.

## The stage gate reads evidence, it does not re-derive it

`checkNativeStageGate` consumes a *saved* FM check report and a *saved* interview
trace. Its doc comment states the intent: the gate is the moment a scope stops
being under interview and becomes something a contract may be derived from
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L5-L12`).

It refuses unless all of the following hold
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L39-L115`):

- at least one scope is supplied — downstream never consumes an unbounded model;
- `checkVersion === 5`;
- `consistent === true`;
- `complete === true` for the requested scope;
- `valid === true`;
- `inputChanged === false`;
- no `errors` and no `gaps`;
- every requested scope appears in the report's `scopeRefs`.

Then it checks the human record. A closure is a confirmed fact whose text exactly
equals `范围结束确认：<scope>` or `全局追责结束确认：<scope>`; each requested scope
needs at least one trace record carrying it
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L16-L16`,
`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L118-L169`).

The gate is explicit about what it does **not** prove: downstream authorization and
business approval remain human statements, and the report always carries that as a
limitation (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L180-L212`).
A machine cannot promote "the interview is finished" into "the business approved
the design".

Two operational details matter:

- `createSensorsEngine.checkStageGate` runs a fresh sensor pass when no saved
  report is supplied, so a caller may pass either; if no FM report can be produced
  the gate returns closed with `缺少 FM 检查结果，无法判定阶段门禁。`
  (`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorsEngine.ts#L78-L117`).
- An unreadable trace becomes `null`, which fails the gate as "not a JSON object"
  rather than passing with an absent check
  (`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorsEngine.ts#L52-L61`,
  `repo://libs/evidence-modeling-orchestrator/src/sensors/sensorsEngine.spec.ts#L32-L54`).

The closure prefixes are declared twice — once in `frontierTracker.ts` and once in
`nativeStageGate.ts` — and the two lists must stay identical or the UI will show a
round as closed while the gate refuses it.

## The dependency frontier

`calculateFrontier` reads only the **newest** trace record. Earlier rounds describe
history; the frontier describes what the interview is currently looking at
(`repo://libs/evidence-modeling-orchestrator/src/discovery/frontierTracker.ts#L74-L88`).

It produces:

- the newest focus: context, evidence and role;
- the judgment, story and key-data list from that round;
- `openQuestions`: questions whose `targetAttribute` is not bound by that same
  round's `targetBindings`. A question with no target attribute stays open;
- `gaps`: any evidence ref cited by the focus or bindings that the model no longer
  contains;
- `closed`: whether the newest round's confirmed facts include the exact closure
  marker for its context;
- `confirmedFacts` verbatim.

The two honesty rules are enforced by construction: a question is never invented,
and an unanswered question is never treated as agreed
(`repo://libs/evidence-modeling-orchestrator/src/discovery/frontierTracker.ts#L105-L159`).
Before the first record the frontier is empty rather than fabricated
(`repo://libs/evidence-modeling-orchestrator/src/discovery/frontierTracker.ts#L88-L103`).

Note that the closure check requires a `contextRef`. A closure marker recorded on a
round with no context does not close anything
(`repo://libs/evidence-modeling-orchestrator/src/discovery/frontierTracker.ts#L70-L72`).

The renderer panel shows the frontier beside the tool-call activity list, so a
modeler can see why the agent asks what it asks and what the agent actually did
(`repo://apps/desktop/src/renderer/components/agent/AgentPanel.tsx#L24-L40`).

## Comparing verdicts

Branch comparison must not turn missing evidence into good news. Both comparison
functions return `comparable: false` when either side is `null`; nothing is reported
as fixed or introduced until both branches have run their sensors
(`repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.ts#L69-L90`,
`repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.ts#L117-L140`).

When both sides exist:

- Findings are compared by `issueId`, so a reworded message counts as a new
  finding instead of matching the old one by code alone.
- `fixedIssues` and `introducedIssues` carry the actual messages, sorted blocking
  first.
- `gateImproved`/`gateRegressed` compare `isStageGateReady` across the two
  snapshots, which is why the branch store saves a snapshot rather than the whole
  report
  (`repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.ts#L40-L54`,
  `repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.ts#L92-L115`).

`compareVerdictSnapshots` is the branch-list variant: it can only report counts and
gate movement, because a snapshot has no issue messages to name.

## Failure behaviour

| Situation | Result |
| --- | --- |
| model root unreadable | `loadModelSources` throws; callers that must answer anyway report the sensor as unavailable, which blocks (`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L303-L314`) |
| bundle path passed to sensors | explicit `ModelSourceError` — native sensors read a directory, not `*.evidence.json` (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/modelSources.ts#L37-L46`) |
| trace missing / unreadable | blocking `TRACE_INVALID`, never a crash (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.ts#L59-L67`) |
| no FM report for the gate | gate closed with an explicit error (`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorsEngine.ts#L99-L107`) |
| no scope for the gate | gate closed: downstream never consumes an unbounded model (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L191-L193`) |
| no recorded closure | gate closed, message names the exact expected marker (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeStageGate.ts#L155-L164`) |
| one branch never checked | comparison reports `comparable: false` (`repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.ts#L77-L90`) |

## Tests that protect this contract

- `sensorReport.spec.ts` pins the severity mapping, the "consistent but gated
  shut" case with an owed decision, the unavailable-sensor block, the empty
  ledger, de-duplication/recounting and gate defaults
  (`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.spec.ts#L98-L146`).
- `nativeSensors.spec.ts` asserts one read produces the model, suite and digest;
  that a bundle is refused; that the golden `valid-traceable-subscription` fixture
  folds to one verdict with 14 key-data items and 3 scenarios; and that a missing
  trace becomes a blocking `TRACE_INVALID`
  (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.spec.ts#L21-L60`,
  `repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.spec.ts#L270-L300`).
- The same spec covers gate opening for a checked scope with a recorded closure,
  staying shut without one, refusing an unbounded model or stale report, and
  reporting unmodeled trace references
  (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.spec.ts#L194-L268`).
- `frontierTracker.spec.ts` pins the empty frontier, newest-round reads, the
  "questions minus attributes bound in the same round" rule, dangling evidence and
  context-specific closure.
- `verdictDiff.spec.ts` pins not-comparable results, fixed-versus-introduced
  separation, severity ordering and gate movement
  (`repo://libs/evidence-modeling-orchestrator/src/diff/verdictDiff.spec.ts#L33-L100`).

## Related pages

- [The native check and simulation pipeline](../model/checks-and-simulation.md) —
  what the FM report contains before it is folded.
- [The Pi agent harness and its tools](./pi-harness.md) — `run_sensors` and how the
  report reaches the model.
- [Interview branches and lineage](../desktop/branches-and-lineage.md) — where
  verdict snapshots are stored and compared.
- [External agents over MCP](./mcp-integration.md) — `get_key_data_audit` and
  `run_stage_gate` over the bridge.
