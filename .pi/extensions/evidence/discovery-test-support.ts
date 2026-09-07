import type {
  DiscoveryContent,
  DiscoveryQuestion,
} from './discovery-schema.ts';
import {
  finalizeDiscovery,
  saveDiscoveryContent,
  loadDiscovery,
  persistDiscovery,
} from './discovery.ts';
import {
  readText,
  REQUIREMENTS_PATH,
  saveState,
  writeTextAtomic,
} from './storage.ts';
import type { EvidenceState } from './types.ts';

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
  base.candidates = labels.map((description, i) => ({
    id: `C-00${i + 1}`,
    description,
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

// A current registry across multiple dialogue rounds, not a legacy snapshot.
export async function seedQuestions(
  root: string,
  state: EvidenceState,
  questions: DiscoveryQuestion[],
): Promise<void> {
  const snapshot = await loadDiscovery(root, state);
  snapshot.questions.push(...questions);
  snapshot.interaction.activeQuestionId = questions[0]?.id ?? null;
  snapshot.interaction.needsConsolidation = false;
  state.status = 'waiting_answer';
  await persistDiscovery(root, state, snapshot);
}

// Explicit synthetic evidence for isolated tests, never used by runtime code.
export async function seedDiscovery(
  root: string,
  state: EvidenceState,
): Promise<void> {
  if (state.discovery.stage === 'finalizing') return;
  if (!(await readText(root, REQUIREMENTS_PATH)))
    await writeTextAtomic(
      root,
      REQUIREMENTS_PATH,
      '# 合成测试输入\n明确正常、边界和异常预期。',
    );
  const { phase, status, currentArtifactIndex } = state;
  const modeling = structuredClone(state.modeling);
  state.phase = 'modeling';
  state.status = 'running';
  await saveDiscoveryContent(root, state, discoveryContent());
  await finalizeDiscovery(root, state);
  state.phase = phase;
  state.status = status;
  state.currentArtifactIndex = currentArtifactIndex;
  state.modeling = modeling;
  await saveState(root, state);
}
