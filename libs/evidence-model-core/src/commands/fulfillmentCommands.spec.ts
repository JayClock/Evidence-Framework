import { describe, expect, it } from 'vitest';

import {
  CreateFulfillmentPairCommand,
  ModelCommandError,
  createDomainGraph,
  type CreateFulfillmentPairInput,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const base = () => createProcurementModel();

const expectCode = (work: () => unknown, code: string): void => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelCommandError);
    expect((error as ModelCommandError).code).toBe(code);
    return;
  }

  throw new Error(`expected command to fail with ${code}`);
};

const input = (
  overrides: Partial<CreateFulfillmentPairInput> = {},
): CreateFulfillmentPairInput => ({
  contextRef: 'context.procurement',
  request: {
    id: 'request.delivery',
    label: '发货请求',
    responsibleRoleRef: 'role.seller',
    attributes: [
      {
        name: 'started_at',
        label: '请求时间',
        meaning: '卖方提出发货请求的业务时间',
        valueType: 'timestamp',
        required: true,
        keyData: true,
      },
      {
        name: 'expired_at',
        label: '截止时间',
        meaning: '卖方完成发货的截止时间',
        valueType: 'timestamp',
        required: true,
        keyData: true,
      },
    ],
  },
  confirmation: {
    id: 'confirmation.delivery',
    label: '收货确认',
    responsibleRoleRef: 'role.buyer',
    attributes: [
      {
        name: 'confirmed_at',
        label: '确认时间',
        meaning: '买方形成收货确认的业务时间',
        valueType: 'timestamp',
        required: true,
        keyData: true,
      },
    ],
  },
  contractReferenceId: 'relation.delivery-request-references-contract',
  ...overrides,
});

describe('CreateFulfillmentPairCommand', () => {
  it('creates request, confirmation, references and completion rule', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = new CreateFulfillmentPairCommand(input()).apply(document);

    expect(document).toEqual(snapshot);
    expect(outcome.document.entities.map((entity) => entity.id)).toEqual(
      expect.arrayContaining(['request.delivery', 'confirmation.delivery']),
    );
    expect(
      outcome.document.relationships.map((relation) => relation.id),
    ).toEqual(
      expect.arrayContaining([
        'relation.request.delivery-confirmed-by',
        'relation.delivery-request-references-contract',
      ]),
    );
    expect(outcome.result.rule).toMatchObject({
      kind: 'completion',
      resultType: 'bool',
      contextRef: 'context.procurement',
    });
    expect(outcome.result.rule.target).toBeUndefined();
    expect(outcome.result.reference).toMatchObject({
      sourceRef: 'confirmation.delivery',
      targetRef: 'request.delivery',
    });
    expect(outcome.result.contractReference).toMatchObject({
      sourceRef: 'request.delivery',
      targetRef: 'contract.procurement',
    });
  });

  it('produces a pair the graph can derive', () => {
    const outcome = new CreateFulfillmentPairCommand(input()).apply(base());
    const pair = createDomainGraph(outcome.document).fulfillmentPair(
      'request.delivery',
    );

    expect(pair?.confirmations.map((item) => item.id)).toEqual([
      'confirmation.delivery',
    ]);
    expect(pair?.completionRules.map((rule) => rule.id)).toEqual([
      'rule.request.delivery-completed',
    ]);
  });

  it('undoes the whole pair in one step', () => {
    const document = base();
    const outcome = new CreateFulfillmentPairCommand(input()).apply(document);

    expect(outcome.inverse.apply(outcome.document).document).toEqual(document);
  });

  it('requires a Contract Context', () => {
    expectCode(
      () =>
        new CreateFulfillmentPairCommand(
          input({ contextRef: 'context.catalogue' }),
        ).apply(base()),
      'context.notContract',
    );
  });

  it('requires responsible roles bound by the root Contract', () => {
    expectCode(
      () =>
        new CreateFulfillmentPairCommand(
          input({
            request: {
              ...input().request,
              responsibleRoleRef: 'role.catalogue-item',
            },
          }),
        ).apply(base()),
      'role.notBound',
    );
  });

  it('requires modeled business times', () => {
    expectCode(
      () =>
        new CreateFulfillmentPairCommand(
          input({
            request: {
              ...input().request,
              attributes: input().request.attributes.slice(0, 1),
            },
          }),
        ).apply(base()),
      'attribute.time.missing',
    );
    expectCode(
      () =>
        new CreateFulfillmentPairCommand(
          input({ confirmation: { ...input().confirmation, attributes: [] } }),
        ).apply(base()),
      'attribute.time.missing',
    );
  });

  it('rejects identical request and confirmation ids', () => {
    expectCode(
      () =>
        new CreateFulfillmentPairCommand(
          input({
            confirmation: { ...input().confirmation, id: input().request.id },
          }),
        ).apply(base()),
      'id.duplicate',
    );
  });

  it('rejects a pair that collides with an existing id', () => {
    expectCode(
      () =>
        new CreateFulfillmentPairCommand(
          input({ request: { ...input().request, id: 'request.payment' } }),
        ).apply(base()),
      'id.duplicate',
    );
  });

  it('honours explicit rule and reference ids', () => {
    const outcome = new CreateFulfillmentPairCommand(
      input({
        referenceId: 'relation.custom-reference',
        ruleId: 'rule.custom-completion',
        completionExpression: 'confirmations.size() > 0',
      }),
    ).apply(base());

    expect(outcome.result.reference.id).toBe('relation.custom-reference');
    expect(outcome.result.rule.id).toBe('rule.custom-completion');
    expect(outcome.result.rule.expression).toBe('confirmations.size() > 0');
  });
});
