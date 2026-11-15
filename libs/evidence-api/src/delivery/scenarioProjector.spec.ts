import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { projectAcceptanceTests } from './scenarioProjector.js';
import { renderStepCi } from '../renderer/stepCiRenderer.js';
import { renderHurl } from '../renderer/hurlRenderer.js';
import {
  createAcceptanceModel,
  EXAMPLE_AS_OF,
} from '../../tests/support/acceptance.js';

const getExample = (
  model: ReturnType<typeof createAcceptanceModel>,
  entity = 'confirmation.payment',
) => model.entities.find((item) => item.id === entity)!.examples![0]!;

describe('direct inline-example acceptance projection', () => {
  it('orders causality, derives assertions and captures modeled IDs without mutating inputs', () => {
    const model = createAcceptanceModel(),
      before = structuredClone(model);
    const projection = projectAcceptanceTests(model);
    const steps = projection.flows[0]!.steps;
    expect(steps.map((step) => step.route.purpose)).toEqual([
      'sign',
      'request',
      'confirm',
    ]);
    expect(steps[2]!.assertions['$["total_amount"]']).toBe(500);
    expect(steps[2]!.inputs).not.toHaveProperty('total_amount');
    expect(steps[2]!.inputs).not.toHaveProperty('confirmed_at');
    expect(Object.values(steps[1]!.captures)).toContain('$.id');
    expect(steps[2]!.parameters.requestId).toBeDefined();
    expect(model).toEqual(before);
    expect(projectAcceptanceTests(model)).toEqual(projection);
  });
  it('emits native Step CI liquid syntax, JSONPath checks and isolated Hurl documents', () => {
    const projection = projectAcceptanceTests(createAcceptanceModel());
    const yaml = renderStepCi(projection);
    const workflow = parse(yaml);
    const steps = workflow.tests.flow_1.steps;
    expect(yaml).not.toContain('${{');
    expect(steps[2].http.url).toContain('{{captures.');
    expect(steps[2].http.headers['x-evidence-asof']).toBe(EXAMPLE_AS_OF);
    expect(steps[2].http.check.jsonpath['$["total_amount"]']).toBe(500);
    const hurl = renderHurl(projection)['flow-001.hurl']!;
    expect(hurl).toContain('[Captures]');
    expect(hurl).toContain('== 500');
    expect(hurl).not.toContain('fulfillmentStatus');
  });
  it('generates only explicitly modeled negative cases, without polluting OpenAPI facts', () => {
    const model = createAcceptanceModel();
    const entity = model.entities.find(
      (item) => item.id === 'confirmation.payment',
    )!;
    entity.examples!.push({
      ...structuredClone(entity.examples![0]!),
      label: 'bad',
      test: {
        ...entity.examples![0]!.test!,
        expectedStatus: 422,
        inputs: { total_amount: 1 },
        expect: { '$.error': 'INVALID_INPUT' },
      },
    });
    const steps = projectAcceptanceTests(model).flows[0]!.steps;
    const bad = steps.find((step) => step.ref.endsWith('#bad'))!;
    expect(bad.status).toBe(422);
    expect(bad.inputs).toEqual({ total_amount: 1 });
    expect(bad.assertions).toEqual({ '$.error': 'INVALID_INPUT' });
  });
  it('does not turn documentation-only examples into executable tests', () => {
    const model = createAcceptanceModel();
    for (const entity of model.entities)
      for (const example of entity.examples ?? [])
        Object.assign(example, { test: undefined });
    expect(() => projectAcceptanceTests(model)).toThrow(
      'no examples with test metadata',
    );
  });
  it.each([
    [
      'missing dependency',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).test!, {
          basedOn: ['request.missing#none'],
        }),
      'unknown example',
    ],
    [
      'cycle',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model, 'contract.agreement').test!, {
          basedOn: ['confirmation.payment#confirmed'],
        }),
      'cyclic',
    ],
    [
      'cross-flow',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).test!, { flow: 'other' }),
      'cross-flow',
    ],
    [
      'wrong role',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).test!, {
          actingRoleRef: 'role.seller',
        }),
      'cannot call',
    ],
    [
      'unmodeled status',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).test!, { expectedStatus: 400 }),
      'not declared',
    ],
    [
      'oracle mismatch',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).value, { total_amount: 501 }),
      'disagrees',
    ],
    [
      'time travel',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).test!, {
          asOf: '2020-01-01T00:00:00Z',
        }),
      'clock',
    ],
    [
      'missing path binding',
      (model: ReturnType<typeof createAcceptanceModel>) =>
        Object.assign(getExample(model).test!, { basedOn: [] }),
      'requires one example',
    ],
    [
      'invalid raw input',
      (model: ReturnType<typeof createAcceptanceModel>) => {
        delete getExample(model, 'request.payment').value.quantity;
      },
      'missing required input',
    ],
  ])('fails closed for %s', (_name, mutate, message) => {
    const model = createAcceptanceModel();
    mutate(model);
    expect(() => projectAcceptanceTests(model)).toThrow(message);
  });
  it('refuses ambiguous rule bindings', () => {
    const model = createAcceptanceModel();
    const request = model.entities.find(
      (item) => item.id === 'request.payment',
    )!;
    request.examples!.push({
      ...structuredClone(request.examples![0]!),
      label: 'another',
    });
    Object.assign(getExample(model).test!, {
      basedOn: ['request.payment#requested', 'request.payment#another'],
    });
    expect(() => projectAcceptanceTests(model)).toThrow('found 2');
  });
  it('supports an explicit JSONPath capture for nonstandard IDs', () => {
    const model = createAcceptanceModel();
    Object.assign(getExample(model).test!, {
      pathParameters: {
        requestId: {
          exampleRef: 'request.payment#requested',
          jsonpath: '$.reference',
        },
      },
    });
    const steps = projectAcceptanceTests(model).flows[0]!.steps;
    expect(Object.values(steps[1]!.captures)).toContain('$.reference');
  });
  it('does not support complex Hurl equality silently', () => {
    const projection = projectAcceptanceTests(createAcceptanceModel());
    projection.flows[0]!.steps[0]!.assertions['$.object'] = { nested: 1 };
    expect(() => renderHurl(projection)).toThrow('HURL_UNSUPPORTED');
  });
});
