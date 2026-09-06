# Modeling Skill Evaluations

These evaluations exercise one FM / 8X Flow Schema v3 format across fulfillment, channel, domain, and mixed scopes. Domain modeling is native to 8X Flow; internal KPI agreements and external contracts share the same fulfillment mechanism.

## Coverage

|  ID | Scenario                                  | Main risk                                                                                           |
| --: | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
|   0 | VIP agreement                             | Contract Roles, explicit Fulfillments, Domain Role, no implementation leakage                       |
|   1 | Payment channels                          | Open Evidence Role, no `sourceEvidenceRefs`, no fabricated provider Party                           |
|   2 | Pre-contract channels                     | RFP/Proposal traceability without mixing channel and fulfillment contexts                           |
|   3 | Internal KPI                              | Target–actual spine without invented payment flow or forced Party                                   |
|   4 | Missing Confirmation repair               | Preserve Role/trigger semantics while repairing a broken model                                      |
|   5 | Immutable reversal                        | Cancellation, return, and refund become new Evidence/Fulfillments                                   |
|   6 | Simple glue integration                   | A no-model scope explanation is a successful result, not an endless request for a contract          |
|   7 | Partial confirmations                     | Count/amount completion and CEL                                                                     |
|   8 | Automatic trigger                         | Scheduler acts for a Role and never becomes Participant                                             |
|   9 | CEL only                                  | No assignment DSL or natural-language executable expressions                                        |
|  10 | Explicit Participant binding              | One Customer plays Roles in two contexts; provider remains Role-only                                |
|  11 | Multi-contract content platform           | Three Contracts, nine child Fulfillment Contexts, candidate Business Pattern                        |
|  12 | Attribute lineage and document simulation | CEL-derived key-data lineage, successful/breached scenarios, pending stakeholder review             |
|  13 | Ambiguous narrative                       | Evidence-first discovery Gate; no fabricated confirmed model                                        |
|  14 | Cross-domain business pattern             | Two contracts/domains support reuse without fabricating confirmation                                |
|  15 | Customer domain only                      | Same FM format, Party vs profile Thing, relationships, CEL and lineage, no Contract/Fulfillment     |
|  16 | Channel only                              | RFP/Proposal before any agreement; empty Fulfillment collection is valid                            |
|  17 | KPI negotiated before signing             | Goal negotiation is pre-contract, not an extra target Fulfillment                                   |
|  18 | KPI target change                         | Employee requests / manager decides; progress review retains its own direction                      |
|  19 | CRM composition                           | Domain objects/rules and strict performance Fulfillment coexist; inputs are not completion evidence |

## Key assertions

Every positive generation case checks:

- Schema v3 validation passes;
- `generated/model.json` exactly matches deterministic compilation;
- every existing Fulfillment uses a child Fulfillment Context and declares a Request interval; only scenarios whose scope requires fulfillment assert a nonempty collection;
- Place/Thing stay in Domain Contexts and Contract Contexts are not treated as fulfillment boundaries;
- no `partyAssignments`, `sourceEvidenceRefs`, legacy calculation field, or custom precondition field remains;
- scenario-specific Role, Fulfillment, Evidence, Context, Business Pattern, and CEL semantics are present;
- the dedicated traceability case verifies deterministic lineage and Evidence Instance simulation without fabricating stakeholder confirmation.

The discovery case may stop before creating a model; if it emits one, it must remain `draft` with pending stakeholder review. Pure domain/channel cases forbid invented Contracts and Fulfillments. Business Pattern cases distinguish `candidate`, `supported`, and human-confirmed reuse.

Human review must additionally check: domain identity and relationship meaning, no unsupported lifecycle/execution claims, target approval versus timely reply, and whether a simple tool is genuinely glue rather than an unmodeled domain. Structural assertions are not proof of these judgments.

The cross-context identity cases deliberately distinguish:

```text
source explicitly identifies a player → Participant + plays_role
source only gives a contextual identity → Role only
```

## Running in Evidence

先运行 `npm run evidence:test` 准备隔离 Python 依赖。以下是独立开发评测，不是活动 Evidence 工作流的工件提交入口：不要在活动产品任务中绕过提交工具写业务工件。原始场景保留上游预期，runner 准备提示时替换为本地 `$evidence-modeling`；发现问题由 Evidence Domain Gate 审核，不新增前置访谈 Gate。

Prepare workspaces without invoking an external agent:

```bash
node_modules/.cache/evidence-fm-runtime/bin/python -B \
  .pi/skills/evidence-modeling/evals/run_modeling_evals.py \
  --workspace /tmp/evidence-modeling-evals --prepare-only
```

Run one or more cases with an external agent command template. The template receives `{prompt_file}` and `{output_dir}` placeholders:

```bash
node_modules/.cache/evidence-fm-runtime/bin/python -B \
  .pi/skills/evidence-modeling/evals/run_modeling_evals.py \
  --workspace /tmp/evidence-modeling-evals --only 11,12,13,14 \
  --command-template 'agent-cli --prompt-file {prompt_file} --output {output_dir}'
```

Grade existing outputs:

```bash
node_modules/.cache/evidence-fm-runtime/bin/python -B \
  .pi/skills/evidence-modeling/evals/run_modeling_evals.py \
  --workspace /tmp/evidence-modeling-evals --grade-only
```

The runner never uses a shell to execute the agent command. It tokenizes the command safely, records failures, validates generated models with the same Schema v3 validator, and writes per-case grading plus a benchmark summary.

## Deterministic regression coverage

```bash
node_modules/.cache/evidence-fm-runtime/bin/python -B \
  -m unittest discover -s .pi/skills/evidence-modeling/tests -v
```

`tests/context_samples.py` contains synthetic source-explicit samples, materialized in temporary directories by `test_context_scopes.py` and `test_scope_evals.py`. Tests exercise pure-domain/channel CLI validation, lineage, compiled JSON Schema, mixed-model composition, retained fulfillment errors, KPI role directions, and grader negative cases. Direct evaluation of sample CEL truth tables is a unit test, not the Evidence Instance simulator or a domain state-machine engine.

A fixture run verifies implementation behavior; it is **not** a with-skill/without-skill agent-generation benchmark. Use an external agent command and human review to evaluate generation quality.
