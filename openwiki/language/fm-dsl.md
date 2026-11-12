---
type: language
title: The Fulfillment Modeling DSL (FM v5)
description: The model language behind every Evidence artifact — manifest, four entity categories, attributes, relationships, CEL rules, identifiers and value types — and the structural rules that make an invalid model impossible to save.
tags: [fm, dsl, schema, entities, rules, validation]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-9c501a7cfdf8a65fc4a7bb97
    resource: repo://libs/evidence-schema/schemas/model.schema.json
  - id: openwiki-source-52858d6130375e8776a048e7
    resource: repo://libs/evidence-schema/src/ast/document.ts
  - id: openwiki-source-c265f00105116b029505cbda
    resource: repo://libs/evidence-schema/src/ast/entity.ts
  - id: openwiki-source-3a0a328f2c66bce9f017bb17
    resource: repo://libs/evidence-schema/src/ast/id.ts
  - id: openwiki-source-6dd8352adfce201b404ea1bf
    resource: repo://libs/evidence-schema/src/ast/provenance.ts
  - id: openwiki-source-e32f800f7852b379dbe14855
    resource: repo://libs/evidence-schema/src/ast/rule.ts
  - id: openwiki-source-81352b1a378745cf2308d10d
    resource: repo://libs/evidence-schema/src/ast/values.ts
  - id: openwiki-source-3a801269d4e9a920c1e0021d
    resource: repo://libs/evidence-schema/src/validation/strictValidate.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# The Fulfillment Modeling DSL (FM v5)

Fulfillment Modeling describes a business as responsibilities that are claimed
and discharged, not as tables and endpoints. A model is a small graph of
**Contexts**, **Evidence**, **Participants** and **Roles**, joined by typed
relationships and judged by CEL rules.

The language has two equivalent published forms:

- TypeScript types and guards in `libs/evidence-schema/src/ast/`;
- JSON Schemas in `libs/evidence-schema/schemas/`.

The README states the relationship: the types mirror the schemas field for field,
and are the executable form of them (`repo://libs/evidence-schema/README.md#L1-L16`).
Both are inputs to the static validator, so a model cannot be "valid TypeScript"
and invalid JSON at the same time.

## Document shape

A document is a manifest plus three flat collections
(`repo://libs/evidence-schema/src/ast/document.ts#L7-L32`):

```jsonc
{
  "manifest": {
    "type": "fm_model",
    "schemaVersion": "5.0",
    "id": "product-procurement-full-lifecycle",
    "name": "商品采购协议完整履约模型",
    "version": "1.1.0",
    "ruleLanguage": "CEL",
    "entryContextRefs": ["context.product-procurement"]
  },
  "entities": [],
  "relationships": [],
  "rules": []
}
```

The manifest is strict: `type` must be `fm_model`, `schemaVersion` exactly `5.0`,
`ruleLanguage` exactly `CEL`, `version` semver-shaped, and `entryContextRefs` a
non-empty unique list of Context ids. The JSON Schema sets
`additionalProperties: false`, so a typo becomes a finding instead of a silently
ignored field (`repo://libs/evidence-schema/schemas/model.schema.json#L1-L40`).

## Identifiers and value types

Three grammars keep ids stable and machine-readable
(`repo://libs/evidence-schema/src/ast/id.ts#L1-L35`):

| Kind | Pattern | Example |
| --- | --- | --- |
| domain id | `^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$` | `request.payment` |
| attribute name | `^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$` | `confirmed_at` |
| model version | semver | `1.1.0-rc.1` |
| CEL alias | `^[A-Za-z_][A-Za-z0-9_]*$` | `confirmations` |

Ids are unique **across** entities, relationships and rules, not within each
collection. A duplicate is reported as `id.duplicate` and the second object is not
indexed (`repo://libs/evidence-schema/src/validation/strictValidate.ts#L420-L450`).

`VALUE_TYPES` covers the CEL scalar set plus business conveniences: `bool`, `int`,
`uint`, `double`, `decimal`, `string`, `bytes`, `timestamp`, `duration`, `date`,
`money`, `enum`, `id`, `list`, `map`, `dynamic`
(`repo://libs/evidence-schema/src/ast/values.ts#L1-L20`).

## The four entity categories

`ENTITY_CATEGORIES` is the whole ontology: `evidence`, `participant`, `role`,
`context`. Each category has its own kind vocabulary
(`repo://libs/evidence-schema/src/ast/entity.ts#L5-L45`).

### Evidence: six kinds, each tied to a business moment

| Kind | Time requirement | Context requirement |
| --- | --- | --- |
| `rfp` | `started_at`, `expired_at` | `pre_contract` |
| `proposal` | `started_at`, `expired_at` | `pre_contract` |
| `contract` | `signed_at` | `contract`, and listed in its `rootRefs` |
| `fulfillment_request` | `started_at`, `expired_at` | `contract` |
| `fulfillment_confirmation` | `confirmed_at` | `contract` |
| `other_evidence` | `created_at` | contract, pre-contract or domain |

The required-time table is `REQUIRED_EVIDENCE_TIME_ATTRIBUTES`, and every
recognised time attribute must be a **required keyData timestamp**
(`repo://libs/evidence-schema/src/ast/entity.ts#L47-L66`,
`repo://libs/evidence-schema/src/validation/strictValidate.ts#L515-L545`).

Why so strict: a period and a moment are different claims. Signing happens at an
instant, an offer is valid over a window, and a model that records a window for a
confirmation cannot say when the obligation was discharged.

Every non-contract Evidence must name a `responsibleRoleRef` that is a Party Role
owned by its Context — and, for a Contract Context, bound by the root Contract.
A pre-contract stage borrows the parties of its parent Contract
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L761-L850`).

A Contract is a bilateral agreement, so it is saved together with **exactly two
distinct Party Roles** from its own Context, and must be the Context's root
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L852-L940`).
Actual players may still be unknown; the two roles are the invariant, not the
people.

### Participant: a party outside contexts, a thing inside one

`participant.party` represents a concrete business actor and **must not** declare
`contextRef`: the same buyer participates in many contracts, so pinning it to one
Context would duplicate the entity. `participant.thing` is the subject of a trade
and must live in a `domain` Context
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L942-L1060`).

### Role: responsibility, never a player

`role.party`, `role.domain`, `role.third_party`, `role.context` and
`role.evidence` describe what a participant or object may act as. A Role must
belong to a Context and must **not** carry `responsibleRoleRef` or `roleRefs` —
those are Evidence responsibility fields, and letting a Role declare them would
create a second responsibility chain
(`repo://libs/evidence-schema/src/ast/entity.ts#L29-L37`,
`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1000-L1020`).

### Context: contract, pre-contract or domain

A Context must not have `contextRef`; it may have `parentContextRef`, and
`contract` / `domain` contexts must declare `rootRefs` with real content. A
Contract Context has exactly one root, and it must be an `evidence.contract` owned
by that Context. Parent chains may not cycle
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L631-L760`,
`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1076-L1105`).

## Attributes

An attribute is the unit of business meaning:

```jsonc
{
  "name": "confirmed_at",
  "label": "确认时间",
  "meaning": "卖方确认收款到账时的业务时间。",
  "valueType": "timestamp",
  "required": true,
  "keyData": true
}
```

`name` must be lower snake_case and unique inside the entity; `label` and
`meaning` are mandatory non-empty strings; `valueType`, when present, must be one
of the declared types; `required` and `keyData` must be booleans
(`repo://libs/evidence-schema/src/ast/entity.ts#L68-L92`,
`repo://libs/evidence-schema/src/validation/strictValidate.ts#L445-L515`).

`derivedByRuleRef` is the pointer from an attribute to the derivation that computes
it. It must resolve to a rule, and — enforced in both directions — that rule must
be a `derivation` whose `target` is exactly this entity and attribute, in the same
Context (`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1732-L1782`).
The symmetry is the point: an attribute cannot claim a formula, and a formula
cannot write an attribute that does not point back.

## Relationships

Only two kinds exist: `plays_role` and `references`
(`repo://libs/evidence-schema/src/ast/relationship.ts#L1-L30`).

Both endpoints must resolve, and self-relationships are refused. Contract-to-
Contract connections are refused outright: a chain of contracts is not a
responsibility, it is a missing Context
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1314-L1400`).

### `plays_role` is direction-checked

Allowed pairs are explicit
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1279-L1312`):

- `participant.party` → `role.party`
- `participant.party` → `role.third_party`
- `participant.thing` → `role.domain`
- a Context → `role.context`
- a **moment** Evidence (`fulfillment_confirmation`, `other_evidence`,
  `contract`) → `role.evidence`

A moment playing an evidence Role must come from **another** Context: the Role is
the socket, and the player is the implementation that sits behind it.

### `references` is cross-context only by whitelist

Same-context references are ordinary. Crossing a Context boundary is allowed only
for:

1. a Contract referencing a Proposal, where the Proposal Context declares the
   Contract Context as its `parentContextRef`;
2. Evidence referencing a Thing;
3. Evidence referencing a moment Evidence or an Evidence Role.

Everything else is `relationship.references.crossContext`
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1400-L1485`).

Cardinality is optional but validated when present: `min ≥ 0`, `max` a positive
integer or `"many"`, and `min ≤ max`.

## Rules are CEL, and their kind decides their shape

`RULE_KINDS` is `derivation`, `precondition`, `invariant`, `eligibility`,
`completion`, `breach`. All but `derivation` are boolean decisions, and their
`resultType` must be `bool`.

A `derivation` **must** declare a `target` (`entityRef` + attribute); any other
kind **must not**. A rule requires `label`, `description`, `expression` and a
`contextRef` pointing at a Context. Bindings are either a modeled reference or a
runtime value type, and the alias must be a CEL identifier
(`repo://libs/evidence-schema/src/ast/rule.ts#L1-L50`,
`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1490-L1725`).

```jsonc
{
  "type": "rule",
  "id": "rule.payment-completed",
  "kind": "completion",
  "label": "付款完成判断",
  "description": "付款确认在请求有效期内形成时，付款请求履约完成。",
  "contextRef": "context.product-procurement",
  "bindings": {
    "request": { "ref": "request.payment" },
    "confirmations": { "ref": "confirmation.payment", "cardinality": "many" }
  },
  "expression": "confirmations.exists(c, c.confirmed_at >= request.started_at && c.confirmed_at <= request.expired_at)",
  "resultType": "bool"
}
```

The static validator checks that every binding ref exists. It does **not** parse or
evaluate the expression — that is the CEL pass in `evidence-model-core`, described
in [The native check and simulation pipeline](../model/checks-and-simulation.md).

## Provenance

`sourceSnippet` is optional on every entity and carries the verbatim sentence an
ingested element came from, plus a human-readable locator and the input kind
(`repo://libs/evidence-schema/src/ast/provenance.ts#L1-L39`). Hand-written models
may omit it; ingested ones keep it so a reviewer can re-read the clause instead of
trusting the extraction.

## What the static validator deliberately does not do

`strictValidateDomainModel` owns document shape, identifier grammar, category/kind
contracts, reference resolution, context ownership, relationship endpoints and
derivation symmetry. Traceability, key-data providers, scope completeness and CEL
evaluation are separate passes in `evidence-model-core`, not re-implemented here
(`repo://libs/evidence-schema/src/validation/strictValidate.ts#L1792-L1800`).

That boundary is why a model can be **structurally valid** and still fail a check:
structure is necessary, not sufficient.

## What the language forbids, in one list

| Forbidden | Why |
| --- | --- |
| duplicate ids across collections | references must be unambiguous |
| `contextRef` on a Context, or on a `participant.party` | ownership belongs to objects, not to the roles they play |
| Contract with fewer or more than two Party Roles | a contract is bilateral |
| `rfp`/`proposal` outside a pre-contract Context | the phase is part of the claim |
| `fulfillment_request`/`confirmation` outside a contract Context | obligations arise from a contract |
| Thing outside a domain Context | the subject of trade is not an obligation |
| a non-contract Evidence without a responsible Party Role | every obligation has an owner |
| `derivedByRuleRef` without the matching rule target | a formula must be traceable both ways |
| `plays_role` in the wrong direction or between wrong kinds | roles are sockets, players are implementations |
| Contract → Contract relationship | responsibility is not a contract chain |
| Context parent cycle | the graph would be unbounded |
| non-boolean decision rule | a decision must decide |
| `target` on a non-derivation rule | only derivations write values |

## Tests that protect this contract

`strictValidate.spec.ts` mutates clones of
`tests/fixtures/product-procurement/` rather than editing fixtures, so each rule is
exercised against a real model and the fixture stays a stable snapshot
(`repo://libs/evidence-schema/README.md#L23-L24`). The AST modules carry their own
specs for ids, values, key data and document guards.

## Related pages

- [Key data, business time and provenance](../language/key-data-and-provenance.md) —
  the vocabulary behind `keyData` and provider decisions.
- [The native check and simulation pipeline](../model/checks-and-simulation.md) —
  the passes that run after structural validation.
- [Source tree and bundle adapters](../model/source-formats.md) — how a document is
  stored.
- [Canvas layout, viewport and inspector](../desktop/canvas-and-inspector.md) — how
  these categories are drawn and edited.
