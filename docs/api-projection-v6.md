# API projection v6

The FM model keeps schema version 5.0. Its API snapshot and export manifest use
6.0; the OpenAPI document uses OpenAPI 3.1 with `info.version: 6.0.0`. The business
model's version remains available as `x-evidence-model-version`.

## Business resource addresses

Public paths start at the aggregate's business noun, derived from its entity ID.
A deployment Context supplies a service boundary, never a URI prefix.

| Resource | Creation | Primary GET |
| --- | --- | --- |
| Inquiry | `/product-inquiries` | `/product-inquiries/{inquiryId}` |
| Contract | `/product-procurements` | `/product-procurements/{contractId}` |
| Singleton payment | `…/{contractId}/payment` | same path |
| Repeated payment | `…/{contractId}/payments` | `…/{contractId}/payments/{paymentId}` |
| Payment confirmation | `…/payment/confirmation` | same path when singleton |
| Domain root | read only | `/products/{productId}` |

The child endpoint's `references` cardinality determines singleton versus
collection, whichever direction the relationship points. Missing or contradictory
cardinalities imply a collection. The full-lifecycle fixture declares singleton
quotations and payments; changing a child's maximum to `many` produces the plural
collection and its instance parameter. Collection GETs accompany collection
creation; confirmations also have primary GETs.

Proposals nest under the inquiry they reference. A contract referencing a proposal
also gets a signing operation under that proposal's primary URI, served by the
contract service. Both signing entrances return the same new contract primary URI.
Independent `other_evidence` with a modeled `id` value type gets a top-level
read-only collection and primary GET. Other supporting evidence is not assumed to
have a globally addressable identity.

Names are allocated globally among public roots and locally among child siblings.
Same-name roots receive deterministic identity suffixes. Allocation does not depend
on enumeration order, scoped export, Context names or unrelated roles. Creating a
new root that actually collides with an existing business name is a contract
change and should be checked with `evidence diff`.

## HAL and caller discipline

Every POST's 201 `Location` and `_links.self` identify a GET operation. A collection
GET returns `_links.self`, `_embedded.<business-collection>` summaries with their
own primary links, and a nonnegative `total`. Entity and collection schemas are
separate OpenAPI components. Reference edges produce templated `next:<entityRef>`
links; they describe possible navigation, while runtime authorization and business
state determine whether an operation is currently available.

Only caller-owned attributes appear in POST input, with
`additionalProperties: false`. Derived and service-time response fields are
`readOnly`; derivations retain their rule references. External callers must play a
real `role.party` through a `participant.party` relationship.

An overlay can move a creation entrance independently of its primary GET. Moving
the primary GET updates all corresponding creation `Location` and self templates.
Overlays must retain the operation's identity parameters; collisions are errors.

## Service ownership and gateway

A service has `routePrefixes` and `routes` (exact route IDs). Topology, OpenAPI
service extensions, desktop previews and MCP return the same ownership. A contract
service may own a proposal-signing URI under the channel's business root, so a
prefix alone is not sufficient to decide ownership.

The generated Compose sketch includes Traefik and one backend per Context. Its
routers match method and an anchored path-template regular expression, and each
backend receives JSON `EVIDENCE_ROUTE_PREFIXES` and `EVIDENCE_ROUTES`. Backend images
and port 8080 remain deployment placeholders. The sketch needs no Docker to
project or test. Legacy URI rewriting is optional and is not enabled by default.

## Overlay migration

```bash
pnpm exec nx build cli
pnpm evidence api migrate-overlay --in overlay.old.json --out overlay.new.json
# For a model outside the default .evidence/fm:
pnpm evidence api migrate-overlay --model model.evidence.json \
  --in overlay.old.json --out overlay.new.json
```

Migration reads the model because old paths alone do not express cardinality.
It recognizes v5 defaults, projects their v6 paths, upgrades obsolete singleton
ledger route IDs and journey references, and preserves custom aliases and
summaries where their parameters remain valid. Unknown routes and ambiguous
parameter changes fail for manual review. Output must be a new file; source
files are never overwritten. Both 5.0 and 6.0 overlay envelopes are readable;
newly migrated overlays declare 6.0.

## Verification and generated documents

```bash
pnpm api:setup
pnpm example:setup
pnpm example:test
pnpm boundaries:drill
pnpm exec nx run-many -t lint,typecheck,test
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json \
  --out examples/b2b-escrow/generated --verify
```

Use Node 22 as described in ENVIRONMENT.md. The standalone Fastify SUT implements
the v6 contract; its native tests follow created primary URIs and inspect HAL
collections. The official Step CI Runner verifies five B2B flows and 121 steps,
including independently broken amounts, clocks and payloads. Step CI and Hurl
share model-identified parameter captures, including proposal signing.

OpenWiki is maintained through the pinned OpenWiki 0.9.0 generation lifecycle or
`.github/workflows/openwiki-update.yml`; the workflow currently requires manual
triggering. Changes to Markdown pages and their Claim credentials are finalized
by OpenWiki together, rather than by changing evidence hashes manually.
