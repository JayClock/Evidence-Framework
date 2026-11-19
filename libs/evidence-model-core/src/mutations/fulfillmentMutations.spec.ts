import { runMutation } from '../testing/runMutation.js';
import type { ModelRecipe } from '../session/types.js';
import { describe, expect, it } from 'vitest';

import {
  createFulfillmentPairMutator,
  ModelMutationError,
  createDomainGraph,
  type CreateFulfillmentPairInput,
} from '../index.js';
import { createProcurementModel } from '../testing/modelFixture.js';

const base = () => createProcurementModel();

const expectCode = (work: () => unknown, code: string): void => {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(ModelMutationError);
    expect((error as ModelMutationError).code).toBe(code);
    return;
  }

  throw new Error(`expected mutation to fail with ${code}`);
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
        timeRole: 'start',
        label: '请求时间',
        meaning: '卖方提出发货请求的业务时间',
        valueType: 'timestamp',
        required: true,
        keyData: true,
      },
      {
        name: 'expired_at',
        timeRole: 'deadline',
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
        timeRole: 'occurrence',
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

describe('createFulfillmentPairMutator', () => {
  it('creates request, confirmation, references and completion rule', () => {
    const document = base();
    const snapshot = structuredClone(document);
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createFulfillmentPairMutator(draft, input()),
    );

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
    const outcome = runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
      createFulfillmentPairMutator(draft, input()),
    );
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
    const outcome = runMutation(document, (draft: Parameters<ModelRecipe>[0]) =>
      createFulfillmentPairMutator(draft, input()),
    );

    expect(outcome.undo()).toEqual(document);
  });

  it('requires a Contract Context', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createFulfillmentPairMutator(
            draft,
            input({ contextRef: 'context.catalogue' }),
          ),
        ),
      'context.notContract',
    );
  });

  it('requires responsible roles bound by the root Contract', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createFulfillmentPairMutator(
            draft,
            input({
              request: {
                ...input().request,
                responsibleRoleRef: 'role.catalogue-item',
              },
            }),
          ),
        ),
      'role.notBound',
    );
  });

  it('requires modeled business times', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createFulfillmentPairMutator(
            draft,
            input({
              request: {
                ...input().request,
                attributes: input().request.attributes.slice(0, 1),
              },
            }),
          ),
        ),
      'attribute.time.missing',
    );
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createFulfillmentPairMutator(
            draft,
            input({
              confirmation: { ...input().confirmation, attributes: [] },
            }),
          ),
        ),
      'attribute.time.missing',
    );
  });

  it('rejects identical request and confirmation ids', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createFulfillmentPairMutator(
            draft,
            input({
              confirmation: { ...input().confirmation, id: input().request.id },
            }),
          ),
        ),
      'id.duplicate',
    );
  });

  it('rejects a pair that collides with an existing id', () => {
    expectCode(
      () =>
        runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
          createFulfillmentPairMutator(
            draft,
            input({ request: { ...input().request, id: 'request.payment' } }),
          ),
        ),
      'id.duplicate',
    );
  });

  it('honours explicit rule and reference ids', () => {
    const outcome = runMutation(base(), (draft: Parameters<ModelRecipe>[0]) =>
      createFulfillmentPairMutator(
        draft,
        input({
          referenceId: 'relation.custom-reference',
          ruleId: 'rule.custom-completion',
          completionExpression: 'confirmations.size() > 0',
        }),
      ),
    );

    expect(outcome.result.reference.id).toBe('relation.custom-reference');
    expect(outcome.result.rule.id).toBe('rule.custom-completion');
    expect(outcome.result.rule.expression).toBe('confirmations.size() > 0');
  });
});
