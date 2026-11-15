# Black-box acceptance dogfood backend

A small **test-only**, independent Node HTTP implementation of the procurement
model in `../acceptance/procurement.evidence.json`. It never imports Evidence's
model, CEL evaluator, projector, or expected test values. State is in memory;
restart it between unrelated runs. This is not a production backend.

From the repository root:

```sh
pnpm exec nx build cli
node apps/cli/dist/cli.js export \
  --model examples/acceptance/procurement.evidence.json --out dist/acceptance
node examples/dogfood-backend/server.mjs --port 8085
# In another terminal:
node apps/cli/dist/cli.js test --target http://127.0.0.1:8085 \
  --scenarios dist/acceptance --verbose
```

`pnpm evidence` is a shortcut for the built CLI. Tests are standard Step CI YAML;
the runner is the official `@stepci/runner`. Hurl exports can be run separately
with `hurl --test --variable host=http://127.0.0.1:8085 dist/acceptance/*.hurl`.

## Red / green demonstration

Restart the server with `--fault amount`: the same test suite fails with
`Expected: 500`, `Received: 501`. With `--fault clock` it fails the `signed_at`
assertion. With `--fault none` (default) all four steps pass, including rejection
of caller-supplied `total_amount`. Further fault modes: `accept-derived` and
`extra-field`. The server binds **only to loopback**, prints its URL as JSON on
startup (`--port 0` chooses an available port), and handles SIGINT/SIGTERM.

## Incremental deposit / dual-gate demonstration

`--mode v1` supports only the original payment flow. `--mode v2` (default) also
supports an independent deposit request/confirmation pair and computes a 20%
deposit without importing model rules. The deposit model preserves the original
payment examples and adds an isolated three-step `deposit` flow. It intentionally
does not make deposits mandatory for existing payments (that would be a breaking
business policy change, not an additive demonstration).

```sh
pnpm evidence export --model examples/acceptance/procurement-deposit.evidence.json \
  --out examples/governance/generated
pnpm evidence export --model examples/acceptance/procurement-deposit.evidence.json \
  --out examples/governance/generated --verify
node examples/dogfood-backend/server.mjs --port 8085 --mode v1
# Another terminal; regression passes, DoD fails at the new deposit request (404):
pnpm evidence test --target http://127.0.0.1:8085 \
  --scenarios examples/governance/generated --gate regression \
  --baseline-model examples/acceptance/procurement.evidence.json
pnpm evidence test --target http://127.0.0.1:8085 \
  --scenarios examples/governance/generated --gate dod \
  --baseline-model examples/acceptance/procurement.evidence.json
```

Restart with `--mode v2`: both gates pass. Use `--allow-pending` **explicitly** on
DoD only for feature development; it returns zero for incomplete business checks
but retains `passed: false` / PENDING in reports. Infrastructure errors and strict
drift remain fatal. Never use it for merge/release gates.

`--fault extra-field` produces `/unmodeled` warnings with `--detect-drift` and
fails with `--strict-drift`. `--fault missing-derived` omits the calculated amount;
JSONPath business assertions still fail in advisory mode, and the probe also
reports the missing required field. `--fault amount` proves the original
baseline regression still catches wrong totals. Drift inspects actual observed
responses, not production traffic or unexecuted endpoints.

Filters (`--filter 'deposit*'`, `--tag deposit`) select **whole flows**, including
all prerequisite steps. Regression executes the original baseline suite, not a
weakened intersection with head. DoD executes new **or changed** complete flows.
Generated flow ordinals and capture names do not create false increments.
Use `--json`, `--report markdown`, or `--report junit` to publish results in CI.

## Request-scoped business clock

The server uses `interceptors/node.mjs` (AsyncLocalStorage). Every business read
uses `getBusinessTime()`; no global Date patching or cross-request clock state.
Missing/invalid timestamps fall back to real UTC time. The generated suite keeps
its example clocks as defaults. `--as-of 2026-03-31T10:00:00Z` overrides all request
clocks but **does not regenerate compiled expected business values**. A different
clock may intentionally turn a time-sensitive assertion red; regenerate the
model examples to change the acceptance baseline.

Copyable integration templates (not additional repository toolchains):

- **Node**: `interceptors/node.ts`, use `app.use(evidenceClockMiddleware(true))`
  only in a trusted test environment. Fastify can wrap the route handler using
  the `withEvidenceClock` pattern in `node.mjs`.
- **Go**: `interceptors/golang.go`, wrap your handler with
  `EvidenceClockMiddleware(testEnvironment, handler)` and read `Now(r.Context())`.
- **Spring MVC**: copy `interceptors/EvidenceClockInterceptor.java`, register the
  component through `WebMvcConfigurer.addInterceptors`, enable
  `evidence.acceptance-clock=true` only in the acceptance profile, and read
  `EvidenceClockInterceptor.now(request)`. Request attributes avoid ThreadLocal
  leaks, including servlet async dispatch.
- **FastAPI**: copy `interceptors/python.py` and call
  `app.add_middleware(EvidenceClockMiddleware, enabled=test_environment)`;
  business code reads `get_now()`. ContextVar tokens reset even on failure.

All templates are **disabled by default**. Never enable client-controlled clock
or role headers on an untrusted production API. Do not use the fixture's
`x-evidence-role` as production authorization. These headers do not freeze timers,
background workers, or third-party systems: those need their own injected clocks.

The fixture has no external dependencies. For a real payment service, configure
its outbound client to a separately managed WireMock/Prism server in the test
environment; do not silently turn production business logic into a header-driven
mock. This example does not claim to verify real payment or infrastructure.
