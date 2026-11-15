import {
  compactCanonicalJson,
  createEmptyDomainModel,
  type EntityAST,
  type EvidenceEntityAST,
  type ExampleTestAST,
  type ModelExampleAST,
} from '@evidence-poc/evidence-schema';
import { describe, expect, it } from 'vitest';
import { digestOf } from '../validation/modelDigest.js';
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
