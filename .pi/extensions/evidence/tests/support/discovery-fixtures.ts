import type {
  DiscoveryContent,
  DiscoveryRecord,
  DiscoverySnapshot,
  DiscoverySubmission,
} from '../../modeling/discovery/schema.ts';

const candidate = (
  id: string,
  label: string,
  archetype:
    | 'context'
    | 'fulfillment'
    | 'evidence'
    | 'role'
    | 'participant'
    | 'thing'
    | 'description',
  description = label,
  confidence: 'explicit' | 'inferred' | 'unknown' = 'explicit',
) => ({
  id,
  archetype,
  evidenceKind: null,
  label,
  description,
  confidence,
  sourceRefs: ['INPUT'],
  modelRefs: [],
});

const requestEvidence = (
  requirement: string | null,
  startAt: string | null = null,
  expiredAt: string | null = null,
  issuerRef: string | null = null,
  recipientRef: string | null = null,
) => ({
  evidenceRef: null,
  issuerRef,
  recipientRef,
  requirement,
  startAt,
  expiredAt,
});

const confirmationEvidence = (proves: string | null) => ({
  evidenceRef: null,
  providerRef: null,
  proves,
  confirmedAt: proves ? '以本次履约确认的 confirmed_at 为准' : null,
});

export function discoveryContent(): DiscoveryContent {
  return {
    scope: '测试夹具：仅验证本次局部业务的身份、规则和可追溯性。',
    excludedScope: '不展开其他组织的内部运营。',
    focus: 'replay',
    businessView: {
      current: { kind: 'domain', contextRef: 'C-001', objectRef: null },
      contexts: [
        {
          kind: 'domain',
          contextRef: 'C-001',
          roleRefs: [],
          participantRefs: [],
          thingRefs: [],
          evidenceRefs: [],
          agreementEvidence: null,
          sourceRefs: ['INPUT'],
          fulfillments: [],
        },
      ],
    },
    notes:
      '这是合成测试材料，不是业务验收记录。范围已限定，凭证及关键数据依据来自原始输入；纯领域对象按身份与规则发现。正常、边界和异常案例的预期均由测试输入明确给出。表达缺口由下游 Q1/Q2 验证，不声称单据模拟器验证了领域操作。',
    sources: [],
    candidates: [candidate('C-001', '测试对象规则', 'context')],
    cases: (['normal', 'boundary', 'exception'] as const).map((kind, i) => ({
      id: `CASE-00${i + 1}`,
      kind,
      mode: 'domain',
      scenario: `合成 ${kind} 示例`,
      expected: '按测试输入的规则判断，不由实现倒推预期',
      sourceRefs: ['INPUT'],
      gap: '领域操作留给 Q1/Q2 验证',
    })),
  };
}

export { contextAssessment as domainAssessment } from './context-assessment.ts';

export function contractContent(): DiscoveryContent {
  const base = discoveryContent();
  base.candidates = [
    candidate('C-001', '作者合作协议', 'context'),
    candidate('C-002', '平台', 'role'),
    candidate('C-003', '作者', 'role'),
    candidate('C-004', '交付稿件', 'fulfillment'),
    candidate('C-005', '支付分成', 'fulfillment'),
    candidate('C-006', '逾期补偿', 'fulfillment', '逾期补偿', 'inferred'),
  ];
  const baseItem = {
    requestEvidence: requestEvidence(null),
    confirmationEvidence: confirmationEvidence(null),
    supportingEvidenceRefs: [],
    participantRefs: [],
    thingRefs: [],
    parentFulfillmentRef: null,
    trigger: null,
    sourceRefs: ['INPUT'],
  };
  base.businessView = {
    current: { kind: 'contract', contextRef: 'C-001', fulfillmentRef: 'C-005' },
    contexts: [
      {
        kind: 'contract',
        contextRef: 'C-001',
        roleRefs: ['C-002', 'C-003'],
        participantRefs: [],
        thingRefs: [],
        evidenceRefs: [],
        agreementEvidence: { evidenceRef: null, signedAt: null },
        sourceRefs: ['INPUT'],
        fulfillments: [
          {
            ...baseItem,
            candidateRef: 'C-004',
            requestEvidence: requestEvidence(
              '合作协议约定的稿件',
              null,
              null,
              'C-002',
              'C-003',
            ),
            confirmationEvidence:
              confirmationEvidence('稿件验收单证明交稿完成'),
          },
          {
            ...baseItem,
            candidateRef: 'C-005',
            requestEvidence: requestEvidence(
              '合作协议、结算单',
              null,
              null,
              'C-003',
              'C-002',
            ),
          },
          {
            ...baseItem,
            candidateRef: 'C-006',
            requestEvidence: requestEvidence(
              '按逾期责任支付补偿',
              null,
              null,
              'C-003',
              'C-002',
            ),
            parentFulfillmentRef: 'C-005',
            trigger: '逾期未支付',
          },
        ],
      },
    ],
  };
  return base;
}

// Synthetic regression from the subscription example: realistic analysis length,
// deliberately separate from the short names shown in the business card.
export function subscriptionContent(): DiscoveryContent {
  const content = discoveryContent();
  content.scope = '仅梳理专栏订阅上下文的付款确认、阅读权益及超时处理。';
  content.focus = 'evidence';
  content.candidates = [
    candidate(
      'C-001',
      '专栏订阅合同',
      'context',
      '读者与平台的专栏订阅合同上下文：订阅费用交换对应专栏付费内容访问权，未按规定时间支付则合同自动作废。合同形成依据、签署时刻待明确。',
    ),
    candidate(
      'C-002',
      '读者',
      'role',
      '订阅合同中的读者角色：支付订阅费用，获得对应专栏阅读权益，并在断更补偿及重新上架场景保留原读者关联。',
    ),
    candidate(
      'C-003',
      '平台',
      'role',
      '订阅合同中的平台角色：提供对应专栏付费内容访问权，断更时应下架并退款。外部系统或执行能力不等同于合同一方。',
    ),
    candidate(
      'C-004',
      '支付订阅费',
      'fulfillment',
      '支付订阅费履约：读者支付费用和平台提供阅读权益的交换已明确；以外部付款确认为支付完成依据。具体请求机制、支付期限、凭证提供方待明确。平台请求读者付款的结构为候选映射，不因这些局部缺口将支付义务整体视为未知。超时合同作废且读者无额外责任。',
      'inferred',
    ),
  ];
  content.businessView = {
    current: { kind: 'contract', contextRef: 'C-001', fulfillmentRef: 'C-004' },
    contexts: [
      {
        kind: 'contract',
        contextRef: 'C-001',
        roleRefs: ['C-002', 'C-003'],
        participantRefs: [],
        thingRefs: [],
        evidenceRefs: [],
        agreementEvidence: { evidenceRef: null, signedAt: null },
        sourceRefs: ['INPUT'],
        fulfillments: [
          {
            candidateRef: 'C-004',
            requestEvidence: requestEvidence(
              '按订阅约定支付对应专栏费用（业务背景、核心需求4）',
              '以本次付款请求的 started_at 为准；形成依据待明确',
              '以本次付款请求的 expired_at 为准；确定依据待明确',
              'C-003',
              'C-002',
            ),
            confirmationEvidence: {
              evidenceRef: null,
              providerRef: null,
              proves: '外部付款确认，具体凭证及提供方待明确',
              confirmedAt: '以付款确认的 confirmed_at 判断是否按时履约',
            },
            supportingEvidenceRefs: [],
            participantRefs: [],
            thingRefs: [],
            parentFulfillmentRef: null,
            trigger: null,
            sourceRefs: ['INPUT'],
          },
        ],
      },
    ],
  };
  return content;
}

// Test-only builder: translate complete fixture expectations into explicit
// append/correct/withdraw records. Production never accepts full content.
export function fixtureSubmission(
  content: DiscoveryContent,
  snapshot: DiscoverySnapshot,
): DiscoverySubmission {
  const flatten = (value: DiscoveryContent): Map<string, DiscoveryRecord> => {
    const records = new Map<string, DiscoveryRecord>();
    records.set('scope', {
      kind: 'scope',
      supersedes: null,
      value: { scope: value.scope, excludedScope: value.excludedScope },
    });
    records.set('position', {
      kind: 'position',
      supersedes: null,
      value: { focus: value.focus, current: value.businessView.current },
    });
    const noteKey =
      Object.keys(snapshot.recordHeads).find((key) =>
        key.startsWith('note:'),
      ) ?? 'note:fixture';
    records.set(noteKey, {
      kind: 'note',
      supersedes: null,
      value: value.notes,
    });
    for (const item of value.sources)
      records.set(`source:${item.id}`, {
        kind: 'source',
        supersedes: null,
        value: item,
      });
    for (const item of value.candidates)
      records.set(`candidate:${item.id}`, {
        kind: 'candidate',
        supersedes: null,
        value: item,
      });
    for (const item of value.cases)
      records.set(`case:${item.id}`, {
        kind: 'case',
        supersedes: null,
        value: item,
      });
    for (const { fulfillments, ...context } of value.businessView.contexts) {
      records.set(`context:${context.contextRef}`, {
        kind: 'context',
        supersedes: null,
        value: context,
      });
      for (const item of fulfillments)
        records.set(`fulfillment:${context.contextRef}:${item.candidateRef}`, {
          kind: 'fulfillment',
          supersedes: null,
          value: { contextRef: context.contextRef, ...item },
        });
    }
    return records;
  };
  const previous = snapshot.content
    ? flatten(snapshot.content)
    : new Map<string, DiscoveryRecord>();
  const desired = flatten(content);
  const records: DiscoveryRecord[] = [];
  for (const [key, record] of desired) {
    if (JSON.stringify(record) !== JSON.stringify(previous.get(key)))
      records.push({
        ...record,
        supersedes: snapshot.recordHeads[key] ?? null,
      } as DiscoveryRecord);
  }
  for (const key of previous.keys()) {
    if (!desired.has(key))
      records.push({ kind: 'withdraw', supersedes: snapshot.recordHeads[key] });
  }
  if (!records.length) {
    const key = [...desired.keys()].find((key) => key.startsWith('note:'))!;
    records.push({
      kind: 'note',
      supersedes: snapshot.recordHeads[key] ?? null,
      value: content.notes,
    });
  }
  return {
    summary: '合成测试：按测试输入整理本轮候选、回放和未解决缺口。',
    sourceRefs: ['INPUT'],
    records,
  };
}
