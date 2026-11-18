# Evidence governance CI integration

The checked-in GitHub workflow (`../../.github/workflows/evidence-governance.yml`)
is a runnable four-language reference, not pseudocode. Each matrix job installs
only its selected language environment, runs native tests/build, proves the fixed
red/green demonstrations, then independently executes strict regression and DoD
against the downloaded Git baseline. `fail-fast: false` keeps the other jobs'
evidence when one implementation fails. The adjacent GitLab template remains a
Node/Fastify-only reference that can be included in `.gitlab-ci.yml`; it does not
provision four language images. Both use Node 22 + the repository-pinned pnpm,
build the actual CLI, and use the Bruno CLI pinned by the workspace lockfile (no
global `bru` or Bruno Desktop is required). They run three independent checks:

1. Model validity and **read-only, byte-exact** verification of the committed
   OpenAPI contract and Bruno collection, including `evidence-acceptance.json`.
2. A pinned `oasdiff` comparison against an **immutable Git baseline**; breaking
   changes and tool errors fail the job. No `|| true` around baseline extraction.
3. Isolated strict regression and DoD backend runs, with JSON/Markdown/JUnit
   artifacts collected on failure as well as success.

## Adapt to another backend

- The B2B orchestrator (`make -C examples/b2b-escrow ...`) is an external observer,
  never an implementation dependency. `prepare IMPLEMENTATION=...` installs,
  tests and builds only that project; `verify` proves the fixed 11 red/green cases;
  `gate GATE=... BASELINE=/absolute/model.evidence.json` starts a fresh v2/no-fault process
  for one strict gate. `REPORT_DIR` must be a new directory. On GitLab, a custom
  language matrix needs runners/images containing Node/pnpm/Make plus the selected
  language; call those same targets in each row. The supplied GitLab jobs only
  require the Node image and run Fastify native tests before each strict gate.
- For a different application, change `MODEL`, `GENERATED`, and the backend
  preparation/startup/readiness commands. The Makefile and Node verifier are
  specifically for B2B escrow: replace those calls (including GitHub's scoped
  `check`) rather than assuming changing environment variables retargets them.
  Default paths demonstrate B2B escrow v1 plus optional v2 milestone flows.
  Do not use a build-cache directory as a committed artifact source. Export to a
  dedicated generated directory and commit it together with the model.
- Keep `fetch-depth: 0` / `GIT_DEPTH: 0`. Pull requests use the event's base SHA;
  GitLab MRs use `CI_MERGE_REQUEST_DIFF_BASE_SHA`. Pushes use the previous SHA.
  Manual/first builds explicitly use `BOOTSTRAP_MODEL` (the B2B escrow v1
  baseline). For the PR that first introduces `MODEL`, an existing base commit
  without that path also uses the explicitly configured bootstrap path **from
  that commit**, not head. Replace it with your reviewed bootstrap in a new
  project. Bad commits or failed extraction are fatal; no comparison of head
  against itself.
- Regression executes **baseline's original assertions**, including removed or
  changed flows. DoD executes whole new/changed head flows, not isolated new
  steps. Shared prerequisites are replayed. Removed requirements need an explicit
  version/migration policy; do not silently drop failing baseline tests.
- No baseline? Set inline example `test.tags: ["regression"]` or `["dod"]`.
  The labels are part of the generated flow metadata. `evidence test` selects
  whole flows; do not use Bruno's request-level tag filtering for Evidence
  gates. An unmatched gate/filter fails, rather than
  reporting an empty green suite. The sole intentional empty result is DoD
  with an unchanged baseline, explicitly reported as “No incremental flows”.
- Keep `--strict-drift` for merge/release. `--detect-drift` makes schema drift
  advisory, **not** failed business assertions. Drift honors JSON Schema rules:
  maps declared open remain open, closed objects reject unknown fields, nested
  required/type/format/constraint errors are reported with JSON Pointers.
  It inspects observed test responses, not production traffic or all endpoints.

## Local evolution loop

```sh
pnpm nx build cli
pnpm example:setup
pnpm evidence check examples/b2b-escrow/model/b2b-escrow.evidence.json
pnpm evidence diff api examples/b2b-escrow/model/b2b-escrow-v1.evidence.json \
  examples/b2b-escrow/model/b2b-escrow.evidence.json --format markdown
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json \
  --out examples/b2b-escrow/generated
pnpm evidence export --model examples/b2b-escrow/model/b2b-escrow.evidence.json \
  --out examples/b2b-escrow/generated --verify
```

Run `evidence test` against your independently implemented service. Use the
`examples/b2b-escrow/README.md` v1/v2 exercise to reproduce unchanged
regression green / new milestones red / implementation complete green. A business
rule change without an OpenAPI structural change still needs acceptance review;
OpenAPI compatibility alone does not prove business equivalence or dictate SemVer.

For feature work only, `--gate dod --allow-pending` explicitly allows incomplete
business steps to exit zero. Reports **retain `passed: false`** and PENDING; JUnit
still contains failures. Runner infrastructure errors and strict drift remain
fatal. CI never derives policy from branch names. **Strict quality gates** never
use `--allow-pending`, `continue-on-error`, or `allow_failure`. The separate
fixed red/green demonstration intentionally invokes pending and fault cases to
check their semantics; its `expectationMet` summary is not a release verdict.

## Reports and security

`--report-dir reports` writes `<gate>.json`, `<gate>.md`, and `<gate>.xml` from a
**single execution**, even if assertions fail. Do not rerun state-changing suites
just to render another report. Use a dedicated report directory. GitHub publishes
Markdown to `$GITHUB_STEP_SUMMARY`; GitLab exposes artifacts and native JUnit MR
results. For the B2B orchestrator, reports are nested under
`REPORT_DIR/<implementation>/<scenario>/<gate>.{json,md,xml}`; the GitLab JUnit
pattern includes only strict gate reports. GitHub also uploads the red/green
demonstration reports, whose intentional failures **must not** be counted as
release failures or successes: evaluate their `summary.json` expectation checks
separately. Each implementation has a distinct artifact name and retains native
build/test output as well as per-process logs. No broad write token or
`pull_request_target` is needed; publishing an actual PR/MR comment can be layered
on in a separately trusted job consuming the Markdown artifact. Code Quality
reports are intentionally not fabricated: runtime response drift has no reliable
source-file/line mapping.

Each gate starts its own SUT, waits for an actual HTTP response (404/405 are valid
reachability signals), and traps process cleanup. For containerized or hosted
SUTs replace this with your orchestrator's equivalent and isolate each test run's
data. Use test-only injected business clocks; never enable user-controlled clock
or role headers in production. Network failures, missing tools, invalid baselines,
and invalid suites are errors, not pending business work.

Generated tests are an executable set of reviewed acceptance examples, **not a
proof of all possible business behavior**. Keep independent expected examples,
negative cases, and language-specific unit/integration tests as well.
