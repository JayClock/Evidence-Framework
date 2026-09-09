import { describe, expect, it } from 'vitest';
import { contractContent } from '../../tests/support/discovery-fixtures.ts';
import {
  contextAssessment,
  contextSlice,
} from '../../tests/support/context-assessment.ts';
import { emptyDiscovery } from './replay.ts';
import { assessFormalization, CONTEXT_DIMENSIONS } from './formalization.ts';

// Synthetic regression only; never rewrites the running subscription discovery.
function subscription() {
  const snapshot = emptyDiscovery('synthetic-subscription');
  snapshot.content = contractContent();
  const content = snapshot.content;
  [
    '订阅合同',
    '平台',
    '读者',
    '支付订阅费',
    '开放阅读权益',
    '超时取消',
  ].forEach((label, i) => {
    content.candidates[i].label = label;
    content.candidates[i].description =
      `合成 ${label}；仅表达本测试的业务事实。`;
  });
  content.candidates[0].confidence = 'unknown';
  const [payment, rights, cancellation] =
    content.contractView.contracts[0].fulfillments;
  payment.request = '平台按已确定的订单金额要求读者支付订阅费。';
  payment.deadline = '付款请求开始后 72 小时';
  payment.confirmation = '支付服务商的成功付款凭证';
  rights.request = null;
  cancellation.parentFulfillmentRef = 'C-004';
  cancellation.request = '按 A-004 核查并关闭订单，形成取消确认后解除合同。';
  cancellation.sourceRefs = ['A-004'];
  snapshot.questions = [
    {
      id: 'Q-004',
      gapKey: 'c-006.cancellation',
      focus: 'evidence',
      target: null,
      prompt: '超时如何取消？',
      impact: '取消条件',
      blocking: true,
      sourceRefs: ['INPUT'],
    },
    {
      id: 'Q-005',
      gapKey: 'c-006.partial-payments',
      focus: 'evidence',
      target: null,
      prompt: '已收部分款项如何处理？',
      impact: '部分收款后续处理',
      blocking: true,
      sourceRefs: ['INPUT'],
    },
  ];
  snapshot.answers = [
    {
      id: 'A-004',
      questionId: 'Q-004',
      text: cancellation.request,
      status: 'answered',
      respondent: '合成测试人员',
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  const assessment = contextAssessment();
  const contract = contextSlice('C-001', 'contract', [
    'identity',
    'parties',
    'agreement',
  ]);
  contract.candidateRefs.push('C-002', 'C-003');
  for (const [key, candidateRef] of [
    ['platform', 'C-002'],
    ['reader', 'C-003'],
  ])
    contract.facts.push({
      key,
      candidateRef,
      dimension: 'identity',
      statement: '合成合同已经明确该方的业务身份。',
      status: 'known',
      sourceRefs: ['INPUT'],
    });
  contract.facts.push(
    {
      key: 'order_amount',
      candidateRef: 'C-001',
      dimension: 'structure',
      statement: '请求金额引用已确定的订单金额，不要求重建签约渠道。',
      status: 'known',
      sourceRefs: ['INPUT'],
    },
    {
      key: 'other_obligations',
      candidateRef: 'C-001',
      dimension: 'agreement',
      statement: '其他义务仍未展开。',
      status: 'unknown',
      sourceRefs: [],
    },
  );
  // Only this agreement clause is a payment prerequisite, NOT the whole agreement dimension.
  contract.requiredFactRefs.push('C-001.other_obligations');
  const children = ['C-004', 'C-005', 'C-006'].map((ref) =>
    contextSlice(ref, 'fulfillment', [...CONTEXT_DIMENSIONS.fulfillment]),
  );
  for (const child of children)
    for (const key of ['agreement', 'parties'])
      child.dependencies.push({
        consumerFactRef: `${child.contextRef}.request`,
        providerFactRef: `C-001.${key}`,
        kind: key === 'parties' ? 'structure' : 'provenance',
        purpose: '本履约引用该项已明确约定及合同双方，而非全部合同知识。',
        sourceRefs: ['INPUT'],
      });
  children[0].dependencies.push({
    consumerFactRef: 'C-004.rule',
    providerFactRef: 'C-001.order_amount',
    kind: 'decision',
    purpose: '付款金额须等于订单金额且成功时间不晚于截止。',
    sourceRefs: ['INPUT'],
  });
  children[2].facts.find((f) => f.key === 'request')!.sourceRefs = ['A-004'];
  children[2].facts.push({
    key: 'partial_payments',
    candidateRef: 'C-006',
    dimension: 'rule',
    statement: '部分已收款处理仍未知，不推定退款或无责任。',
    status: 'unknown',
    sourceRefs: [],
  });
  children[2].requiredFactRefs.push('C-006.partial_payments');
  assessment.contexts = [contract, ...children];
  assessment.questions = [
    {
      questionId: 'Q-005',
      affectedFactRefs: ['C-006.partial_payments'],
      reasoning: '该题仅阻塞部分收款后的处理，不自动否定独立正常付款事实。',
      sourceRefs: ['INPUT'],
    },
  ];
  return { snapshot, assessment };
}
describe('required contract facts rather than complete surrounding contexts', () => {
  it('keeps payment publishable with a partial contract and unknown rights/cancellation; preserves A-004 and Q-005', () => {
    const { snapshot, assessment } = subscription();
    const before = JSON.stringify(snapshot);
    const result = assessFormalization(snapshot, assessment);
    expect(
      result.contexts.find((ctx) => ctx.contextRef === 'C-004')?.status,
    ).toBe('ready');
    expect(
      result.contexts.find((ctx) => ctx.contextRef === 'C-001')?.status,
    ).toBe('support');
    expect(result.includedFactRefs).toContain('C-001.order_amount');
    expect(result.includedFactRefs).not.toContain('C-001.other_obligations');
    expect(result.pendingCandidateRefs).toEqual(['C-005', 'C-006']);
    expect(result.blockers).toContainEqual({
      factRef: 'C-006.partial_payments',
      reasons: ['业务事实尚未明确', 'Q-005'],
    });
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(
      result.assessment.contexts[3].facts.find((f) => f.key === 'request')
        ?.sourceRefs,
    ).toEqual(['A-004']);
  });
  it('blocks payment only when the actually consumed order amount needs an unknown offer version', () => {
    const { snapshot, assessment } = subscription();
    snapshot.content!.candidates.push({
      ...snapshot.content!.candidates[0],
      id: 'C-007',
      label: '报价渠道',
    });
    const channel = contextSlice('C-007', 'channel', [
      'identity',
      'parties',
      'evidence',
      'validity',
    ]);
    channel.facts.push({
      key: 'offer_version',
      candidateRef: 'C-007',
      dimension: 'validity',
      statement: '适用报价版本未知。',
      status: 'unknown',
      sourceRefs: [],
    });
    channel.requiredFactRefs.push('C-007.offer_version');
    assessment.contexts.push(channel);
    expect(
      assessFormalization(snapshot, assessment).includedCandidateRefs,
    ).toContain('C-004');
    assessment.contexts[0].dependencies.push({
      consumerFactRef: 'C-001.order_amount',
      providerFactRef: 'C-007.offer_version',
      kind: 'provenance',
      purpose: '本分支订单金额确实需要确定适用的报价版本。',
      sourceRefs: ['INPUT'],
    });
    const result = assessFormalization(snapshot, assessment);
    expect(result.includedCandidateRefs).not.toContain('C-004');
    expect(result.blockers).toContainEqual({
      factRef: 'C-001.order_amount',
      reasons: ['依赖事实未就绪：C-007.offer_version'],
    });
  });
});
