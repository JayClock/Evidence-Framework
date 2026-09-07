import { brief, contractViewLines } from './discovery-contract-view.ts';
import type { DiscoverySnapshot } from './discovery-schema.ts';
import {
  assertDiscoveryContracts,
  assertDiscussionTarget,
  pendingQuestions,
} from './discovery.ts';

export interface AnswerSection {
  title: string;
  lines: string[];
}

export interface DiscoveryAnswerView {
  sections: AnswerSection[];
  details: string[];
}

// Display-only projection. Do not truncate the question or reinterpret missing facts.
export function discoveryAnswerView(
  snapshot: DiscoverySnapshot,
  questionId?: string,
): DiscoveryAnswerView {
  const question = questionId
    ? snapshot.questions.find((q) => q.id === questionId)
    : pendingQuestions(snapshot)[0];
  const target = question
    ? question.target
    : (snapshot.content?.contractView.current ?? null);
  const text = (value: string) => brief(value, Infinity);
  const currentQuestion: AnswerSection = {
    title: question ? `当前问题 · ${question.id}` : '当前问题',
    lines: [question ? text(question.prompt) : '暂无待答问题'],
  };
  try {
    assertDiscoveryContracts(snapshot);
    assertDiscussionTarget(snapshot, target);
  } catch {
    return {
      sections: [
        { title: '业务上下文', lines: ['依据或引用已失效，待重新核对'] },
        currentQuestion,
      ],
      details: [],
    };
  }
  if (!target) {
    return {
      sections: [
        {
          title: '业务上下文',
          lines: [
            snapshot.content
              ? text(snapshot.content.scope)
              : '尚待明确业务上下文',
          ],
        },
        currentQuestion,
      ],
      details: ['当前未定位合同；不为领域或签约前讨论补造合同。'],
    };
  }
  const content = snapshot.content!;
  const name = (ref: string | null): string => {
    if (!ref) return '待明确';
    const candidate = content.candidates.find((c) => c.id === ref)!;
    const mark = { explicit: '', inferred: '（候选）', unknown: '（待明确）' }[
      candidate.confidence
    ];
    return `${text(candidate.description)}${mark}`;
  };
  const contract = content.contractView.contracts.find(
    (c) => c.contextRef === target.contractRef,
  )!;
  const item = contract.fulfillments.find(
    (f) => f.candidateRef === target.fulfillmentRef,
  );
  const field = (label: string, value: string | null) =>
    `${label}：${value === null ? '待明确' : text(value)}`;
  return {
    sections: [
      {
        title: '合同上下文',
        lines: [
          name(contract.contextRef),
          `双方角色：${contract.roleRefs.map(name).join(' ↔ ')}`,
        ],
      },
      {
        title: '当前履约项',
        lines: item
          ? [
              name(item.candidateRef),
              `权利方：${name(item.rightHolderRef)}`,
              `义务方：${name(item.obligorRef)}`,
              field('请求依据', item.request),
              field('履约期限', item.deadline),
              field('确认依据', item.confirmation),
            ]
          : ['尚未选择履约项'],
      },
      currentQuestion,
    ],
    // Reuse the audited business view for rights, exception lineage and sources.
    details: contractViewLines(snapshot, {
      questionId: question?.id,
      detailed: true,
    }).filter((line) => !line.startsWith('当前问题：')),
  };
}
