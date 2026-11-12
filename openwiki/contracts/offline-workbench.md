---
type: contract
title: The offline review workbench
description: How a checked model and its API projection become one self-contained, read-only HTML page — with input fingerprinting, a whitelisted data projection, a hash-pinned CSP, and an atomic publisher that refuses files it did not write.
tags: [visualization, review, html, csp, publishing, offline]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-12T12:33:13.984Z
sources:
  - id: openwiki-source-7a2d89c223533648b5710a12
    resource: repo://libs/evidence-visualization/src/cli.ts
  - id: openwiki-source-3ae8adf574661c7d35742fbe
    resource: repo://libs/evidence-visualization/src/generate/collectWorkbench.ts
  - id: openwiki-source-96d2a612a941794b7305e7a6
    resource: repo://libs/evidence-visualization/src/generate/generateWorkbench.spec.ts
  - id: openwiki-source-25991f0e9374ce7206572f30
    resource: repo://libs/evidence-visualization/src/generate/generateWorkbench.ts
  - id: openwiki-source-addb7f530e7184b8278871b4
    resource: repo://libs/evidence-visualization/src/projection/workbenchProjection.spec.ts
  - id: openwiki-source-1424b0cd227894b90f6674f4
    resource: repo://libs/evidence-visualization/src/projection/workbenchProjection.ts
  - id: openwiki-source-28ab8d38fd5d45f412609ea7
    resource: repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts
  - id: openwiki-source-788a2130bc7c34cc6c185ad2
    resource: repo://libs/evidence-visualization/src/render/workbenchAssets.ts
  - id: openwiki-source-e24bc99595a43e4b823f1ebd
    resource: repo://libs/evidence-visualization/src/render/workbenchRenderer.spec.ts
  - id: openwiki-source-4e22d925c6c713609335897f
    resource: repo://libs/evidence-visualization/src/render/workbenchRenderer.ts
generated: { by: "pi", at: "2026-11-12T12:33:13.984Z" }
---

# The offline review workbench

`libs/evidence-visualization` produces the artifact a human reads when the
interview and the API design are done: a single HTML file that opens without a
server, shows the business objects and their formal references, and states which
checks stand behind it. It is the `evidence-workbench` command and the desktop's
"export review page" action.

The design goal is snapshot integrity. A review page may be mailed to a colleague
weeks after it was written, so it must describe exactly the inputs that existed
when it was generated — and a failed regeneration must never damage the previous
copy.

## Generate: read, render, publish

`generateWorkbench` is three steps with a guard on each side
(`repo://libs/evidence-visualization/src/generate/generateWorkbench.ts#L55-L85`):

1. Fingerprint the project inputs.
2. Collect the checked model, API projection and traces; render the HTML.
3. Fingerprint again. If the digest moved, throw
   `发布前输入变化，保留已有视图` and do not publish.

Only then does it create the output directory and call `publishWorkbench`.

## What the fingerprint covers

`workbenchFingerprint` walks `.evidence/fm` recursively and appends
`.evidence/api/api.json` when it exists, then hashes each sorted path and its
bytes separated by NUL bytes
(`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L155-L200`).

Two exclusions are deliberate: `generated/` and `__pycache__` are not inputs, and
counting them would make a previous run change its own next fingerprint. Symbolic
links are refused rather than followed — a link would let the page carry a file
outside the project the reader was given
(`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L74-L134`).

## Collection enforces the gate

`collectWorkbench` is where the page inherits the model's verdict
(`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L253-L388`):

- With `requireApi` and no `.evidence/api/api.json`, it refuses: "联合审核需要当前
  .evidence/api/api.json，不生成 FM 单独页面".
- With an API design but no `--scope`, it refuses: a joint review cannot pass a
  consistency-only result off as scope completeness.
- The FM report must be `valid` and not `inputChanged`; otherwise `FM 未通过，不生成视图`.
- `loadFm` must accept the same check report — the same digest/staleness gate the
  API projection uses.
- After the API projection, the `modelDigest` recorded in `fmCheckSummary` must
  equal the digest the check produced. A mismatch means the model moved between
  the check and the projection, and collection stops.
- Finally the fingerprint is re-read, so a mid-generation edit is caught before
  any data is returned.

Every failure is a `WorkbenchInputError` with a sentence a reviewer can act on,
not a partial page.

## The page projection is a whitelist

`projectWorkbenchData` builds nodes and edges from the compiled model, scenarios,
instances, simulation results, API projection and traces. The module header states
the rule: every field is selected by name, so a new key in a source document can
never leak into the page by accident
(`repo://libs/evidence-visualization/src/projection/workbenchProjection.ts#L1-L11`).

The projection produces:

| Part | Contents |
| --- | --- |
| `nodes` | contexts, evidence, participants, roles, rules, attributes, instances, scenarios, resources, capabilities, journeys |
| `edges` | ownership, responsibility, contract parties, relationship endpoints, rule reads and targets, API bindings |
| `unresolved` | edge targets no node defines, kept visible instead of dropped |
| `counts` | contract contexts, entities, rules, scenarios, capabilities |
| `validation` | consistent/complete/scopes/gaps/simulation/API completeness and unresolved timeline order |

Node ids are formal business ids (`request.payment`,
`request.payment#amount`), so a reader can quote one and find it in the source
(`repo://libs/evidence-visualization/src/projection/workbenchProjection.ts#L188-L193`).
`validation.fm` is the literal `true`, because the collector refuses to build a
page from an unchecked model
(`repo://libs/evidence-visualization/src/projection/workbenchProjection.ts#L615-L627`).

A duplicate object id throws instead of overwriting the first object, and a
dangling reference becomes an `unresolved` entry rather than a silently missing
edge (`repo://libs/evidence-visualization/src/projection/workbenchProjection.ts#L596-L605`,
`repo://libs/evidence-visualization/src/projection/workbenchProjection.spec.ts#L241-L260`).

### The privacy claim has one exception

The header says raw documents, file paths, interview prose, material sources,
commands, input digests and Git history stay out, and the projection test asserts
that `sourceRefs`, `modelDigest`, `inputFiles`, `executions`, `locations` and
`notes` never appear (`repo://libs/evidence-visualization/src/projection/workbenchProjection.spec.ts#L224-L239`).

However, when a trace exists, `projectWorkbenchData` attaches the **whole** trace
record to the Evidence it cites:

```ts
node['interviewTraces'] = attached;
```

That object includes `narrative.story`, `narrative.judgment`, `qa` and
`userInput.rawText` — the interview prose the header says is excluded — because the
records are assigned as-is rather than passed through `select`
(`repo://libs/evidence-visualization/src/projection/workbenchProjection.ts#L559-L593`).
The trace panel is a deliberate feature, but the privacy statement should be read
as applying to model and API fields, not to attached interview records.

## The page is self-contained and inert

`renderWorkbenchHtml` fills a template with four assets: the joined application
script (`business-graph.js` + `workbench.js`), the stylesheet, the escaped JSON
payload, and a Content-Security-Policy
(`repo://libs/evidence-visualization/src/render/workbenchRenderer.ts#L57-L102`).

Three protections are enforced:

- **Escaped payload.** `embeddedJson` replaces `<`, `>`, `&`, U+2028 and U+2029
  with escapes, so a business label containing `</script>` cannot close the tag
  (`repo://libs/evidence-visualization/src/render/workbenchRenderer.ts#L35-L42`).
- **Exactly one inline script.** `inlineScriptOf` refuses a template with zero or
  more than one script; the CSP is computed over the whole joined script.
- **Hash-pinned policy.** `scriptHashCsp` emits `default-src 'none'`,
  `script-src 'sha256-…'`, `style-src 'unsafe-inline'`, `img-src data:`,
  `connect-src 'none'`, `object-src 'none'`, `base-uri 'none'` and
  `form-action 'none'`. The page cannot make a request even if it tried
  (`repo://libs/evidence-visualization/src/render/workbenchRenderer.ts#L55-L72`).

Assets that themselves contain `</script` or `</style` are rejected, so a
presentation asset cannot break out of its element
(`repo://libs/evidence-visualization/src/render/workbenchRenderer.ts#L79-L91`).

The first line of every page is `<!-- evidence-object-workbench -->`. That marker
is the publisher's proof of ownership.

## Assets come from the install, not the project

`loadWorkbenchAssets` reads four files and joins the two scripts. A missing asset
is an error, because a page without its graph renderer loads blank and looks like a
broken model.

`resolveAssetsDirectory` chooses, in order: an explicit `assetsDirectory`, the
directory under `process.resourcesPath` (a packaged Electron app), then the
directory beside the package's own module. There is no search up the tree and no
project-local lookup; the assets belong to the install
(`repo://libs/evidence-visualization/src/render/workbenchAssets.ts#L10-L30`,
`repo://libs/evidence-visualization/src/render/workbenchAssets.ts#L62-L105`).

The desktop duplicates this policy in `installAssets.ts` so a development run can
read either `resources/assets` or the workspace package, while a packaged install
reads only the unpacked copy.

## Publishing refuses to clobber

`publishRefusal` is the ownership check
(`repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts#L33-L58`):

- a symbolic link is refused;
- an existing file that does not start with `WORKBENCH_MARKER` is refused;
- a missing target is fine.

`publishWorkbench` then writes a `.workbench-<uuid>.html` temporary beside the
target and renames it into place. The rename keeps the write on one filesystem and
gives a reader either the old page or the new one, never half a page; a failure
removes the temporary
(`repo://libs/evidence-visualization/src/publish/workbenchPublisher.ts#L64-L88`).

This is why a failed generation is uneventful: the previous snapshot stays, the
directory keeps its contents, and the next attempt starts from the same inputs.

## CLI behaviour

The command has one verb:

```bash
npx evidence-workbench generate --project-root "$PWD" [--out FILE] [--scope CONTEXT]... [--require-api] [--assets DIR]
```

Defaults: output `.evidence/views/index.html`; scopes omitted means consistency
only; `--require-api` turns a missing design into a refusal instead of a
model-only page.

Exit `0` when the page was written, `1` when it was not, with the reason on stderr.
The success payload is a stable summary — `output`, `counts`, `validation` — so a
script can read it without parsing HTML
(`repo://libs/evidence-visualization/src/cli.ts#L80-L130`).

## Failure behaviour

| Situation | Result |
| --- | --- |
| FM check invalid or input changed | `FM 未通过，不生成视图`; no page (`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L290-L310`) |
| API design exists, no scope | refusal; consistency is not scope completeness (`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L266-L276`) |
| `--require-api` without a design | refusal instead of a degraded page |
| digest in projection differs from check | `FM 在投影期间变化` (`repo://libs/evidence-visualization/src/generate/collectWorkbench.ts#L332-L343`) |
| input changed during collection | `输入在生成期间变化，保留已有视图` |
| input changed during rendering | `发布前输入变化，保留已有视图`; previous page untouched (`repo://libs/evidence-visualization/src/generate/generateWorkbench.spec.ts#L198-L222`) |
| target is a foreign file or symlink | publisher refuses; nothing overwritten |
| asset missing | named `WorkbenchAssetError`, page not written |
| template with zero or many inline scripts | `工作台只允许一个内联脚本` |

## Tests that protect this contract

- `generateWorkbench.spec.ts` fixes the fingerprint's exclusions and symlink
  refusal, the "model does not check" stop, the API/scope refusals, mid-generation
  change detection, atomic write, and refusal to overwrite a foreign file
  (`repo://libs/evidence-visualization/src/generate/generateWorkbench.spec.ts#L41-L235`).
- `workbenchProjection.spec.ts` covers context nesting without claimed ownership,
  labelled relationship edges, rule/derivation wiring, the privacy assertion,
  dangling references, duplicate ids, counterexamples and the embedded check
  verdict.
- `workbenchRenderer.spec.ts` asserts payload escaping, one-script enforcement,
  the exact CSP hash, refusal of tag-closing assets, and atomic replacement without
  a leftover temporary
  (`repo://libs/evidence-visualization/src/render/workbenchRenderer.spec.ts#L56-L175`).
- `tests/node/business-graph.test.mjs` executes the shipped graph script in a VM
  sandbox, so the page's rendering logic is tested as the browser would run it.

## Related pages

- [API contract projection](./api-projection.md) — the input this page renders.
- [Desktop app shell and IPC surface](../desktop/app-shell.md) — the export action
  and asset resolution.
- [Workspace, build and packaging](../operations/build-and-package.md) — how the
  four assets reach a packaged install.
- [Sensors, stage gate and the dependency frontier](../agents/sensor-orchestration.md) —
  what "checked" means here.
