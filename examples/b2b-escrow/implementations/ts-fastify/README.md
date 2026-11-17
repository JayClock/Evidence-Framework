# B2B escrow — standalone Fastify service

A test-only engineering reference: Fastify routes/hooks, strict Zod DTOs,
request-local `AsyncLocalStorage`, domain services and a replaceable in-memory
ledger. This directory can be copied into its own repository. It imports no
Evidence packages, models, expected test values or other implementations.

## Run independently

Requires Node.js 22+ and pnpm 12.16.1. From **this directory**:

```sh
pnpm install --frozen-lockfile
pnpm test                       # TypeScript build + native node:test suite
pnpm start --test-mode --port 8085
# Or: node dist/server.js --test-mode --port 0
```

`--port 0` selects a free loopback port. The first stdout line is JSON
`{"host":"http://127.0.0.1:..."}`; startup errors go to stderr and exit nonzero.
SIGINT/SIGTERM close the HTTP listener. No database, Docker, global tools or
parent workspace packages are required.

Optional arguments:

- `--mode v1|v2` (default v2): v1 omits optional milestone routes but keeps single
  delivery and settlement. v2 supports both workflows.
- `--fault none|amount|clock|extra-field|missing-derived|accept-derived|precision`
  (default none): deliberately broken responses/behavior for external acceptance
  tests. Do not enable faults for normal validation. Unknown faults fail closed.
  `accept-derived` echoes an illicit payout with 201 instead of rejecting it;
  `extra-field` leaks `unmodeled`; `clock` discards a valid request clock;
  `precision` round-trips exact integers through Number at the response boundary.
  Faults still require test mode, a valid identity and valid clock syntax.
- `--test-mode` is **required**. Test identity and UTC clock come from
  `x-evidence-role` / `x-evidence-asof`. Missing identity is 401; forbidden role
  is 403; invalid clock is 400. A missing clock uses the real current UTC second.
  These headers are NOT production authentication or authorization. This server
  refuses normal startup without test mode; it has no production identity provider.

## HTTP and domain behavior

- Four bilateral contract collections: `/agreements`, `/escrows`,
  `/fulfillments`, `/settlements`. Each supports GET collection and POST signing;
  contract instances use `/{collection}/{contractId}`.
- Obligation requests use plural business collections, such as
  `POST /agreements/{contractId}/orders` and
  `POST /fulfillments/{contractId}/deliveries`. GET the same path to list
  requests; GET `…/orders/{orderId}` to read one. POST/GET
  `…/orders/{orderId}/confirmation` records/reads its confirmation.
- Explicit evidence IDs connect orders, funded deposits and accepted deliveries.
  IDs are opaque; no prefix parsing, global “latest order” or test-label lookup.
- Caller DTOs reject unknown fields, derived amounts and server-stamped times.
- Amounts are integer CNY fen; rates are basis points. BigInt computes exact
  half-up results and capped penalties. Inputs/results are bounded by signed
  int64; safe JSON integers remain numbers, larger values are decimal strings.
  This follows the contract's integer model rather than pretending binary
  floating-point or an unmodeled decimal type is exact.
- Confirmations check request ownership, prerequisites, chronology and 48-hour
  expiry. Delivery must be complete. Single/milestone modes cannot mix inside a
  fulfillment contract. A release is unique **per order**, even if a caller opens
  another settlement contract or uses another confirmation ID.
- Validation and memory commits happen synchronously in one event-loop turn.
  Failed writes commit nothing; concurrent releases produce one 201 and one 409.
  A database adapter would need real transactions and uniqueness constraints.
- Successful responses use HAL JSON. Each normal POST's 201 Location and
  `_links.self.href` identify the same readable primary URI. Collection GETs
  return `_links.self`, `_embedded.<business-collection>` arrays and `total`;
  empty collections have an empty array and zero total. Contract reads use the
  signing roles, request collection/instance reads use the requesting role,
  and confirmation reads use the confirming role. GETs expose stored facts.

## Limits

Memory is per process and is lost on restart. Start a **new process for each
acceptance run/gate**; re-running state-changing examples against the same ledger
correctly conflicts. Native tests cover permission, time, precision, cross-order
references and atomic release behavior. `test/faults.test.mjs` independently
checks the four deliberate faults, no-fault default and fail-closed guards.
External HTTP contract suites are supplied
by the consumer; this package does not require them to install/build/run/test.
Durable persistence, real bank transfers, production identity, browser UI/E2E,
refunds and arbitrary multi-stage settlement are not implemented here.
