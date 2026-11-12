---
type: contract
title: API contract projection
description: How a checked Fulfillment Model plus an API design document become reviewable resources, capabilities, coverage, HTTP journeys, OpenAPI and portable test vectors — and what makes the tool refuse to project.
tags: [api, projection, openapi, coverage, diagnostics, contract]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-d411e4580a06325c2c5fcf75
    resource: repo://libs/evidence-api/src/adapter/fmAdapter.ts
  - id: openwiki-source-5ada2ea19d2cb99c0b704bb8
    resource: repo://libs/evidence-api/src/apiLoader.spec.ts
  - id: openwiki-source-df757265b9e1070807ea34fe
    resource: repo://libs/evidence-api/src/cli.ts
  - id: openwiki-source-544f25383a86776d3fdf7169
    resource: repo://libs/evidence-api/src/fmAdapter.spec.ts
  - id: openwiki-source-30dbb656b4cdad715c3c9726
    resource: repo://libs/evidence-api/src/http/contracts.ts
  - id: openwiki-source-677681b7d95a49007e3ae9e1
    resource: repo://libs/evidence-api/src/http/httpJourneys.ts
  - id: openwiki-source-adefb9cc5fd30bc9ad8a24df
    resource: repo://libs/evidence-api/src/loader/apiLoader.ts
  - id: openwiki-source-dda93af372b2aced5e221a86
    resource: repo://libs/evidence-api/src/projection.spec.ts
  - id: openwiki-source-cbb2ca28f36a4ce75e295bd5
    resource: repo://libs/evidence-api/src/projection/capabilities.ts
  - id: openwiki-source-b5813710d3478c3e66f3efef
    resource: repo://libs/evidence-api/src/projection/cardinality.ts
  - id: openwiki-source-64ef92dbfc30611be6e4f22e
    resource: repo://libs/evidence-api/src/projection/coverage.ts
  - id: openwiki-source-7b8bd21c0e73d7c95501cac9
    resource: repo://libs/evidence-api/src/projection/modelCoverage.ts
  - id: openwiki-source-d49b05695ae39e2d3c77b1e7
    resource: repo://libs/evidence-api/src/projection/resources.ts
  - id: openwiki-source-7dad3c227e7d6e118c34b56a
    resource: repo://libs/evidence-api/src/projector.ts
  - id: openwiki-source-65cec3fa94938b2f2b5d4a29
    resource: repo://libs/evidence-api/src/renderer/outputRenderer.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# API contract projection

`libs/evidence-api` is the first downstream consumer of a checked model. It takes
two inputs — a saved FM check report and a `.evidence/api/api.json` design — and
produces one projection document that names every resource, capability, coverage
row and HTTP route, plus the delivery files derived from it.

It is deliberately not a generator that invents: nothing is projected from a
reference that does not resolve, and nothing is written while a question is still
open.

## Preconditions: the design is only as good as the report

Before reading anything, `loadFm` validates the saved check report against seven
conditions: contract version 5, `consistent`, `complete`, `valid`,
`inputChanged === false`, `modelValidated === true`, no errors, and a
`modelDigest`
(`repo://libs/evidence-api/src/adapter/fmAdapter.ts#L88-L111`).

Then it compares that digest with the bytes currently on disk. A mismatch returns
`FM_CHECK_STALE` with the instruction "FM 已变化，返回 FM 阶段重新检查" instead of
projecting a model the check never saw
(`repo://libs/evidence-api/src/adapter/fmAdapter.ts#L144-L180`). After reading it
snapshots the tree a second time: if anything moved during the read, the result is
`SOURCE_CHANGED` rather than a mixed-version projection
(`repo://libs/evidence-api/src/adapter/fmAdapter.ts#L205-L219`).

This is the same "the artifact names its inputs" discipline used by the review
page, applied at the API boundary.

## Two contracts, one strict parser

The loader validates against two embedded JSON Schemas:

- `api.schema.json` — what a designer is allowed to write;
- `api-projection.schema.json` — what this engine is allowed to produce.

Validating the output as well as the input is what stops the renderer from
silently emitting a shape no consumer can read
(`repo://libs/evidence-api/src/loader/apiLoader.ts#L8-L14`). Both schema documents
are compiled once and cached.

The design must be JSON, and "JSON" is enforced more strictly than `JSON.parse`:

- YAML is refused outright;
- duplicate keys are detected by a raw-text scan and reported, because
  `JSON.parse` would silently keep the last one;
- `NaN`, `Infinity` and `undefined` are refused as non-JSON constants;
- duplicated ids inside a design section are reported before anything resolves an
  id that would land on the wrong record.

Those checks live in `parseStrictJson` and `duplicateKeyOf`
(`repo://libs/evidence-api/src/loader/apiLoader.ts#L80-L215`,
`repo://libs/evidence-api/src/loader/apiLoader.ts#L245-L291`).

## Projection order

`buildProjection` runs a fixed sequence, and each stage receives only what the
previous stage proved (`repo://libs/evidence-api/src/projector.ts#L302-L380`):

1. **Basis references** — every `fmRef`, `sourceRef` and `decisionRef` a design
   cites must exist; business source paths must stay inside the project and are
   digested.
2. **Resources** — paths, identity and nesting.
3. **Bindings** — parent/child and caller-scope references.
4. **Capabilities** — callable interfaces and grouped operations.
5. **Scenario coverage** — every FM step lands somewhere.
6. **Model coverage** — every Evidence, Thing and Participant is accounted for.
7. **Diagnostics** — normalized to a stable order.
8. **HTTP** — responses, payloads, consumption and journeys.

Diagnostics are normalized by severity, code, target, message and finally
identity, so two runs that found the same things print them identically
(`repo://libs/evidence-api/src/diagnostics.ts#L103-L121`).

## Resources: a URL is a promise

A resource is a segment plus an identity. A collection carries its own id
parameter; a singleton is located by its parent
(`repo://libs/evidence-api/src/projection/resources.ts#L33-L40`).

Three rules are enforced rather than assumed:

- The resource's entity must exist in the model and be either Evidence or a
  Participant that a Context sources.
- Nesting across two Context roots is refused, with one documented exception: a
  Contract collection may hang off the concrete Participant Party that plays the
  caller, because `/parties` would mix both sides of one Contract into a
  collection where the same id means different things
  (`repo://libs/evidence-api/src/projection/resources.ts#L57-L79`,
  `repo://libs/evidence-api/src/projection/capabilities.ts#L330-L349`).
- A parent/child cardinality must be proved by a modeled relationship or a
  documented business source. No proof is a `RESOURCE_CARDINALITY_UNRESOLVED`
  gap, not a guess; a proof that contradicts the relationship is an error, and the
  address shape must follow the number that survived
  (`repo://libs/evidence-api/src/projection/cardinality.ts#L9-L18`,
  `repo://libs/evidence-api/src/projection/cardinality.ts#L59-L130`).

## Capabilities: three independent questions

A capability is projected only when all three answers are yes
(`repo://libs/evidence-api/src/projection/capabilities.ts#L6-L17`,
`repo://libs/evidence-api/src/projection/capabilities.ts#L74-L90`,
`repo://libs/evidence-api/src/projection/capabilities.ts#L204-L227`):

1. Is the caller a Party Role that an actual `participant.party` plays through a
   `plays_role` relationship?
2. Can the HTTP method express the declared effect? Appending Evidence is the only
   accepted mutation of Evidence.
3. Is there a scenario and a written reasoning that justify the interface?

Anything short becomes a diagnostic, because a guessed interface looks callable
when it is not. Two roles reading the same collection are grouped into one
operation with two acceptable actors, so the OpenAPI document declares one route
instead of two conflicting ones
(`repo://libs/evidence-api/src/projection/capabilities.ts#L480-L567`).

A Contract list has an extra constraint: it may only be read through the concrete
Party that plays the caller, and the segment and identity parameter must not be a
generic `parties`/`partyId` shape
(`repo://libs/evidence-api/src/projection/capabilities.ts#L95-L140`).

## Coverage asks two directions, then a third question

**Scenario coverage** maps every FM scenario step to either a capability call, a
declared internal activity, or a declared external activity
(`repo://libs/evidence-api/src/projection/coverage.ts#L6-L18`). A step mapped to a
capability must match on four things at once: same acting role, an
`append_evidence` effect, the same target entity, and a capability that cites this
scenario. Anything else is `SCENARIO_CAPABILITY_MISMATCH`.

**Model coverage** accounts for every Evidence, Thing and Participant entity in
the model (`repo://libs/evidence-api/src/projection/modelCoverage.ts#L95-L218`):

- `api` — at least one capability targets it;
- `internal` / `external` — the design explains why there is no interface, with a
  reasoning string and an FM or source reference;
- `gap` — nobody answered.

The contradictions are caught explicitly:

- an object with a write interface cannot also be declared non-API;
- an Evidence entity with only read interfaces is `MODEL_EVIDENCE_WRITE_MISSING`,
  unless its responsible Party Role has no player and non-API formation is
  declared;
- "internal" is never an escape hatch: the basis must cite the object or a
  business source.

**Journey coverage** is separate again: every declared journey step must resolve
to an interface the previous response can reach — an entry point, a hypermedia
link it carried, or the `Location` of a creation
(`repo://libs/evidence-api/src/http/httpJourneys.ts#L9-L18`). A step whose input
never becomes available is a gap, not an assumed prerequisite.

## HTTP contract checks

`buildHttp` turns the projected capabilities into operations and validates the
declared responses against what the capability can mean
(`repo://libs/evidence-api/src/http/contracts.ts#L6-L22`). Representative rules:

| Declared | Required / refused |
| --- | --- |
| `201` | must carry a `Location` that matches the resource's item template; `GET` may not create |
| `202` | must name a same-role `GET` result capability and a matching `Location` |
| `204`, `304` | no representation body; `304` only for `GET` |
| any response | no duplicate headers, no newlines in header values, representation must allow the actor role |
| write capability | idempotency/retry policy must be stated, or explicitly declared not applicable |

Duplicate statuses per capability, a `GET` with a body, and a response
representation whose `actorRoleRefs` exclude the caller are all errors.

## Outputs and exit codes

`evidence-api` has three verbs: `inspect`, `check`, `project`
(`repo://libs/evidence-api/src/cli.ts#L18-L30`). All paths must be absolute; the
check report and design must live outside the FM root, and `--out` must be inside
the project and overlap no input.

`check` exits `0` for clean, `1` for any `error`, and `3` when only `gap`s remain.
`project` writes nothing unless `complete` is true — no diagnostics and
`http.complete === true` — so a partially resolved tree is never mistaken for a
finished one (`repo://libs/evidence-api/src/cli.ts#L192-L209`,
`repo://libs/evidence-api/src/cli.ts#L327-L356`).

A successful `project` writes six files atomically through a temporary directory
rename (`repo://libs/evidence-api/src/renderer/outputRenderer.ts#L18-L32`):

- `projection.json`
- `http-journeys.json`
- `representation-examples.json`
- `e2e-test-vectors.json`
- `openapi.json`
- `manifest.json` — tool identity, runtime versions, input digests and a
  `{sha256, bytes}` entry per output.

The manifest is what makes the delivery auditable: it records the digests of both
JSON Schemas and of every generated file, so a consumer can tell whether the
bundle it reads is internally consistent
(`repo://libs/evidence-api/src/renderer/outputRenderer.ts#L34-L93`).

## Failure behaviour

| Situation | Result |
| --- | --- |
| check report not version 5 / incomplete / stale | `FM_CHECK_INVALID` or `FM_CHECK_STALE`, nothing projected (`repo://libs/evidence-api/src/adapter/fmAdapter.ts#L88-L111`, `repo://libs/evidence-api/src/adapter/fmAdapter.ts#L144-L180`) |
| model changed during read | `SOURCE_CHANGED`, nothing projected |
| design is YAML, has duplicate keys, or a non-JSON constant | `DESIGN_INVALID` with the offending location (`repo://libs/evidence-api/src/loader/apiLoader.ts#L245-L291`) |
| cited basis reference missing | `DESIGN_REF_NOT_FOUND`; downstream stages still run so all findings appear at once |
| cardinality unproved | `RESOURCE_CARDINALITY_UNRESOLVED` gap; shape is not guessed |
| capability lacks an actor, effect or scenario | error or withheld capability, never a silent interface |
| journey step unreachable | gap on that step; the rest of the journey is still reported |
| output overlaps an input | `OUTPUT_INPUT_CONFLICT`, nothing written |
| `project` with open gaps | exit 3 and no write, previous output untouched |

## Tests that protect this contract

- `projection.spec.ts` projects the `tests/fixtures/full-lifecycle` design into
  the six documents, compares the rendered OpenAPI with the repository copy, checks
  the manifest's schema and runtime digests, exercises every CLI path refusal, and
  proves a second design projects into the same document shapes
  (`repo://libs/evidence-api/src/projection.spec.ts#L47-L120`,
  `repo://libs/evidence-api/src/projection.spec.ts#L143-L275`).
- `fmAdapter.spec.ts` pins digest form, report acceptance, stale-model refusal and
  the "only a played Party Role counts as a caller" rule
  (`repo://libs/evidence-api/src/fmAdapter.spec.ts#L43-L132`).
- `apiLoader.spec.ts` asserts the embedded schemas match the shipped files,
  refuses YAML, duplicate keys and non-standard constants, and pins diagnostic
  ordering (`repo://libs/evidence-api/src/apiLoader.spec.ts#L32-L130`).
- `resources.spec.ts` and `capabilities.spec.ts` cover borrowed identity, inherited
  parameters, Context-boundary refusals, cardinality contradictions, role grouping
  and withheld capabilities
  (`repo://libs/evidence-api/src/projection/resources.spec.ts#L17-L150`,
  `repo://libs/evidence-api/src/projection/capabilities.spec.ts#L51-L218`).

## Related pages

- [The native check and simulation pipeline](../model/checks-and-simulation.md) —
  what produces the report this stage consumes.
- [The offline review workbench](./offline-workbench.md) — the page that renders
  this projection.
- [The Fulfillment Modeling DSL (FM v5)](../language/fm-dsl.md) — the objects being
  projected.
- [Verification strategy and fixtures](../testing/verification-strategy.md) — the
  shared model and design fixtures.
