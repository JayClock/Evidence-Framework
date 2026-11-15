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
