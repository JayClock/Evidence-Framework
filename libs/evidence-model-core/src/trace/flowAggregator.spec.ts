import { readFileSync } from 'node:fs';
import {
  compactCanonicalJson,
  createEmptyDomainModel,
  DomainModelDocumentSchema,
  type DomainModelDocument,
  type EntityAST,
  type EvidenceEntityAST,
  type ExampleTestAST,
  type ModelExampleAST,
} from '@evidence-poc/evidence-schema';
import { describe, expect, it } from 'vitest';
import { digestOf } from '../validation/modelDigest.js';
import { buildFmCheckReport } from '../validation/fmCheck.js';
import {
  collectFlowScenarios,
  computeStepHash,
  FlowScenarioError,
} from './flowAggregator.js';
import type { StepFingerprintInput } from './types.js';

const fingerprint = (): StepFingerprintInput => ({
  entityId: 'request.payment',
  entityKind: 'fulfillment_request',
  actingRoleRef: 'role.buyer',
  asOf: '2026-03-31T10:00:00Z',
  basedOn: ['agreement-001'],
  values: { id: 'request-001', amount: 500, details: { currency: 'CNY' } },
  derivedAssertions: { '$.amount': 500 },
});

describe('computeStepHash', () => {
  it('uses the canonical fingerprint wire representation and SHA-256 format', () => {
    const input = fingerprint();
    expect(computeStepHash(input)).toBe(digestOf(compactCanonicalJson(input)));
    expect(computeStepHash(input)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('is independent of object key order, including nested values', () => {
    const input = fingerprint();
    expect(
      computeStepHash({
        derivedAssertions: input.derivedAssertions,
        values: {
          details: { currency: 'CNY' },
          amount: 500,
          id: 'request-001',
        },
        basedOn: input.basedOn,
        asOf: input.asOf,
        actingRoleRef: input.actingRoleRef,
        entityKind: input.entityKind,
        entityId: input.entityId,
      }),
    ).toBe(computeStepHash(input));
  });

  it.each<[keyof StepFingerprintInput, unknown]>([
    ['entityId', 'request.deposit'],
    ['entityKind', 'contract'],
    ['actingRoleRef', 'role.seller'],
    ['asOf', '2026-04-01T10:00:00Z'],
    ['basedOn', ['agreement-002']],
    ['values', { id: 'request-001', amount: 501 }],
    ['derivedAssertions', { '$.amount': 501 }],
  ])('changes when the local %s changes', (key, value) => {
    const input = fingerprint();
    expect(computeStepHash({ ...input, [key]: value })).not.toBe(
      computeStepHash(input),
    );
  });

  it('ignores sequence, labels, gaps and other presentation metadata', () => {
    const input = fingerprint();
    const step = {
      ...input,
      sequence: 7,
      stepHash: 'previous',
      entityLabel: '付款申请',
      contextRef: 'context.procurement',
      responsibleRoleRef: 'role.seller',
      exampleLabel: 'requested',
      gaps: ['request.payment: missing confirmation'],
    };
    expect(computeStepHash(step)).toBe(computeStepHash(input));
  });

  it('treats omitted optional fields as undefined and never mutates inputs', () => {
    const input = Object.freeze({
      ...fingerprint(),
      basedOn: Object.freeze(['agreement-001']),
      values: Object.freeze({ id: 'request-001' }),
    });
    const minimal: StepFingerprintInput = {
      entityId: input.entityId,
      entityKind: input.entityKind,
      asOf: input.asOf,
      basedOn: input.basedOn,
      values: input.values,
    };
    const before = structuredClone(input);
    expect(computeStepHash(minimal)).toBe(
      computeStepHash({ ...minimal, actingRoleRef: undefined }),
    );
    computeStepHash(input);
    expect(input).toEqual(before);
  });
});

const example = (
  label = 'sample',
  test: Partial<ExampleTestAST> = {},
  value: Record<string, unknown> = {},
): ModelExampleAST => ({
  label,
  value,
  test: {
    flow: 'payment',
    actingRoleRef: 'role.buyer',
    asOf: '2026-03-31T10:00:00Z',
    ...test,
  },
});
const entity = (
  id: string,
  examples: ModelExampleAST[] = [example()],
): EvidenceEntityAST => ({
  type: 'entity',
  id,
  category: 'evidence',
  kind: 'other_evidence',
  label: id,
  contextRef: 'context.procurement',
  responsibleRoleRef: 'role.seller',
  examples,
});
const modelWith = (...entities: EntityAST[]) => ({
  ...createEmptyDomainModel(),
  entities,
});
const stepRefs = (entities: EntityAST[]): string[] =>
  collectFlowScenarios(modelWith(...entities))[0].steps.map(
    (step) => `${step.entityId}#${step.exampleLabel}`,
  );

describe('collectFlowScenarios', () => {
  it('returns no scenarios for models without inline test flows', () => {
    expect(collectFlowScenarios(createEmptyDomainModel())).toEqual([]);
    expect(
      collectFlowScenarios(
        modelWith(
          entity('e.empty', []),
          entity('e.plain', [{ label: 'plain', value: {} }]),
        ),
      ),
    ).toEqual([]);
  });

  it('orders by dependencies before business clock and assigns 1-based sequences', () => {
    const model = modelWith(
      entity('e.child', [
        example('sample', {
          basedOn: ['e.parent#sample'],
          asOf: '2026-03-30T10:00:00Z',
        }),
      ]),
      entity('e.parent'),
    );
    const [flow] = collectFlowScenarios(model);
    expect(flow.steps.map((step) => step.entityId)).toEqual([
      'e.parent',
      'e.child',
    ]);
    expect(flow.steps.map((step) => step.sequence)).toEqual([1, 2]);
    expect(flow.traceDigest).toBe(
      digestOf(flow.steps.map((step) => step.stepHash).join('')),
    );
    expect(flow.flowTitle).toBe('payment');
  });

  it('uses actual instants, then canonical refs, to order ready steps', () => {
    expect(
      stepRefs([
        entity('e.later', [
          example('sample', { asOf: '2026-03-31T09:30:00Z' }),
        ]),
        entity('e.offset', [
          example('sample', { asOf: '2026-03-31T10:00:00+01:00' }),
        ]),
        entity('e.equal', [
          example('sample', { asOf: '2026-03-31T09:00:00.000Z' }),
        ]),
      ]),
    ).toEqual(['e.equal#sample', 'e.offset#sample', 'e.later#sample']);
  });

  it('compares newly available steps against all remaining ready steps', () => {
    expect(
      stepRefs([
        entity('e.last', [example('sample', { asOf: '2026-04-02T10:00:00Z' })]),
        entity('e.child', [
          example('sample', {
            asOf: '2026-04-01T10:00:00Z',
            basedOn: ['e.parent#sample'],
          }),
        ]),
        entity('e.parent'),
      ]),
    ).toEqual(['e.parent#sample', 'e.child#sample', 'e.last#sample']);
  });

  it('resolves both id and ref aliases and counts each graph edge only once', () => {
    expect(
      stepRefs([
        entity('e.child', [
          example('sample', {
            basedOn: ['e.parent#sample', 'parent-id', 'parent-ref'],
          }),
        ]),
        entity('e.parent', [
          example('sample', {}, { id: 'parent-id', ref: 'parent-ref' }),
        ]),
      ]),
    ).toEqual(['e.parent#sample', 'e.child#sample']);
  });

  it('prefers canonical refs over colliding instance aliases', () => {
    expect(
      stepRefs([
        entity('e.alias', [example('sample', {}, { id: 'e.parent#sample' })]),
        entity('e.parent'),
        entity('e.child', [
          example('sample', { basedOn: ['e.parent#sample'] }),
        ]),
      ]),
    ).toEqual(['e.alias#sample', 'e.parent#sample', 'e.child#sample']);
  });

  it('sorts flows and deduplicates context and acting/responsible role refs', () => {
    const model = modelWith(
      entity('e.payment'),
      {
        ...entity('e.deposit', [example('sample', { flow: 'deposit' })]),
        contextRef: 'context.z',
        responsibleRoleRef: 'role.buyer',
      },
      {
        ...entity('e.deposit-other', [
          example('sample', { flow: 'deposit', actingRoleRef: 'role.a' }),
        ]),
        contextRef: 'context.a',
      },
    );
    const flows = collectFlowScenarios(model);
    expect(flows.map((flow) => flow.flowId)).toEqual(['deposit', 'payment']);
    expect(flows[0].involvedContextRefs).toEqual(['context.a', 'context.z']);
    expect(flows[0].involvedRoleRefs).toEqual([
      'role.a',
      'role.buyer',
      'role.seller',
    ]);
    expect(flows[1].steps[0].sequence).toBe(1);
  });

  it('allows the same instance alias in separate isolated flows', () => {
    const model = modelWith(
      ...['payment', 'deposit'].flatMap((flow) => [
        entity(`e.${flow}-parent`, [
          example('sample', { flow }, { id: 'shared', ref: 'shared' }),
        ]),
        entity(`e.${flow}-child`, [
          example('sample', { flow, basedOn: ['shared'] }),
        ]),
      ]),
    );
    const flows = collectFlowScenarios(model);
    expect(
      flows.map((flow) => flow.steps.map((step) => step.entityId)),
    ).toEqual([
      ['e.deposit-parent', 'e.deposit-child'],
      ['e.payment-parent', 'e.payment-child'],
    ]);
  });

  it('keeps tests on entities without evidence-specific metadata', () => {
    const model = modelWith({
      type: 'entity',
      id: 'party.buyer',
      label: 'Buyer',
      category: 'participant',
      kind: 'party',
      examples: [example()],
    });
    const [flow] = collectFlowScenarios(model);
    expect(flow.involvedContextRefs).toEqual([]);
    expect(flow.involvedRoleRefs).toEqual(['role.buyer']);
    expect(flow.steps[0].responsibleRoleRef).toBeUndefined();
    expect(flow.steps[0].gaps).toEqual([]);
  });
});

describe('flow graph errors', () => {
  it.each([
    [
      'UNKNOWN_DEPENDENCY',
      [entity('e.child', [example('sample', { basedOn: ['missing'] })])],
    ],
    [
      'AMBIGUOUS_DEPENDENCY',
      [
        entity('e.first', [example('sample', {}, { id: 'shared' })]),
        entity('e.second', [example('sample', {}, { ref: 'shared' })]),
        entity('e.child', [example('sample', { basedOn: ['shared'] })]),
      ],
    ],
    [
      'CROSS_FLOW_DEPENDENCY',
      [
        entity('e.parent', [example('sample', { flow: 'deposit' })]),
        entity('e.child', [
          example('sample', { basedOn: ['e.parent#sample'] }),
        ]),
      ],
    ],
    ['DUPLICATE_EXAMPLE_REF', [entity('e.duplicate', [example(), example()])]],
  ] as const)('reports %s as a structured error', (code, entities) => {
    try {
      collectFlowScenarios(modelWith(...entities));
      expect.fail('Expected an invalid graph to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(FlowScenarioError);
      expect(error).toMatchObject({
        name: 'FlowScenarioError',
        code,
        flowId: 'payment',
      });
      expect((error as FlowScenarioError).exampleRefs.length).toBeGreaterThan(
        0,
      );
      expect((error as Error).message).toContain(code);
    }
  });

  it('identifies actual cycle members, not downstream blocked steps', () => {
    const model = modelWith(
      entity('e.a', [example('sample', { basedOn: ['b'] }, { id: 'a' })]),
      entity('e.b', [example('sample', { basedOn: ['a'] }, { id: 'b' })]),
      entity('e.blocked', [example('sample', { basedOn: ['a'] })]),
    );
    expect(() => collectFlowScenarios(model)).toThrow(
      expect.objectContaining({
        code: 'CYCLIC_DEPENDENCY',
        flowId: 'payment',
        exampleRefs: ['e.a#sample', 'e.b#sample'],
      }),
    );
    expect(() => collectFlowScenarios(model)).toThrow(
      'e.a#sample -> e.b#sample -> e.a#sample',
    );
  });

  it('detects self-dependencies', () => {
    expect(() =>
      collectFlowScenarios(
        modelWith(
          entity('e.self', [example('sample', { basedOn: ['e.self#sample'] })]),
        ),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'CYCLIC_DEPENDENCY',
        exampleRefs: ['e.self#sample'],
      }),
    );
  });
});

const acceptanceModel = (name = 'procurement'): DomainModelDocument =>
  DomainModelDocumentSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../../examples/acceptance/${name}.evidence.json`,
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
const exampleOf = (
  model: DomainModelDocument,
  entityId: string,
  label?: string,
) => {
  const found = model.entities
    .find((item) => item.id === entityId)
    ?.examples?.find((item) => label === undefined || item.label === label);
  if (found === undefined)
    throw new Error(`Missing fixture example: ${entityId}#${label}`);
  return found;
};
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const hashesByRef = (model: DomainModelDocument) =>
  new Map(
    collectFlowScenarios(model).flatMap((flow) =>
      flow.steps.map(
        (step) =>
          [`${step.entityId}#${step.exampleLabel}`, step.stepHash] as const,
      ),
    ),
  );

describe('acceptance-model fact extraction', () => {
  it('extracts the payment chain while retaining the explicitly modeled negative example', () => {
    const model = acceptanceModel();
    const { report } = buildFmCheckReport({ model });
    const flows = collectFlowScenarios(model, report);
    expect(flows).toHaveLength(1);
    const [flow] = flows;
    expect(flow.flowId).toBe('payment');
    expect(
      flow.steps.map((step) => `${step.entityId}#${step.exampleLabel}`),
    ).toEqual([
      'contract.agreement#signed',
      'request.payment#requested',
      'confirmation.payment#bad-input',
      'confirmation.payment#confirmed',
    ]);
    const positive = flow.steps.filter(
      (step) => step.exampleLabel !== 'bad-input',
    );
    expect(positive.map((step) => step.entityId)).toEqual([
      'contract.agreement',
      'request.payment',
      'confirmation.payment',
    ]);
    expect(positive.map((step) => step.asOf)).toEqual(
      Array(3).fill('2026-03-31T10:00:00Z'),
    );
    expect(positive.map((step) => step.basedOn)).toEqual([
      [],
      ['contract.agreement#signed'],
      ['request.payment#requested'],
    ]);
    expect(positive[2]).toMatchObject({
      entityKind: 'fulfillment_confirmation',
      entityLabel: 'payment confirmation',
      contextRef: 'context.procurement',
      actingRoleRef: 'role.buyer',
      responsibleRoleRef: 'role.buyer',
      values: { id: 'confirmation-001', total_amount: 500 },
    });
    expect(flow.steps[2].derivedAssertions).toEqual({
      '$.error': 'INVALID_INPUT',
    });
    expect(flow.involvedContextRefs).toEqual(['context.procurement']);
    expect(flow.involvedRoleRefs).toEqual(['role.buyer', 'role.seller']);
    expect(flow.traceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    for (const step of flow.steps)
      expect(step.stepHash).toBe(computeStepHash(step));
  });

  it('extracts independent deposit and payment flows from the evolved model', () => {
    const flows = collectFlowScenarios(acceptanceModel('procurement-deposit'));
    expect(flows.map((flow) => flow.flowId)).toEqual(['deposit', 'payment']);
    expect(flows[0].steps.map((step) => step.entityId)).toEqual([
      'contract.agreement',
      'request.deposit',
      'confirmation.deposit',
    ]);
    expect(flows[0].steps.map((step) => step.sequence)).toEqual([1, 2, 3]);
    expect(flows[1].steps.map((step) => step.sequence)).toEqual([1, 2, 3, 4]);
    expect(flows[0].traceDigest).not.toBe(flows[1].traceDigest);
  });

  it('is idempotent and independent of entity, example and object-key iteration order', () => {
    const model = acceptanceModel('procurement-deposit');
    const baseline = collectFlowScenarios(model);
    expect(collectFlowScenarios(model)).toEqual(baseline);
    const reordered: DomainModelDocument = JSON.parse(
      JSON.stringify(model, (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    );
    reordered.entities.reverse();
    reordered.relationships.reverse();
    reordered.rules.reverse();
    for (const item of reordered.entities) item.examples?.reverse();
    expect(collectFlowScenarios(reordered)).toEqual(baseline);
  });

  it('changes only the edited step hash, not its descendants or other flows', () => {
    const model = acceptanceModel('procurement-deposit');
    const before = hashesByRef(model);
    const digests = collectFlowScenarios(model).map((flow) => flow.traceDigest);
    exampleOf(model, 'request.payment').value.quantity = 11;
    const after = hashesByRef(model);
    for (const [ref, hash] of before) {
      if (ref === 'request.payment#requested')
        expect(after.get(ref)).not.toBe(hash);
      else expect(after.get(ref)).toBe(hash);
    }
    const changed = collectFlowScenarios(model);
    expect(changed[0].traceDigest).toBe(digests[0]);
    expect(changed[1].traceDigest).not.toBe(digests[1]);
  });

  it('includes declared assertion changes in only that step fingerprint', () => {
    const model = acceptanceModel();
    const before = hashesByRef(model);
    const negative = exampleOf(model, 'confirmation.payment', 'bad-input');
    if (negative.test === undefined) throw new Error('Missing fixture test');
    negative.test.expect = { '$.error': 'DIFFERENT_ERROR' };
    const after = hashesByRef(model);
    for (const [ref, hash] of before) {
      if (ref.endsWith('#bad-input')) expect(after.get(ref)).not.toBe(hash);
      else expect(after.get(ref)).toBe(hash);
    }
  });

  it('does not invalidate existing hashes when inserting a step changes their sequence', () => {
    const model = acceptanceModel();
    const before = collectFlowScenarios(model)[0];
    model.entities.push(
      entity('e.earlier', [
        example('sample', { asOf: '2026-03-30T10:00:00Z' }),
      ]),
    );
    const after = collectFlowScenarios(model)[0];
    expect(after.steps[0].entityId).toBe('e.earlier');
    expect(after.steps.slice(1).map((step) => step.stepHash)).toEqual(
      before.steps.map((step) => step.stepHash),
    );
    expect(after.steps.slice(1).map((step) => step.sequence)).toEqual([
      2, 3, 4, 5,
    ]);
    expect(after.traceDigest).not.toBe(before.traceDigest);
  });
});

describe('trace snapshots and reported gaps', () => {
  it('copies values, assertions and dependency arrays without mutating frozen sources', () => {
    const inputExample = example(
      'sample',
      {
        basedOn: ['e.parent#sample'],
        expect: { '$.detail': { amount: 10 } },
      },
      { detail: { amount: 10 } },
    );
    const model = deepFreeze(
      modelWith(entity('e.parent'), entity('e.child', [inputExample])),
    );
    const before = structuredClone(model);
    const [flow] = collectFlowScenarios(model);
    const step = flow.steps[1];
    expect(model).toEqual(before);
    expect(step.values).not.toBe(inputExample.value);
    expect(step.basedOn).not.toBe(inputExample.test?.basedOn);
    expect(step.derivedAssertions).not.toBe(inputExample.test?.expect);
    (step.values.detail as { amount: number }).amount = 20;
    (step.derivedAssertions?.['$.detail'] as { amount: number }).amount = 20;
    expect(model).toEqual(before);
  });

  it('keeps an existing snapshot and hash consistent when its input model changes later', () => {
    const model = modelWith(
      entity('e.parent', [example('sample', {}, { detail: { amount: 10 } })]),
    );
    const [flow] = collectFlowScenarios(model);
    (exampleOf(model, 'e.parent').value.detail as { amount: number }).amount =
      20;
    expect(flow.steps[0].values).toEqual({ detail: { amount: 10 } });
    expect(flow.steps[0].stepHash).toBe(computeStepHash(flow.steps[0]));
  });

  it('attaches only matching entity, attribute and context gap subjects, sorted and deduplicated', () => {
    const item = entity('request.payment');
    item.attributes = [
      { name: 'amount', label: 'Amount', meaning: 'Payment amount' },
    ];
    const model = modelWith(item);
    const report = deepFreeze({
      gaps: [
        'request.payment.amount: missing valueType',
        'request.payment: missing confirmation',
        'request.payment-extra: unrelated entity',
        'request.payment.other: unrelated subject',
        'context.procurement: missing primary obligation',
        'other.entity: mentions request.payment but is unrelated',
        'unstructured gap',
        'request.payment: missing confirmation',
      ],
    });
    const [flow] = collectFlowScenarios(model, report);
    expect(flow.steps[0].gaps).toEqual([
      'context.procurement: missing primary obligation',
      'request.payment.amount: missing valueType',
      'request.payment: missing confirmation',
    ]);
    const [withoutReport] = collectFlowScenarios(model);
    expect(withoutReport.steps[0].gaps).toEqual([]);
    expect(flow.steps[0].stepHash).toBe(withoutReport.steps[0].stepHash);
    expect(flow.traceDigest).toBe(withoutReport.traceDigest);
  });

  it('handles a wide and a deep graph without losing or duplicating steps', () => {
    const width = 150;
    const wide = Array.from({ length: width }, (_, index) =>
      entity(`e.${String(index).padStart(3, '0')}`),
    );
    const flow = collectFlowScenarios(modelWith(...wide.reverse()))[0];
    expect(flow.steps).toHaveLength(width);
    expect(flow.steps[0].entityId).toBe('e.000');
    expect(flow.steps[width - 1].sequence).toBe(width);
    const depth = 2000;
    const deep = Array.from({ length: depth }, (_, index) =>
      entity(`e.${index}`, [
        example('sample', {
          basedOn: index === 0 ? [] : [`e.${index - 1}#sample`],
        }),
      ]),
    );
    const deepFlow = collectFlowScenarios(modelWith(...deep.reverse()))[0];
    expect(deepFlow.steps).toHaveLength(depth);
    expect(deepFlow.steps[0].entityId).toBe('e.0');
    expect(deepFlow.steps[depth - 1].entityId).toBe(`e.${depth - 1}`);
    exampleOf(modelWith(...deep), 'e.0').test = example('sample', {
      basedOn: [`e.${depth - 1}#sample`],
    }).test;
    expect(() => collectFlowScenarios(modelWith(...deep))).toThrow(
      expect.objectContaining({ code: 'CYCLIC_DEPENDENCY' }),
    );
  });
});
