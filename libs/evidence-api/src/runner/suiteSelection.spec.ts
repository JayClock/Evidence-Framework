import type { Workflow } from '@stepci/runner';
import { expect, it } from 'vitest';
import { selectAcceptanceFlows } from './suiteSelection.js';
const flow = (name: string, amount = 500) => ({
  name,
  env: { evidenceTags: '["regression","payment"]' },
  steps: [
    {
      name: 'create',
      http: {
        url: '${{env.host}}/pay',
        method: 'POST',
        check: { status: 201, jsonpath: { '$.amount': amount } },
      },
    },
  ],
});
const suite = (tests: Workflow['tests']): Workflow => ({
  version: '1.1',
  name: 'suite',
  tests,
});

it('runs the unchanged baseline for regression, and changed/new complete flows for DoD', () => {
  const baseline = suite({ old: flow('payment') });
  const head = suite({ renamed: flow('payment', 600), extra: flow('deposit') });
  expect(
    selectAcceptanceFlows(head, { gate: 'regression', baseline }).tests,
  ).toEqual(baseline.tests);
  expect(
    Object.keys(selectAcceptanceFlows(head, { gate: 'dod', baseline }).tests),
  ).toEqual(['renamed', 'extra']);
  expect(
    selectAcceptanceFlows(suite({}), { gate: 'regression', baseline }).tests,
  ).toEqual(baseline.tests);
  expect(
    selectAcceptanceFlows(baseline, { gate: 'dod', baseline }).tests,
  ).toEqual({});
  expect(baseline.tests.old!.steps[0]!.http!.check!.jsonpath).toEqual({
    '$.amount': 500,
  });
});
it('filters by full flow name and native env tags, failing closed on empty selection', () => {
  const current = suite({ a: flow('payment'), b: flow('deposit-new') });
  expect(
    Object.keys(selectAcceptanceFlows(current, { filter: 'deposit*' }).tests),
  ).toEqual(['b']);
  expect(
    Object.keys(
      selectAcceptanceFlows(current, { filter: 'posit', tags: ['payment'] })
        .tests,
    ),
  ).toEqual(['b']);
  expect(
    Object.keys(selectAcceptanceFlows(current, { gate: 'regression' }).tests),
  ).toHaveLength(2);
  expect(() => selectAcceptanceFlows(current, { gate: 'dod' })).toThrow(
    'No acceptance flows',
  );
  expect(() => selectAcceptanceFlows(current, { filter: 'nothing' })).toThrow(
    'No acceptance flows',
  );
  expect(() =>
    selectAcceptanceFlows(suite({ a: flow('same'), b: flow('same') }), {}),
  ).toThrow('duplicate');
});
it('ignores schema annotations without ignoring properties named description or schema', () => {
  const baseline = suite({ a: flow('payment') });
  baseline.tests.a!.steps[0]!.http!.check!.schema = {
    type: 'object',
    properties: { description: { type: 'string' } },
    examples: [{ description: 'a' }],
  };
  const head = structuredClone(baseline);
  head.tests.a!.steps[0]!.http!.check!.schema = {
    type: 'object',
    properties: { description: { type: 'string', description: 'annotation' } },
    examples: [{ description: 'b' }],
  };
  expect(selectAcceptanceFlows(head, { gate: 'dod', baseline }).tests).toEqual(
    {},
  );
  head.tests.a!.steps[0]!.http!.check!.schema = {
    type: 'object',
    properties: { description: { type: 'number' } },
  };
  expect(
    Object.keys(selectAcceptanceFlows(head, { gate: 'dod', baseline }).tests),
  ).toEqual(['a']);
});

it('ignores generated capture and clock ordinals, but detects changed clocks', () => {
  const baseline = suite({
    a: {
      name: 'flow',
      steps: [
        {
          name: 'request',
          http: {
            url: '${{env.host}}',
            captures: { capture_1: { jsonpath: '$.id' } },
          },
        },
        {
          name: 'confirm',
          http: {
            url: '${{env.host}}/${{captures.capture_1}}',
            headers: { clock: '${{env.asOf}}' },
          },
        },
      ],
    },
  });
  baseline.env = { asOf: '2026-01-01T00:00:00Z' };
  const head = JSON.parse(
    JSON.stringify(baseline)
      .replaceAll('capture_1', 'capture_7')
      .replaceAll('asOf', 'asOf_2'),
  ) as Workflow;
  expect(selectAcceptanceFlows(head, { gate: 'dod', baseline }).tests).toEqual(
    {},
  );
  head.env!.asOf_2 = '2026-02-01T00:00:00Z';
  expect(
    Object.keys(selectAcceptanceFlows(head, { gate: 'dod', baseline }).tests),
  ).toEqual(['a']);
});
