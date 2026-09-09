import { pendingQuestions } from '../../../modeling/discovery/questions.ts';
import {
  assertBusinessView,
  assertDiscussionTarget,
} from '../../../modeling/discovery/rules.ts';
import {
  discussionTargetObjectRef,
  type DiscoverySnapshot,
} from '../../../modeling/discovery/schema.ts';
import {
  brief,
  candidateDescriptionLines,
  candidateName,
  contextKindLabel,
  fulfillmentInteractionLines,
  questionResolutionLines,
} from '../../../modeling/discovery/view.ts';

export interface AnswerSection {
  title: string;
  lines: string[];
}

export interface DiscoveryAnswerView {
  sections: AnswerSection[];
  details: string[];
}

export function discoveryAnswerView(
  snapshot: DiscoverySnapshot,
  questionId?: string,
): DiscoveryAnswerView {
  const question = questionId
    ? snapshot.questions.find((value) => value.id === questionId)
    : pendingQuestions(snapshot)[0];
  const target = question
    ? question.target
    : (snapshot.content?.businessView.current ?? null);
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
    assertBusinessView(snapshot);
    assertDiscussionTarget(snapshot, target);
  } catch {
    return {
      sections: [
        { title: '当前建模位置', lines: ['依据或引用已失效，待重新核对'] },
        currentQuestion,
      ],
      details: resolutionLines,
    };
  }
  if (!target) {
    return {
      sections: [
        {
          title: '当前建模位置',
          lines: [
            snapshot.content
              ? text(snapshot.content.scope)
              : '尚待明确业务上下文',
          ],
        },
        currentQuestion,
      ],
      details: ['当前尚未定位业务上下文。'],
    };
  }
  const content = snapshot.content!;
  const name = (ref: string | null) => candidateName(snapshot, ref);
  const context = content.businessView.contexts.find(
    (value) => value.contextRef === target.contextRef,
  )!;
  const targetRef = discussionTargetObjectRef(target);
  const item =
    target.kind === 'contract'
      ? context.fulfillments.find(
          (value) => value.candidateRef === target.fulfillmentRef,
        )
      : undefined;
  const participantRefs = [
    ...context.participantRefs,
    ...(item?.participantRefs ?? []),
  ];
  const thingRefs = [...context.thingRefs, ...(item?.thingRefs ?? [])];
  const evidenceRefs = [
    ...context.evidenceRefs,
    context.agreementEvidence?.evidenceRef,
    item?.requestEvidence.evidenceRef,
    item?.confirmationEvidence.evidenceRef,
    ...(item?.supportingEvidenceRefs ?? []),
  ].filter((ref): ref is string => ref !== null && ref !== undefined);
  return {
    sections: [
      {
        title: '当前建模位置',
        lines: [
          [
            contextKindLabel(context.kind),
            name(context.contextRef),
            ...(targetRef ? [name(targetRef)] : []),
          ].join(' › '),
          `角色：${context.roleRefs.length ? context.roleRefs.map(name).join(' ↔ ') : '不适用或待明确'}`,
          `参与人／组织：${participantRefs.length ? [...new Set(participantRefs)].map(name).join('、') : '待明确'}`,
          `标的物：${thingRefs.length ? [...new Set(thingRefs)].map(name).join('、') : '待明确'}`,
          `相关凭证：${evidenceRefs.length ? [...new Set(evidenceRefs)].map(name).join('、') : '待明确'}`,
        ],
      },
      {
        title: context.kind === 'contract' ? '当前履约切片' : '当前对象切片',
        lines: item
          ? [
              name(item.candidateRef),
              ...fulfillmentInteractionLines(snapshot, item),
            ]
          : [
              targetRef
                ? name(targetRef)
                : context.kind === 'contract'
                  ? '尚未选择履约项'
                  : '尚未选择协商凭证或领域对象',
            ],
      },
      currentQuestion,
    ],
    details: [
      ...candidateDescriptionLines(snapshot, [
        context.contextRef,
        item?.candidateRef ?? null,
        ...participantRefs,
        ...thingRefs,
        ...evidenceRefs,
      ]),
      ...(item?.parentFulfillmentRef && item.trigger !== null
        ? [
            `前序／触发：${name(item.parentFulfillmentRef)} · ${text(item.trigger)}`,
          ]
        : []),
      `来源引用：${[...new Set([...context.sourceRefs, ...(item?.sourceRefs ?? [])])].map(text).join('、')}（发现依据，不是业务批准）`,
      '完整业务结构：/evidence-status',
    ],
  };
}
