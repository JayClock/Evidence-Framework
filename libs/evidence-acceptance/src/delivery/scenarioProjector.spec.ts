import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { projectAcceptanceTests } from './scenarioProjector.js';
import { renderStepCi } from '../renderer/stepCiRenderer.js';
import { renderHurl } from '../renderer/hurlRenderer.js';
import {
  createAcceptanceModel,
  EXAMPLE_AS_OF,
} from '@evidence-poc/evidence-api/testing';

const getExample = (
  model: ReturnType<typeof createAcceptanceModel>,
  entity = 'confirmation.payment',
) => model.entities.find((item) => item.id === entity)!.examples![0]!;

describe('direct inline-example acceptance projection', () => {
  it('carries optional model tags through standard Step CI test env metadata', () => {
    const model = createAcceptanceModel();
    const entity = model.entities.find(
      (item) => item.id === 'confirmation.payment',
    )!;
    entity.examples![0] = {
      ...entity.examples![0]!,
      test: { ...entity.examples![0]!.test!, tags: ['dod', 'payment'] },
    };
    const projection = projectAcceptanceTests(model);
    expect(projection.flows[0]?.tags).toEqual(['dod', 'payment']);
    const workflow = parse(renderStepCi(projection));
    expect(JSON.parse(workflow.tests.flow_1.env.evidenceTags)).toEqual([
      `flow:${projection.flows[0]!.id}`,
      'dod',
      'payment',
    ]);
  });
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
    expect(steps[2]!.parameters.paymentId).toBeDefined();
    expect(model).toEqual(before);
    expect(projectAcceptanceTests(model)).toEqual(projection);
  });
  it('emits native Step CI liquid syntax, JSONPath checks and isolated Hurl documents', () => {
    const projection = projectAcceptanceTests(createAcceptanceModel());
    const yaml = renderStepCi(projection);
    const workflow = parse(yaml);
    const steps = workflow.tests.flow_1.steps;
    expect(yaml).toContain('${{env.host}}');
    expect(steps[2].http.url).toContain('${{captures.');
    expect(steps[2].http.headers['x-evidence-asof']).toBe('${{env.asOf}}');
    expect(parse(yaml).env.asOf).toBe(EXAMPLE_AS_OF);
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
        paymentId: {
          exampleRef: 'request.payment#requested',
          jsonpath: '$.reference',
        },
      },
    });
    const steps = projectAcceptanceTests(model).flows[0]!.steps;
    expect(Object.values(steps[1]!.captures)).toContain('$.reference');
  });
  it('refuses template injection in literal example data', () => {
    const projection = projectAcceptanceTests(createAcceptanceModel());
    projection.flows[0]!.steps[0]!.inputs['id'] = '${{env.host}}';
    expect(() => renderStepCi(projection)).toThrow('TEST_TEMPLATE_UNSUPPORTED');
    expect(() => renderHurl(projection)).toThrow('TEST_TEMPLATE_UNSUPPORTED');
  });
  it('keeps independent flows and capture namespaces separate', () => {
    const model = createAcceptanceModel();
    const contract = model.entities.find(
      (entity) => entity.id === 'contract.agreement',
    )!;
    contract.examples!.push({
      ...structuredClone(contract.examples![0]!),
      label: 'independent',
      test: { ...contract.examples![0]!.test!, flow: 'other' },
    });
    const projection = projectAcceptanceTests(model);
    expect(projection.flows.map((flow) => flow.steps.length).sort()).toEqual([
      1, 3,
    ]);
    expect(Object.keys(renderHurl(projection))).toEqual([
      'flow-001.hurl',
      'flow-002.hurl',
    ]);
    expect(Object.keys(parse(renderStepCi(projection)).tests)).toHaveLength(2);
  });
  it('does not support complex Hurl equality silently', () => {
    const projection = projectAcceptanceTests(createAcceptanceModel());
    projection.flows[0]!.steps[0]!.assertions['$.object'] = { nested: 1 };
    expect(() => renderHurl(projection)).toThrow('HURL_UNSUPPORTED');
  });
});

it('selects proposal signing from example causality and captures business-named URI parameters', () => {
  const model = createAcceptanceModel();
  model.relationships.find(
    (edge) =>
      edge.sourceRef === 'proposal.quotation' &&
      edge.targetRef === 'rfp.inquiry',
  )!.sourceCardinality = { min: 0, max: 'many' };
  for (const [entityRef, label, role, parent] of [
    ['rfp.inquiry', 'opened', 'role.buyer', undefined],
    ['proposal.quotation', 'offered', 'role.seller', 'rfp.inquiry#opened'],
  ] as const) {
    model.entities.find((entity) => entity.id === entityRef)!.examples = [
      {
        label,
        value: {
          id: label,
          started_at: EXAMPLE_AS_OF,
          expired_at: '2026-04-01T10:00:00Z',
        },
        test: {
          flow: 'payment',
          asOf: EXAMPLE_AS_OF,
          actingRoleRef: role,
          ...(parent === undefined ? {} : { basedOn: [parent] }),
        },
      },
    ];
  }
  getExample(model, 'contract.agreement').test!.basedOn = [
    'proposal.quotation#offered',
  ];
  const projection = projectAcceptanceTests(model);
  const steps = projection.flows[0]!.steps;
  expect(steps.map((step) => step.route.purpose)).toEqual([
    'open',
    'propose',
    'sign',
    'request',
    'confirm',
  ]);
  expect(steps[2]!.route.path).toBe(
    '/inquiries/{inquiryId}/quotations/{quotationId}/agreements',
  );
  expect(Object.keys(steps[2]!.parameters).sort()).toEqual([
    'inquiryId',
    'quotationId',
  ]);
  expect(renderStepCi(projection)).toContain('/quotations/');
  expect(Object.values(renderHurl(projection))[0]).toContain('/quotations/');
});
