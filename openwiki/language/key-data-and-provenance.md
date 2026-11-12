---
type: concept
title: Key data, business time and provenance
description: The vocabulary that decides whether a value has a provider — key data source kinds, the mandated business-time attributes, request-formation fields, attribute-level lineage, and how source snippets and interview bindings tie claims back to evidence.
tags: [key-data, provider, lineage, traceability, provenance, business-time]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-f4983b717b76eb5f0cfd69e1
    resource: repo://libs/evidence-model-core/src/keyData/keyDataLedger.spec.ts
  - id: openwiki-source-affb6c00c48ce99fa8d2ada0
    resource: repo://libs/evidence-model-core/src/keyData/keyDataLedger.ts
  - id: openwiki-source-94d8041b675559a722964cce
    resource: repo://libs/evidence-model-core/src/validation/traceability.ts
  - id: openwiki-source-416ed00dd8f9170d7f23cd6c
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.spec.ts
  - id: openwiki-source-e8f76ddbf245a281578a4d64
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeTraceCheck.ts
  - id: openwiki-source-55f021b101b38881437ad306
    resource: repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts
  - id: openwiki-source-291031da381a0a93fe5d5076
    resource: repo://libs/evidence-schema/schemas/interview-trace.schema.json
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-649ec2659fe489d0f9323bc2
    resource: repo://libs/evidence-schema/src/ast/keyData.ts
  - id: openwiki-source-6dd8352adfce201b404ea1bf
    resource: repo://libs/evidence-schema/src/ast/provenance.ts
  - id: openwiki-source-3a801269d4e9a920c1e0021d
    resource: repo://libs/evidence-schema/src/validation/strictValidate.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Key data, business time and provenance

The modeling method's first red line is simple to state and hard to satisfy: **a
number without a provider is not a fact**. Amounts, deadlines, quantities and time
differences are not inputs a caller may supply; they are either established by a
contract term, an upstream evidence attribute, a domain object, a recorded result
fact, or a derivation over those.

Three mechanisms enforce that: a shared classification vocabulary, a ledger that
inventories every marked item, and attribute-level lineage that proves a formula
only reads modeled values.

## The classification vocabulary

`KEY_DATA_SOURCE_KINDS` is the single authority used by the inspector, the ledger
and the sensors, so a green inspector cannot hide a decision owed downstream
(`repo://libs/evidence-schema/src/ast/keyData.ts#L1-L25`):

| Kind | Label | How it is established |
| --- | --- | --- |
| `derived` | 派生规则（Derived） | a derivation rule targets this attribute |
| `contract-term` | 合同参数（Contract Term） | a contract's attribute |
| `domain-source` | 领域对象（Domain Source） | a Thing's attribute |
| `negotiation-source` | 协商来源（Negotiation Source） | an `rfp` or `proposal` attribute |
| `result-fact` | 结果事实（Result Fact） | a `fulfillment_confirmation` or `other_evidence` attribute |
| `request-input` | 请求形成事实（Request Input） | a request attribute the requester records |
| `needs-decision` | 待决（Decision Owed） | a request attribute the vocabulary does not recognise |
| `other` | 未归类（Other） | any other category, e.g. a context or role attribute |

`classifyKeyDataSource` is a pure function of the entity kind and the attribute
name/pointer, evaluated in this order
(`repo://libs/evidence-schema/src/ast/keyData.ts#L72-L122`):

```text
derivedByRuleRef present        → derived
evidence.contract               → contract-term
participant.thing               → domain-source
evidence.rfp | proposal         → negotiation-source
evidence.confirmation | other   → result-fact
evidence.request                → request-input if name ∈ REQUEST_FORMATION_FIELDS
                                  else needs-decision
everything else                 → other
```

The request-formation whitelist is deliberately small: `started_at`,
`request_number`, `delivery_address`, `return_address`, `fault_description`,
`asset_code`, `billing_period`, `settlement_period`
(`repo://libs/evidence-schema/src/ast/keyData.ts#L26-L37`). A request attribute
outside it `needs-decision` until the business names a provider.

`RESOLVED_KEY_DATA_SOURCES` is every kind except `needs-decision` and `other`;
`isKeyDataDecisionOwed` is true only for `needs-decision`
(`repo://libs/evidence-schema/src/ast/keyData.ts#L51-L69`).

### The classification is syntactic, not semantic

The classifier reads kinds and names, not meanings. Two consequences follow:

- A contract attribute is `contract-term` even if the business actually computes
  it — unless a `derivedByRuleRef` is present, which wins first.
- A request attribute named inside the whitelist is `request-input` even if its
  value is negotiated; one named outside it is `needs-decision` even if the
  interview already decided it. The vocabulary records where a value *may* come
  from, not what a person said in a particular session.

That is why the ledger is a decision list, not a proof of correctness.

## The flag is the gate

`buildKeyDataLedger` inventories only attributes whose `keyData` flag is `true`
(`repo://libs/evidence-model-core/src/keyData/keyDataLedger.ts#L85-L140`).

This is the most important operational detail on this page: **an amount that is not
marked `keyData` never enters the ledger, and therefore never blocks anything.**
Nothing in the static validator forces an attribute with an amount-like meaning to
carry the flag; the discipline lives in the modeling instructions and the
inspector's helper text ("金额、期限、数量与时间差标记为关键数据"). A model can
therefore be structurally valid and gate-ready while an unmarked price sits in a
request. The ledger test asserts the exclusion explicitly
(`repo://libs/evidence-model-core/src/keyData/keyDataLedger.spec.ts#L147-L160`).

Each ledger entry records the entity, attribute, label, meaning, value type,
context, source kind and whether the decision is owed. Derived entries also carry
the rule id, the expression and the **providers** derived from the rule's bindings:
for each alias either a modeled `ref` or a runtime `valueType`
(`repo://libs/evidence-model-core/src/keyData/keyDataLedger.ts#L64-L82`).

The ledger is the input to the sensor report's `keyDataSummary`:
`totalItems`, `resolvedCount`, `decisionOwedCount` and the capped list of
unresolved items
(`repo://libs/evidence-modeling-orchestrator/src/sensors/sensorReport.ts#L185-L225`).
An owed decision is a warning rather than a static error, but it keeps
`isStageGateReady` false — which is what stops a model with orphan amounts from
reaching API design
(`repo://libs/evidence-schema/src/ast/keyData.ts#L43-L50`).

## Business time is a required key-data timestamp

Every evidence kind mandates specific time attributes: an `rfp`, `proposal` and
`fulfillment_request` need `started_at` and `expired_at`; a `contract` needs
`signed_at`; a confirmation needs `confirmed_at`; other evidence needs
`created_at` (`repo://libs/evidence-schema/src/ast/entity.ts#L47-L66`).

Each of those names, wherever it appears, must be declared as a **required
`keyData` `timestamp`** (`repo://libs/evidence-schema/src/validation/strictValidate.ts#L515-L545`).
Missing the attribute is `attribute.time.missing`; wrong type/requiredness is
`attribute.time.notKeyTimestamp`.

The distinction is substantive: a period is a claim about a window, a moment is a
claim about an instant. Recording a confirmation as an interval would let a model
avoid saying when the obligation was actually discharged, and time differences
between moments are exactly the amounts the key-data ledger exists to police.

## Lineage: a formula may only read modeled values

`analyzeTraceability` walks every rule expression and records which modeled
attribute each read comes from. Its checks are the second half of the "no hidden
formula" rule
(`repo://libs/evidence-model-core/src/validation/traceability.ts#L1-L30`):

| Check | Failure |
| --- | --- |
| a `many` binding must be read through a CEL macro (`all`, `exists`, `exists_one`, `filter`, `map`) | `many binding … must be accessed through a CEL collection macro` |
| a macro may only iterate a `many` binding | `CEL macro … iterates binding …, which must declare cardinality: many` |
| an entity binding must be indexed by a static string | `Entity binding … must use a static string attribute index for traceability` |
| every read must name a declared attribute | `reads unknown attribute …` |
| the binding's `ref` must be the entity being read | `attribute access … does not match binding …` |
| only one derivation may target an attribute | `multiple derivation Rules target this attribute` |
| a derivation target must be declared back by `derivedByRuleRef` | `derivation Rule … must be declared by derivedByRuleRef` |
| lineage may not cycle | `attribute lineage cycle: …` |

The checks run at `analyzeTraceability`
(`repo://libs/evidence-model-core/src/validation/traceability.ts#L392-L555`).

Two of them exist specifically for key data:

- a **key** derived attribute must trace to at least one modeled Entity attribute;
- a key derivation may not use a scalar (`type`-only) binding that the expression
  actually reads: `key derivation scalar inputs [...] must be modeled as Entity
  attributes`.

That is what prevents a formula like `amount * 0.13` from hiding a tax rate in an
unmodeled constant. The scalar binding may exist in the rule, but if the expression
uses it, the model is refused.

The output is a `TraceabilityDocument` of nodes (`entity#attribute`), edges
(`source → target` through a rule) and constraints (non-derivation rules and the
attributes they read), which the key-data audit uses to list each derived item's
sources (`repo://libs/evidence-model-core/src/validation/traceability.ts#L34-L60`,
`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeKeyDataAudit.ts#L20-L60`).

## Provenance: where a claim came from

Two independent records answer "why is this here?".

### `sourceSnippet` on the model

An ingested entity can carry the verbatim sentence it was read from, a
human-readable locator and the input kind
(`repo://libs/evidence-schema/src/ast/provenance.ts#L23-L39`). The ingestion
compiler copies it through; hand-written entities may omit it. A reviewer can
re-read the clause instead of trusting the extraction.

### `targetBindings` on the interview trace

The trace schema records, per round, the focus (`contextRef`, `evidenceRef`,
`roleRef`), the narrative judgment and story, the questions, what the person said,
and the bindings that connect a claim to an attribute
(`repo://libs/evidence-schema/schemas/interview-trace.schema.json#L30-L114`).

A binding names an `evidenceRef`, an optional `attributeName`, a `sourceType` from
`interview_statement`, `upstream_evidence`, `system_rule`, `document`, and
optionally an `upstreamEvidenceRef`. Validation checks that the evidence and the
named attribute exist in the model, and reports an unmodeled reference instead of
accepting provenance for something that was never modeled
(`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeTraceCheck.ts#L300-L420`).

The trace is also where a human closure is recorded: a confirmed fact whose text is
exactly `范围结束确认：<scope>` or `全局追责结束确认：<scope>`. That is the only
thing the stage gate accepts as "the interview is finished"
(see [Sensors, stage gate and the dependency frontier](../agents/sensor-orchestration.md)).

## What a reviewer can and cannot conclude

The ledger and lineage together let a reviewer ask:

- Does every marked amount/deadline/quantity have a named provider?
- Does every derived value trace to modeled attributes, with no hidden scalar?
- Is business time recorded in the shape the evidence kind requires?
- Does every interview binding point at a real object and attribute?

They do **not** let a reviewer conclude:

- that an unmarked amount is safe;
- that a `contract-term` classification is the correct business decision;
- that a recorded result fact is true — only that the business recorded it;
- that a scope is complete — that is the scope check, not the ledger.

## Tests that protect this contract

- `keyDataLedger.spec.ts` pins the count per source kind, the separation of owed
  decisions, the derivation providers, and that non-`keyData` attributes are
  ignored (`repo://libs/evidence-model-core/src/keyData/keyDataLedger.spec.ts#L115-L160`).
- `nativeSensors.spec.ts` asserts the ledger classification and the trace checks:
  only modeled references, unique question ids, a non-trace document
  (`repo://libs/evidence-modeling-orchestrator/src/sensors/native/nativeSensors.spec.ts#L62-L190`).
- `strictValidate.spec.ts` covers the business-time rules and the structural
  constraints around key data.
- `traceability` and `cel` specs cover macro/collection errors, unknown attributes,
  binding mismatch and lineage cycles.

## Related pages

- [The Fulfillment Modeling DSL (FM v5)](./fm-dsl.md) — where `keyData`, time
  attributes and derivation targets live.
- [The native check and simulation pipeline](../model/checks-and-simulation.md) —
  the passes that consume lineage and the ledger.
- [Sensors, stage gate and the dependency frontier](../agents/sensor-orchestration.md) —
  how owed decisions close the gate.
- [The offline review workbench](../contracts/offline-workbench.md) — how key data
  and traces appear to a reader.
