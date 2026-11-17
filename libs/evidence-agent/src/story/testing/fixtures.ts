import {
  computeStepHash,
  type FlowScenarioTrace,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  createEmptyDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

export const stepFixture = (
  overrides: Partial<FlowStepTrace> = {},
): FlowStepTrace => {
  const facts = {
    sequence: 1,
    entityId: 'request.payment',
    entityKind: 'fulfillment_request' as const,
    entityLabel: '付款申请单',
    contextRef: 'context.purchase',
    actingRoleRef: 'role.seller',
    responsibleRoleRef: 'role.buyer',
    exampleLabel: '正常付款',
    asOf: '2026-04-01T10:00:00Z',
    basedOn: [],
    values: { amount: 100 },
    gaps: [],
    ...overrides,
  };
  return { ...facts, stepHash: computeStepHash(facts) };
};

export const flowFixture = (
  steps: readonly FlowStepTrace[] = [stepFixture()],
): FlowScenarioTrace => ({
  flowId: 'purchase',
  flowTitle: '采购付款',
  involvedContextRefs: ['context.purchase'],
  involvedRoleRefs: ['role.buyer', 'role.seller'],
  steps,
  traceDigest: 'not-a-cache-key',
});

export const modelFixture = (): DomainModelDocument => ({
  ...createEmptyDomainModel({
    id: 'model.purchase',
    name: '采购',
    entryContextRefs: ['context.purchase'],
  }),
  entities: [
    {
      type: 'entity',
      id: 'context.purchase',
      category: 'context',
      kind: 'contract',
      label: '采购合同',
    },
    {
      type: 'entity',
      id: 'role.seller',
      category: 'role',
      kind: 'party',
      label: '供应商销售部',
      contextRef: 'context.purchase',
    },
    {
      type: 'entity',
      id: 'role.buyer',
      category: 'role',
      kind: 'party',
      label: '买方财务部',
      contextRef: 'context.purchase',
    },
    {
      type: 'entity',
      id: 'request.payment',
      category: 'evidence',
      kind: 'fulfillment_request',
      label: '付款申请单',
      contextRef: 'context.purchase',
      attributes: [
        {
          name: 'amount',
          label: '金额',
          meaning: '应付金额',
          valueType: 'int',
          keyData: true,
        },
      ],
    },
  ],
});

export const sceneDraft = (
  values: Readonly<Record<string, unknown>> = { amount: 100 },
) => ({
  phaseTitle: '卖方发出支付主张',
  narrative:
    '供应商销售部根据采购合同向买方提出付款申请，双方核对金额和付款期限。',
  actingRoleLabel: '供应商销售部',
  targetEntityLabel: '付款申请单',
  documentCard: {
    title: '付款申请单',
    fields: Object.entries(values).map(([name, value]) => ({
      name,
      label: name,
      value: String(value),
      keyData: true,
    })),
  },
});
