import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Workflow } from '@stepci/runner';
import {
  buildFmCheckReport,
  evaluateRuleOnExample,
  parseModelBundleText,
} from '@evidence-poc/evidence-model-core';
import { parse } from 'yaml';
import { beforeAll, describe, expect, it } from 'vitest';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';
import { renderDeliverables } from './renderDeliverables.js';
import { selectAcceptanceFlows } from './runner/suiteSelection.js';

const root = new URL('../../../examples/b2b-escrow/', import.meta.url);
function load(name: string) {
  const result = parseModelBundleText(
    readFileSync(new URL(`model/${name}.evidence.json`, root), 'utf8'),
  );
  expect(result.issues).toEqual([]);
  return result.document;
}
const baseline = load('b2b-escrow-v1');
const current = load('b2b-escrow');
const projection = projectAcceptanceTests(current);
const options = { openapi: true, tests: true, format: 'stepci' } as const;
let base: Awaited<ReturnType<typeof renderDeliverables>>;
let head: Awaited<ReturnType<typeof renderDeliverables>>;
beforeAll(async () => {
  [base, head] = await Promise.all([
    renderDeliverables(baseline, options),
    renderDeliverables(current, options),
  ]);
});
const names = (workflow: Workflow) =>
  Object.values(workflow.tests).map((flow) => flow.name);

function output(flowId: string, entityRef: string) {
  const step = projection.flows
    .find((flow) => flow.id === flowId)!
    .steps.find(
      (step) => step.route.entityRef === entityRef && step.status === 201,
    )!;
  expect(step).toBeDefined();
  return Object.fromEntries(
    step.route.outputFields.map((field) => [
      field.name,
      step.assertions[`$[${JSON.stringify(field.name)}]`],
    ]),
  );
}

describe('B2B escrow phase-one contract', () => {
  it.each([baseline, current])(
    'is consistent and complete across all four bilateral scopes ($manifest.version)',
    (model) => {
      const { report } = buildFmCheckReport({
        model,
        scopeRefs: model.manifest.entryContextRefs,
      });
      expect(report).toMatchObject({
        consistent: true,
        complete: true,
        valid: true,
        modelValidated: true,
        inputChanged: false,
        errors: [],
        gaps: [],
        humanConfirmation: 'not-asserted-by-machine',
      });
      expect(report.contextRefs).toHaveLength(4);
      expect(report.testExampleCount).toBeGreaterThan(0);
      const parties = model.entities.filter(
        (entity) => entity.category === 'participant',
      );
      expect(parties.map((party) => party.id)).toEqual([
        'party.buyer',
        'party.seller',
        'party.escrow',
      ]);
    },
  );

  it('preserves baseline rules, evidence shapes and examples instead of weakening regression', () => {
    for (const rule of baseline.rules) {
      expect(current.rules.find((item) => item.id === rule.id)).toEqual(rule);
    }
    for (const relationship of baseline.relationships) {
      expect(
        current.relationships.find((item) => item.id === relationship.id),
      ).toEqual(relationship);
    }
    for (const entity of baseline.entities) {
      const target = current.entities.find((item) => item.id === entity.id)!;
      const { examples: prior = [], ...priorShape } = entity;
      const { examples: next = [], ...nextShape } = target;
      expect(nextShape).toEqual(priorShape);
      expect(next).toEqual(expect.arrayContaining(prior));
    }
    const flows = parse(head.files['acceptance.stepci.yml']!) as Workflow;
    const prior = parse(base.files['acceptance.stepci.yml']!) as Workflow;
    expect(
      names(
        selectAcceptanceFlows(flows, { baseline: prior, gate: 'regression' }),
      ),
    ).toEqual(['single-late', 'single-on-time']);
    expect(
      names(selectAcceptanceFlows(flows, { baseline: prior, gate: 'dod' })),
    ).toEqual(['milestone-capped', 'milestone-on-time', 'milestone-precision']);
  });

  it('compiles valid OpenAPI and exactly reproduces the committed artifacts', () => {
    expect(head).toMatchObject({
      endpointCount: 47,
      flowCount: 5,
      stepCount: 121,
    });
    expect(base).toMatchObject({ flowCount: 2, stepCount: 46 });
    expect(
      readdirSync(fileURLToPath(new URL('generated/', root))).sort(),
    ).toEqual(Object.keys(head.files).sort());
    for (const [name, content] of Object.entries(head.files)) {
      expect(readFileSync(new URL(`generated/${name}`, root), 'utf8')).toBe(
        content,
      );
    }
  });

  it.each([
    ['single-on-time', 'confirmation.release', 1466402, 73320, 0, 1393082],
    ['single-late', 'confirmation.release', 1354870, 67744, 203231, 1083895],
    [
      'milestone-on-time',
      'confirmation.milestone-release',
      1354870,
      67744,
      0,
      1287126,
    ],
    [
      'milestone-capped',
      'confirmation.milestone-release',
      1356225,
      67811,
      1288414,
      0,
    ],
    [
      'milestone-precision',
      'confirmation.milestone-release',
      '22600000000000002',
      1130000000000000,
      226000000000000,
      '21244000000000002',
    ],
  ])(
    'derives exact rounded/capped ledger amounts for %s',
    (flow, entity, gross, reserve, penalty, payout) => {
      const result = output(String(flow), String(entity));
      expect(result).toMatchObject({
        gross_amount_minor: gross,
        retention_minor: reserve,
        late_penalty_minor: penalty,
        payout_minor: payout,
      });
      expect(BigInt(String(gross))).toBe(
        BigInt(String(reserve)) +
          BigInt(String(penalty)) +
          BigInt(String(payout)),
      );
    },
  );

  it('covers the tier boundary, exact deadline, partial-day penalty and two-delivery aggregation', () => {
    expect(output('single-on-time', 'confirmation.order')).toMatchObject({
      quantity: 999,
      subtotal_minor: 1297701,
    });
    expect(output('milestone-on-time', 'confirmation.order')).toMatchObject({
      quantity: 1000,
      subtotal_minor: 1199000,
    });
    expect(output('single-on-time', 'confirmation.acceptance')).toMatchObject({
      accepted_quantity: 999,
      late_days: 0,
    });
    expect(output('single-late', 'confirmation.acceptance')).toMatchObject({
      late_days: 15,
    });
    expect(
      output('milestone-precision', 'confirmation.milestone-acceptance'),
    ).toMatchObject({ accepted_quantity: 2, late_days: 1 });
    expect(
      output('milestone-on-time', 'confirmation.first-milestone'),
    ).toMatchObject({ delivered_quantity: 500 });
    expect(
      output('milestone-on-time', 'confirmation.final-milestone'),
    ).toMatchObject({ delivered_quantity: 500 });
  });

  it('sends only caller fields and tests financial forgery, backdating and duplicate release separately', () => {
    for (const flow of projection.flows) {
      const releaseSteps = flow.steps.filter(
        (step) =>
          step.route.entityRef === 'confirmation.release' ||
          step.route.entityRef === 'confirmation.milestone-release',
      );
      expect(releaseSteps.map((step) => step.status)).toEqual([
        422, 422, 201, 409,
      ]);
      expect(releaseSteps[0]!.inputs).toHaveProperty('payout_minor', 999999);
      expect(releaseSteps[0]!.inputs).not.toHaveProperty('confirmed_at');
      expect(releaseSteps[1]!.inputs).toHaveProperty(
        'confirmed_at',
        '2000-01-01T00:00:00Z',
      );
      expect(releaseSteps[1]!.inputs).not.toHaveProperty('payout_minor');
      for (const step of flow.steps.filter((step) => step.status === 201)) {
        for (const field of [...step.route.derived, ...step.route.stamped]) {
          expect(step.inputs).not.toHaveProperty(field.name);
        }
        expect(Object.keys(step.parameters)).toHaveLength(
          [...step.route.path.matchAll(/\{[^{}]+\}/g)].length,
        );
      }
      const settlement = flow.steps.find(
        (step) => step.route.entityRef === 'contract.settlement',
      )!;
      expect(settlement.inputs).toMatchObject({
        order_confirmation_id: `${flow.id}-confirmation-order`,
        deposit_confirmation_id: `${flow.id}-confirmation-deposit-lock`,
        acceptance_confirmation_id: `${flow.id}-confirmation-${flow.id.startsWith('single-') ? 'acceptance' : 'milestone-acceptance'}`,
      });
    }
  });

  it('fails compilation when an asserted amount is forged instead of trusting its own expected answer', () => {
    const model = structuredClone(current);
    model.entities.find(
      (entity) => entity.id === 'confirmation.order',
    )!.examples![0]!.value.gross_amount_minor = 1;
    expect(() => projectAcceptanceTests(model)).toThrow(
      /disagrees with rule.gross/,
    );
  });

  it('declares evaluable constraints without claiming the HTTP runner enforces undeclared scenarios', () => {
    const rule = current.rules.find(
      (rule) => rule.id === 'rule.complete-milestones',
    )!;
    const bindings = {
      order: { quantity: 1000 },
      first: { delivered_quantity: 400 },
      final: { delivered_quantity: 600 },
      acceptance: { accepted: true, accepted_quantity: 1000 },
    };
    expect(
      evaluateRuleOnExample(current, rule, {
        asOf: '2026-06-15T00:00:00Z',
        bindings,
      }),
    ).toBe(true);
    bindings.final.delivered_quantity = 599;
    expect(
      evaluateRuleOnExample(current, rule, {
        asOf: '2026-06-15T00:00:00Z',
        bindings,
      }),
    ).toBe(false);
  });
});
