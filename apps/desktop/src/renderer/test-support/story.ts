import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';
import type { StoryProjectResult } from '../../shared/story';

export const storyFlow = (flowId = '采购履约流'): FlowScenarioTrace => ({
  flowId,
  flowTitle: flowId,
  traceDigest: 'trace-1',
  involvedContextRefs: ['context.procurement'],
  involvedRoleRefs: ['role.buyer'],
  steps: ['evidence.contract', 'evidence.request', 'evidence.confirmation'].map(
    (entityId, index) => ({
      entityId,
      entityLabel: ['采购协议', '交付请求', '交付确认'][index] ?? entityId,
      entityKind: 'contract',
      sequence: index + 1,
      stepHash: `step-${index}`,
      exampleLabel: `example-${index}`,
      asOf: '2026-11-11T08:00:00Z',
      values: { amount: 500 },
      gaps: index === 1 ? ['待补确认责任'] : [],
      basedOn:
        index === 0
          ? []
          : [
              `${index === 1 ? 'evidence.contract' : 'evidence.request'}#example-${index - 1}`,
            ],
    }),
  ),
});

export const storyResult = (flow = storyFlow()): StoryProjectResult => ({
  flow,
  projection: {
    flowId: flow.flowId,
    storyTitle: flow.flowTitle,
    storySummary: '从采购协议到交付确认',
    businessGoal: '核对单据流转',
    scenes: flow.steps.map((step) => ({
      stepIndex: step.sequence,
      stepHash: step.stepHash,
      phaseTitle: `办理${step.entityLabel}`,
      narrative: `采购方办理${step.entityLabel}。`,
      actingRoleLabel: '采购方',
      targetEntityLabel: step.entityLabel,
      documentCard: {
        title: step.entityLabel,
        fields: [
          { name: 'amount', label: '金额', value: '500', keyData: true },
        ],
      },
      ruleEvaluations: [],
      ...(step.gaps.length ? { pendingSuspense: '请问谁负责确认？' } : {}),
    })),
  },
});
