---
type: testing
title: Verification strategy and fixtures
description: How the repository proves itself — co-located Vitest projects, injected ports instead of live models or terminals, three fixture families, desktop end-to-end loops, and the pinned digests that are part of the report contract.
tags: [testing, vitest, fixtures, digests, injection, desktop]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-55138c775f581f8c989ca7dc
    resource: repo://apps/desktop/src/main/agentRuntime.ts
  - id: openwiki-source-310af6f70610151f6693b6d6
    resource: repo://apps/desktop/src/main/reviewIpc.ts
  - id: openwiki-source-4ec1ced453a5afcf3c286d9b
    resource: repo://apps/desktop/src/renderer/test-support/desktopApi.ts
  - id: openwiki-source-5a8bb195f6c36951b548492b
    resource: repo://apps/desktop/tests/integration.spec.ts
  - id: openwiki-source-47ca9da7961156aadbba9a5c
    resource: repo://apps/desktop/tests/phase-3-loop.spec.ts
  - id: openwiki-source-15aba07b973e26bd886a7db3
    resource: repo://apps/desktop/vitest.config.mts
  - id: openwiki-source-0c1cc5dc86ad401eb9678504
    resource: repo://ENVIRONMENT.md
  - id: openwiki-source-2aee63787f350178c887a6cd
    resource: repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts
  - id: openwiki-source-e356c0907855832499bad250
    resource: repo://libs/evidence-api/tests/support/fixtures.ts
  - id: openwiki-source-65aecc4d0c320b921968555c
    resource: repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts
  - id: openwiki-source-d72e0b169ed5313d27b92071
    resource: repo://libs/evidence-model-core/tests/fixtures/README.md
  - id: openwiki-source-6ba748254f38112b13d529da
    resource: repo://nx.json
  - id: openwiki-source-b58f839a189d87a7e1f37d39
    resource: repo://vitest.config.mts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# Verification strategy and fixtures

Evidence has no manual test suite and no golden-screenshot process. Its confidence
comes from four habits:

1. tests live next to the code they describe;
2. external systems (Pi, Electron, filesystem, clock) enter through injected ports;
3. a small number of golden fixtures carry the expensive invariants;
4. digests and report shapes are pinned, so a semantic change cannot pass as a
   formatting change.

## One command, many Vitest projects

The root `vitest.config.mts` is a discovery file: it collects every
`vite.config.*` and `vitest.config.*` in the workspace and excludes itself
(`repo://vitest.config.mts#L1-L12`). Each library and the desktop app own one
project with its own environment:

| Project | Environment | Includes |
| --- | --- | --- |
| libraries | `node` | `{src,tests}/**/*.{test,spec}.*` |
| `apps/desktop` | `jsdom` | `src/renderer`, `src/shared`, `src/main`, `tests` |

The desktop's single project is deliberate: React tests need jsdom, and the store
tests only use Node APIs that remain available inside jsdom
(`repo://apps/desktop/vitest.config.mts#L1-L40`).

Nx infers a `test` target from each config and a per-file `test-ci--*` target, and
`test` depends on `^build`, so a library's consumers test against a built
dependency graph (`repo://nx.json#L52-L64`).

```bash
pnpm test                              # nx run-many --target=test --all
npx vitest run --project evidence-schema
nx affected --target=test --base=main
```

## Injection is the default, not a special case

Almost every expensive dependency is a constructor/injection point:

| Port | What tests substitute |
| --- | --- |
| `PiSdkPort` | the whole Pi SDK: no credentials, model or terminal (`repo://libs/evidence-agent-core/src/session/evidenceAgentSession.ts#L12-L33`) |
| `sessionFactory`, `sensors`, `transport` | the agent runtime and patch round trip (`repo://apps/desktop/src/main/agentRuntime.ts#L32-L50`) |
| `createRuntime` | the desktop agent IPC |
| `projectStore` | persistence in ingestion and review tests |
| `generate`, `readDocument`, `resolveAssets` | workbench generation without touching disk (`repo://apps/desktop/src/main/reviewIpc.ts#L29-L41`) |
| `createEngine` | the MCP sensor service |
| `now` | report timestamps and branch metadata |
| `readFile` / `fileExists` | adapters and asset resolution |

The pattern is not just for speed. A test that boots a real model would assert on
the model's behavior; these tests assert on *our* contract — what arguments we
pass, what we do with the result, and what we refuse.

## Three fixture families

`ENVIRONMENT.md` names the rule: fixtures live in the libraries, and suites in
other packages read them by relative path rather than keeping a copy
(`repo://ENVIRONMENT.md#L46-L57`).

### 1. Check fixtures (`libs/evidence-model-core/tests/fixtures/`)

| Fixture | Why it exists |
| --- | --- |
| `models/valid-traceable-subscription/` | six instances, three scenarios, two derivation chains and one key-data decision still owed; every report contract is pinned against it |
| `invalid-missing-confirmation/` | consistent but **incomplete**: a request with no confirmation and a Contract Party holding no request |

The rules for the directory are explicit: keep the layout identical to a real
`.evidence/fm/` tree, never hand-edit a fixture to make a test pass, and re-pin
digests deliberately (`repo://libs/evidence-model-core/tests/fixtures/README.md#L1-L22`).

### 2. The product-procurement snapshot (`libs/evidence-schema/tests/fixtures/`)

A snapshot of a real model tree, kept in the schema package so validator tests stay
stable when the API fixture moves. Validator tests mutate **clones** of it, which is
why the fixture can remain a faithful example rather than a test-shaped model.

The desktop end-to-end suite copies it into a temporary project and mutates the
copy (`repo://apps/desktop/tests/integration.spec.ts#L18-L42`).

### 3. API fixtures (`libs/evidence-api/tests/fixtures/`)

`full-lifecycle/` carries a model tree, `api.json` and an `openapi.json` snapshot
for the same procurement chain; `subscription-api.json` is a minimal design. The
test support does not hand-write a check report — it runs the real FM pipeline to
produce one (`checkReportFor`), so the API stage is tested against a report the FM
stage would actually emit
(`repo://libs/evidence-api/tests/support/fixtures.ts#L18-L56`).

## Desktop end-to-end

`apps/desktop/tests/integration.spec.ts` is the one suite that crosses the package
boundary on purpose. It reads the procurement fixture, then:

- parses it with no issues and validates it statically
  (`repo://apps/desktop/tests/integration.spec.ts#L44-L55`);
- lays out every object with no omitted Context shell and one fulfillment group per
  request, and marquee-selects a group
  (`repo://apps/desktop/tests/integration.spec.ts#L56-L87`);
- highlights the neighbours of a hovered request
  (`repo://apps/desktop/tests/integration.spec.ts#L88-L105`);
- opens it through the real project store, saves twice, asserts the second save
  writes and removes nothing, and re-parses to an equal document
  (`repo://apps/desktop/tests/integration.spec.ts#L106-L140`);
- dispatches 50 edits and 50 undos, asserting the document returns exactly to the
  original and stays valid
  (`repo://apps/desktop/tests/integration.spec.ts#L141-L166`);
- edits the tree, writes it, then writes again and asserts zero changed files and
  the new label after a re-parse
  (`repo://apps/desktop/tests/integration.spec.ts#L167-L207`).

That suite protects the composition, not the units: parse → session → layout →
selection → disk → parse again.

## The phase-3 control loop

`apps/desktop/tests/phase-3-loop.spec.ts` wires the real agent runtime to a fake
session and a stubbed transport, then drives the six tools the session registers
(`repo://apps/desktop/tests/phase-3-loop.spec.ts#L128-L228`):

- `run_sensors` publishes the report and returns it;
- `apply_model_patch` reaches the transport, the transport decodes and dispatches
  into the real `ModelSession`, and the object is present;
- `session.undo()` restores the exact previous document;
- the tool list is asserted by name and order.

Two more tests keep the surrounding claims honest: the frontier is derived from the
trace against the live model, and a full sensor run on the fixture produces no
`unavailableSensors` — proving there is no interpreter or external check to find
(`repo://apps/desktop/tests/phase-3-loop.spec.ts#L230-L253`).

Renderer tests use `installDesktopApi`, a fake `window.evidenceAPI` that records
calls and returns typed results, so UI tests never boot Electron
(`repo://apps/desktop/src/renderer/test-support/desktopApi.ts#L198-L230`).

## Digests are contract, not snapshots

Two values are pinned in `fmCheck.spec.ts` for the subscription fixture scope:

- `modelDigest: sha256:7b00…`;
- `timelineSummary.sha256: sha256:361a…`, together with lane/type/instance/
  dependency/unresolved counts.

The comment at the assertion states the rule: these are report contract, so they
must not drift
(`repo://libs/evidence-model-core/src/validation/fmCheck.spec.ts#L72-L104`).

`ENVIRONMENT.md` extends it to process: a change to canonical serialization is a
change to the contract, so refresh the pinned values deliberately and say why in
the commit message (`repo://ENVIRONMENT.md#L54-L57`).

This is why a passing suite is meaningful: an innocent-looking refactor of key
order or newline handling fails loudly.

## What is deliberately not tested through the real thing

| Real dependency | Test substitute | Why |
| --- | --- | --- |
| Pi model / credentials | `PiSdkPort` fake | tests must run offline and deterministically |
| Electron windows | `installDesktopApi` fake and injected `WebContents` stubs | UI logic is not window lifecycle |
| model process / interpreter | none exists; sensors run in-process | the old interpreter is gone |
| live filesystem for review export | injected `generate`, `readDocument`, `resolveAssets` | asserts IPC contract, not the page renderer |
| wall clock | injected `now` | reproducible timestamps and debounce tests |
| real sockets in most tests | in-memory transport | only the bridge spec opens a real Unix socket |

The bridge spec is the exception that proves the rule: it creates a real socket,
asserts the `0o600` mode, a round trip, a timeout and endpoint reuse after close,
because the transport itself is the thing under test.

## Failure modes a reviewer should expect from the suite

| Change | What fails first |
| --- | --- |
| canonical JSON key order or newline | pinned `modelDigest` / timeline sha |
| scope selection includes an unrelated Contract | `scope.spec.ts` whole-context tests |
| a guard allows a red-line edit | command specs and `strictValidate` specs |
| layout stops omitting empty Contexts | desktop integration layout test |
| save rewrites unchanged files | disk adapter idempotency and desktop integration |
| prompt starts naming a skill | `prompts.spec.ts` relic check |
| Vite config loses the source condition | every workspace import fails as "missing module" |

## Commands

```bash
pnpm test                                         # all projects
npx vitest run --project evidence-model-core      # one library
npx vitest run --project @evidence-poc/desktop    # the app
pnpm nx run-many --target=typecheck --all         # tsc --build across refs
pnpm nx run-many --target=lint --all              # includes module boundaries
```

## Related pages

- [Workspace, build and packaging](../operations/build-and-package.md) — how these
  targets are inferred and run in CI.
- [The native check and simulation pipeline](../model/checks-and-simulation.md) —
  what the golden fixture pins.
- [API contract projection](../contracts/api-projection.md) — the full-lifecycle
  fixture and its OpenAPI snapshot.
- [The Pi agent harness and its tools](../agents/pi-harness.md) — the injected SDK
  port.
