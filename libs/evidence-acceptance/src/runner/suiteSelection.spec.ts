import { expect, it } from 'vitest';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';
import { projectAcceptanceTests } from '../delivery/scenarioProjector.js';
import { fingerprintFlow, selectAcceptanceFlows } from './suiteSelection.js';

const fixture = () => projectAcceptanceTests(createAcceptanceModel());

it('runs the baseline for regression and selects only complete changed/new current flows for DoD', () => {
  const baseline = fixture();
  baseline.modelId = 'baseline';
  const current = structuredClone(baseline);
  current.modelId = 'current';
  current.flows[0]!.steps[0]!.status = 202;
  current.flows.push({ ...structuredClone(current.flows[0]!), id: 'new' });
  const regression = selectAcceptanceFlows(current, {
    baseline,
    gate: 'regression',
  });
  expect(regression).toEqual(baseline);
  expect(regression.flows[0]!.steps).not.toBe(baseline.flows[0]!.steps);
  expect(selectAcceptanceFlows(current, { baseline, gate: 'dod' })).toEqual(
    current,
  );
  expect(
    selectAcceptanceFlows(baseline, { baseline, gate: 'dod' }).flows,
  ).toEqual([]);
  expect(() =>
    selectAcceptanceFlows(baseline, {
      baseline,
      gate: 'dod',
      filter: 'missing',
    }),
  ).toThrow('No acceptance flows');
});

it('applies substring/glob, all tags and tag-only gates without dropping upstream steps', () => {
  const projection = fixture();
  const flow = projection.flows[0]!;
  flow.id = 'deposit-new';
  flow.tags = ['payment', 'regression'];
  const extra = {
    ...structuredClone(flow),
    id: 'deposit-old',
    tags: ['payment', 'dod'],
  };
  projection.flows.push(extra);
  expect(
    selectAcceptanceFlows(projection, {
      filter: 'deposit-n?w',
      tags: ['payment', 'flow:deposit-new'],
    }).flows,
  ).toEqual([flow]);
  expect(
    selectAcceptanceFlows(projection, { filter: 'posi', gate: 'dod' }).flows,
  ).toEqual([extra]);
  expect(
    selectAcceptanceFlows(projection, { gate: 'regression' }).flows,
  ).toEqual([flow]);
  expect(() =>
    selectAcceptanceFlows(projection, { tags: ['unknown'] }),
  ).toThrow('No acceptance flows');
  expect(() =>
    selectAcceptanceFlows({ ...projection, flows: [flow, flow] }, {}),
  ).toThrow('duplicate flow');
});

it('ignores mapping ordinals and documentation, but detects a changed capture producer or path', () => {
  const baseline = fixture().flows[0]!;
  const changed = structuredClone(baseline);
  changed.id = 'for a different report';
  changed.tags = ['dod'];
  const [first, producer, consumer] = changed.steps;
  const [variable, path] = Object.entries(producer!.captures)[0]!;
  producer!.ref = 'a different label';
  producer!.captures = { renumbered: path };
  consumer!.parameters = Object.fromEntries(
    Object.entries(consumer!.parameters).map(([parameter, name]) => [
      parameter,
      name === variable ? 'renumbered' : name,
    ]),
  );
  first!.responseSchema = {
    ...first!.responseSchema,
    description: 'docs',
    'x-author': 'docs',
  };
  expect(fingerprintFlow(changed)).toBe(fingerprintFlow(baseline));
  producer!.captures.renumbered = '$.newId';
  expect(fingerprintFlow(changed)).not.toBe(fingerprintFlow(baseline));
  first!.captures.renumbered = path;
  delete producer!.captures.renumbered;
  expect(fingerprintFlow(changed)).not.toBe(fingerprintFlow(baseline));
});

it('treats clocks, roles, statuses, route templates, inputs and typed assertions as executable semantics', () => {
  const baseline = fixture().flows[0]!;
  const original = fingerprintFlow(baseline);
  const step = baseline.steps[0]!;
  const compare = (change: Partial<typeof step>) => {
    expect(
      fingerprintFlow({
        ...baseline,
        steps: [{ ...step, ...change }, ...baseline.steps.slice(1)],
      }),
    ).not.toBe(original);
  };
  compare({ asOf: '2026-07-01T12:00:00Z' });
  compare({ actingRoleRef: 'role.changed' });
  compare({ status: 400 });
  compare({ route: { ...step.route, path: '/other' } });
  compare({ inputs: { ...step.inputs, amount: '500' } });
  compare({ assertions: { ...step.assertions, '$.someValue': null } });
});

it('strips only schema-node annotations, not business property names and const data', () => {
  const prior = fixture();
  const first = prior.flows[0]!.steps[0]!;
  first.responseSchema = {
    properties: {
      description: { type: 'string', description: 'annotation' },
      default: { const: { description: 'business data' } },
    },
  };
  const head = structuredClone(prior);
  head.flows[0]!.steps[0]!.responseSchema = {
    properties: {
      default: { const: { description: 'business data' } },
      description: { type: 'string', title: 'new docs' },
    },
  };
  expect(
    selectAcceptanceFlows(head, { baseline: prior, gate: 'dod' }).flows,
  ).toEqual([]);
  head.flows[0]!.steps[0]!.responseSchema = {
    properties: {
      default: { const: { description: 'changed' } },
      description: { type: 'string' },
    },
  };
  expect(
    selectAcceptanceFlows(head, { baseline: prior, gate: 'dod' }).flows,
  ).toEqual(head.flows);
});
