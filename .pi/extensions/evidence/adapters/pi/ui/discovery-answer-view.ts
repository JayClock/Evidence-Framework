import {
  brief,
  candidateName,
  candidateDescriptionLines,
  fulfillmentInteractionLines,
  questionResolutionLines,
} from '../../../discovery-contract-view.ts';
import type { DiscoverySnapshot } from '../../../discovery-schema.ts';
import {
  assertDiscoveryContracts,
  assertDiscussionTarget,
  pendingQuestions,
} from '../../../discovery.ts';

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
  const resolutionLines = question
    ? questionResolutionLines(snapshot, question.id)
    : [];
  const currentQuestion: AnswerSection = {
    title: question ? `当前问题 · ${question.id}` : '当前问题',
    lines: [
      question ? text(question.prompt) : '暂无待答问题',
      ...resolutionLines,
    ],
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
      details: resolutionLines,
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
  const name = (ref: string | null) => candidateName(snapshot, ref);
  const contract = content.contractView.contracts.find(
    (c) => c.contextRef === target.contractRef,
  )!;
  const item = contract.fulfillments.find(
    (f) => f.candidateRef === target.fulfillmentRef,
  );
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
        title: '当前履约项（候选结构）',
        lines: item
          ? [
              name(item.candidateRef),
              ...fulfillmentInteractionLines(snapshot, item),
            ]
          : ['尚未选择履约项'],
      },
      currentQuestion,
    ],
    // Keep the card focused. The complete relationship tree is available only
    // on demand via /evidence-status, not repeated inside the answer dialog.
    details: [
      ...candidateDescriptionLines(snapshot, [item?.candidateRef ?? null]),
      ...(item?.parentFulfillmentRef && item.trigger !== null
        ? [
            `前序／触发：${name(item.parentFulfillmentRef)} · ${text(item.trigger)}`,
          ]
        : []),
      `来源引用：${[...new Set([...contract.sourceRefs, ...(item?.sourceRefs ?? [])])].map(text).join('、')}（发现依据，不是业务批准；材料新鲜度由定稿检查核对）`,
      '完整履约结构：/evidence-status',
    ],
  };
}
