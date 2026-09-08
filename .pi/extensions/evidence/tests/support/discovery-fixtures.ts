import type {
  DiscoveryContent,
  DiscoveryRecord,
  DiscoverySnapshot,
  DiscoverySubmission,
} from '../../modeling/discovery/schema.ts';

export function discoveryContent(): DiscoveryContent {
  return {
    scope: '测试夹具：仅验证本次局部业务的身份、规则和可追溯性。',
    excludedScope: '不展开其他组织的内部运营。',
    focus: 'replay',
    contractView: { current: null, contracts: [] },
    notes:
      '这是合成测试材料，不是业务验收记录。范围已限定，凭证及关键数据依据来自原始输入；纯领域对象按身份与规则发现。正常、边界和异常案例的预期均由测试输入明确给出。表达缺口由下游 Q1/Q2 验证，不声称单据模拟器验证了领域操作。',
    sources: [],
    candidates: [
      {
        id: 'C-001',
        label: '测试对象规则',
        description: '测试对象规则',
        confidence: 'explicit',
        sourceRefs: ['INPUT'],
        modelRefs: [],
      },
    ],
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

export function contractContent(): DiscoveryContent {
  const base = discoveryContent();
  const labels = [
    '作者合作协议',
    '平台',
    '作者',
    '交付稿件',
    '支付分成',
    '逾期补偿',
  ];
  base.candidates = labels.map((label, i) => ({
    id: `C-00${i + 1}`,
    label,
    description: label,
    confidence: i === 5 ? 'inferred' : 'explicit',
    sourceRefs: ['INPUT'],
    modelRefs: [],
  }));
  const item = {
    request: '合作协议、结算单',
    deadline: null,
    confirmation: null,
    parentFulfillmentRef: null,
    trigger: null,
    sourceRefs: ['INPUT'],
  };
  base.contractView = {
    current: { contractRef: 'C-001', fulfillmentRef: 'C-005' },
    contracts: [
      {
        contextRef: 'C-001',
        roleRefs: ['C-002', 'C-003'],
        sourceRefs: ['INPUT'],
        fulfillments: [
          {
            ...item,
            candidateRef: 'C-004',
            rightHolderRef: 'C-002',
            obligorRef: 'C-003',
            request: '合作协议约定的稿件',
            confirmation: '稿件验收单',
          },
          {
            ...item,
            candidateRef: 'C-005',
            rightHolderRef: 'C-003',
            obligorRef: 'C-002',
          },
          {
            ...item,
            candidateRef: 'C-006',
            rightHolderRef: 'C-003',
            obligorRef: 'C-002',
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
    {
      id: 'C-001',
      label: '专栏订阅合同',
      description:
        '读者与平台的专栏订阅合同上下文：订阅费用交换对应专栏付费内容访问权，未按规定时间支付则合同自动作废。合同形成依据、签署时刻待明确。',
    },
    {
      id: 'C-002',
      label: '读者',
      description:
        '订阅合同中的读者角色：支付订阅费用，获得对应专栏阅读权益，并在断更补偿及重新上架场景保留原读者关联。',
    },
    {
      id: 'C-003',
      label: '平台',
      description:
        '订阅合同中的平台角色：提供对应专栏付费内容访问权，断更时应下架并退款。外部系统或执行能力不等同于合同一方。',
    },
    {
      id: 'C-004',
      label: '支付订阅费',
      description:
        '支付订阅费履约：读者支付费用和平台提供阅读权益的交换已明确；以外部付款确认为支付完成依据。具体请求机制、支付期限、凭证提供方待明确。平台请求读者付款的结构为候选映射，不因这些局部缺口将支付义务整体视为未知。超时合同作废且读者无额外责任。',
    },
  ].map((candidate) => ({
    ...candidate,
    confidence: candidate.id === 'C-004' ? 'inferred' : 'explicit',
    sourceRefs: ['INPUT'],
    modelRefs: [],
  }));
  content.contractView = {
    current: { contractRef: 'C-001', fulfillmentRef: 'C-004' },
    contracts: [
      {
        contextRef: 'C-001',
        roleRefs: ['C-002', 'C-003'],
        sourceRefs: ['INPUT'],
        fulfillments: [
          {
            candidateRef: 'C-004',
            rightHolderRef: 'C-003',
            obligorRef: 'C-002',
            request: '按订阅约定支付对应专栏费用（业务背景、核心需求4）',
            deadline: null,
            confirmation: '外部付款确认；提供方及具体凭证待明确',
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
      value: { focus: value.focus, current: value.contractView.current },
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
    for (const { fulfillments, ...contract } of value.contractView.contracts) {
      records.set(`contract:${contract.contextRef}`, {
        kind: 'contract',
        supersedes: null,
        value: contract,
      });
      for (const item of fulfillments)
        records.set(`fulfillment:${contract.contextRef}:${item.candidateRef}`, {
          kind: 'fulfillment',
          supersedes: null,
          value: { contractRef: contract.contextRef, ...item },
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
