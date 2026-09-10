import { stripVTControlCharacters } from 'node:util';
import { activeResolution, pendingQuestions } from './questions.ts';
import { assertBusinessView, assertDiscussionTarget } from './rules.ts';
import type {
  BusinessView,
  DiscoverySnapshot,
  DiscussionTarget,
} from './schema.ts';
import { discussionTargetObjectRef } from './schema.ts';

export function brief(text: string, limit = 100): string {
  const chars = Array.from(
    stripVTControlCharacters(text)
      .replace(/[\s\x00-\x1f\x7f]+/g, ' ')
      .trim(),
  );
  return chars.length > limit
    ? `${chars.slice(0, limit).join('')}…`
    : chars.join('');
}

export function candidateName(
  snapshot: DiscoverySnapshot,
  ref: string | null,
): string {
  if (ref === null) return '待明确';
  const candidate = snapshot.content?.candidates.find(
    (value) => value.id === ref,
  );
  if (!candidate) return '待重新核对';
  const mark = { inferred: '（候选）', unknown: '（待明确）', explicit: '' }[
    candidate.confidence
  ];
  return `${brief(candidate.label, 40)}${mark}`;
}

export function candidateDescriptionLines(
  snapshot: DiscoverySnapshot,
  refs: Array<string | null>,
): string[] {
  return [...new Set(refs)].flatMap((ref) => {
    const candidate = snapshot.content?.candidates.find(
      (value) => value.id === ref,
    );
    if (!candidate) return [];
    return [
      `${candidate.id} [${candidate.archetype}${candidate.evidenceKind ? `/${candidate.evidenceKind}` : ''}] ${candidateName(snapshot, candidate.id)}：${brief(candidate.description, Infinity)}`,
      `  来源：${candidate.sourceRefs.map((source) => brief(source, Infinity)).join('、')}`,
    ];
  });
}

type Context = BusinessView['contexts'][number];
type Fulfillment = Context['fulfillments'][number];

export function contextKindLabel(kind: Context['kind']): string {
  return {
    channel: '渠道上下文',
    contract: '合同上下文',
    domain: '领域上下文',
  }[kind];
}

function names(snapshot: DiscoverySnapshot, refs: string[]): string {
  return refs.length
    ? refs.map((ref) => candidateName(snapshot, ref)).join('、')
    : '待明确';
}

function field(value: string | null, fullText: boolean): string {
  return value === null ? '待明确' : brief(value, fullText ? Infinity : 100);
}

function refsForParticipants(
  snapshot: DiscoverySnapshot,
  context: Context | undefined,
  item?: Fulfillment,
): string[] {
  const refs = [
    ...(context?.participantRefs ?? []),
    ...(item?.participantRefs ?? []),
    item?.requestEvidence.issuerRef,
    item?.requestEvidence.recipientRef,
    item?.confirmationEvidence.providerRef,
  ].filter((ref): ref is string => ref !== null && ref !== undefined);
  return [...new Set(refs)].filter(
    (ref) =>
      snapshot.content?.candidates.find((candidate) => candidate.id === ref)
        ?.archetype === 'participant',
  );
}

function evidenceRefs(context: Context, item?: Fulfillment): string[] {
  return [
    ...context.evidenceRefs,
    context.agreementEvidence?.evidenceRef,
    item?.requestEvidence.evidenceRef,
    item?.confirmationEvidence.evidenceRef,
    ...(item?.supportingEvidenceRefs ?? []),
  ].filter((ref): ref is string => ref !== null && ref !== undefined);
}

export function fulfillmentInteractionLines(
  snapshot: DiscoverySnapshot,
  item: Fulfillment,
  fullText = false,
): string[] {
  const name = (ref: string | null) => candidateName(snapshot, ref);
  const request = item.requestEvidence;
  const confirmation = item.confirmationEvidence;
  const values = [
    request.requirement,
    request.startAt,
    request.expiredAt,
    confirmation.proves,
    confirmation.confirmedAt,
  ];
  return [
    `履约请求凭证：${name(request.evidenceRef)}`,
    `发起／接收：${name(request.issuerRef)} → ${name(request.recipientRef)}`,
    `要求：${field(request.requirement, fullText)}`,
    `请求时间：started_at=${field(request.startAt, fullText)}；expired_at=${field(request.expiredAt, fullText)}`,
    `履约确认凭证：${name(confirmation.evidenceRef)}`,
    `提供方：${name(confirmation.providerRef)}`,
    `证明：${field(confirmation.proves, fullText)}`,
    `确认时间：confirmed_at=${field(confirmation.confirmedAt, fullText)}`,
    `支撑凭证：${names(snapshot, item.supportingEvidenceRefs)}`,
    `参与人／组织：${names(snapshot, refsForParticipants(snapshot, undefined, item))}`,
    `标的物：${names(snapshot, item.thingRefs)}`,
    ...(!fullText &&
    values.some(
      (value) => value !== null && brief(value) !== brief(value, Infinity),
    )
      ? ['说明已截短，完整原文见 /evidence-status']
      : []),
  ];
}

function fulfillmentCoverage(item: Fulfillment): string {
  const mark = (known: number, total: number) =>
    known === total ? '✓' : known === 0 ? '?' : '△';
  const request = [
    item.requestEvidence.evidenceRef,
    item.requestEvidence.requirement,
    item.requestEvidence.startAt,
    item.requestEvidence.expiredAt,
  ];
  const confirmation = [
    item.confirmationEvidence.evidenceRef,
    item.confirmationEvidence.providerRef,
    item.confirmationEvidence.proves,
    item.confirmationEvidence.confirmedAt,
  ];
  return [
    `请求 ${mark(request.filter(Boolean).length, request.length)}`,
    `确认 ${mark(confirmation.filter(Boolean).length, confirmation.length)}`,
    `参与人／物 ${mark(item.participantRefs.length + item.thingRefs.length, 1)}`,
  ].join(' · ');
}

export function questionResolutionLines(
  snapshot: DiscoverySnapshot,
  questionId: string,
): string[] {
  const resolution = snapshot.questionResolutions.find(
    (value) => value.questionId === questionId,
  );
  if (!resolution) return [];
  return [
    `${questionId} ${activeResolution(snapshot, questionId) ? '已关联解决依据（Agent 解释，非人工回答）' : '解决依据已失效'} · ${snapshot.recordHeads[`resolution:${questionId}`]}`,
    `结论：${brief(resolution.conclusion, Infinity)}`,
    `推理：${brief(resolution.reasoning, Infinity)}`,
    ...resolution.citations.map(
      (citation) => `${citation.sourceRef}：${brief(citation.quote, Infinity)}`,
    ),
  ];
}

export function questionLabel(
  snapshot: DiscoverySnapshot,
  questionId: string,
): string {
  const question = snapshot.questions.find((value) => value.id === questionId);
  if (!question) return questionId;
  const resolution = snapshot.questionResolutions.find(
    (value) => value.questionId === question.id,
  );
  const mark = resolution
    ? activeResolution(snapshot, question.id)
      ? '[已关联依据] '
      : '[依据失效] '
    : '';
  try {
    assertBusinessView(snapshot);
    assertDiscussionTarget(snapshot, question.target);
  } catch {
    return `${question.id} ${mark}[原业务位置待核对] ${brief(question.prompt)}`;
  }
  const path = question.target
    ? [
        candidateName(snapshot, question.target.contextRef),
        ...(discussionTargetObjectRef(question.target)
          ? [
              candidateName(
                snapshot,
                discussionTargetObjectRef(question.target),
              ),
            ]
          : []),
      ].join(' › ') + ' · '
    : '';
  return `${question.id} ${mark}${path}${brief(question.prompt)}`;
}

function questionLines(
  snapshot: DiscoverySnapshot,
  question: DiscoverySnapshot['questions'][number] | undefined,
  detailed: boolean,
): string[] {
  let line = '当前问题：暂无待答问题';
  if (snapshot.interaction.needsConsolidation)
    line = '当前问题：正在整理本次输入';
  if (snapshot.interaction.stopped) line = '当前问题：本轮已结束';
  if (question)
    line = `当前问题：${question.id} ${brief(question.prompt, 180)}`;
  const resolutions = detailed
    ? snapshot.questionResolutions.flatMap((value) =>
        questionResolutionLines(snapshot, value.questionId),
      )
    : question
      ? questionResolutionLines(snapshot, question.id)
      : [];
  return [line, ...resolutions];
}

// Business position and fact coverage are the primary discovery progress. The
// journal revision remains audit metadata in /evidence-status.
export function businessViewLines(
  snapshot: DiscoverySnapshot,
  options: { questionId?: string; detailed?: boolean } = {},
): string[] {
  const detailed = options.detailed ?? false;
  const question = options.questionId
    ? snapshot.questions.find((value) => value.id === options.questionId)
    : pendingQuestions(snapshot)[0];
  const target: DiscussionTarget = question
    ? question.target
    : (snapshot.content?.businessView.current ?? null);
  const trailing = questionLines(snapshot, question, detailed);
  try {
    assertBusinessView(snapshot);
    assertDiscussionTarget(snapshot, target);
  } catch {
    return ['当前建模位置：依据或引用已失效，待重新核对', ...trailing];
  }
  if (target === null) return ['当前建模位置：尚未定位业务上下文', ...trailing];
  const context = snapshot.content!.businessView.contexts.find(
    (value) => value.contextRef === target.contextRef,
  )!;
  const targetRef = discussionTargetObjectRef(target);
  const current =
    target.kind === 'contract'
      ? context.fulfillments.find((item) => item.candidateRef === targetRef)
      : undefined;
  const name = (ref: string | null) => candidateName(snapshot, ref);
  const position = [
    contextKindLabel(context.kind),
    name(context.contextRef),
    ...(targetRef ? [name(targetRef)] : []),
  ].join(' › ');
  const participants = refsForParticipants(snapshot, context, current);
  const things = [
    ...new Set([...context.thingRefs, ...(current?.thingRefs ?? [])]),
  ];
  const lines = [
    `当前建模位置：${position}`,
    `上下文角色：${context.roleRefs.length ? context.roleRefs.map(name).join(' ↔ ') : '不适用或待明确'}`,
    `参与人／组织：${names(snapshot, participants)}`,
    `标的物：${names(snapshot, things)}`,
    `相关凭证：${names(snapshot, [...new Set(evidenceRefs(context, current))])}`,
  ];
  if (context.agreementEvidence)
    lines.push(
      `合同凭证：${name(context.agreementEvidence.evidenceRef)}；signed_at=${field(context.agreementEvidence.signedAt, detailed)}`,
    );
  if (context.kind === 'contract') {
    lines.push('候选履约（请求 → 确认凭证）：');
    const ordered: Array<{ item: Fulfillment; depth: number }> = [];
    const visit = (parent: string | null, depth: number) => {
      for (const item of context.fulfillments.filter(
        (value) => value.parentFulfillmentRef === parent,
      )) {
        ordered.push({ item, depth });
        visit(item.candidateRef, depth + 1);
      }
    };
    visit(null, 0);
    const visible = detailed ? ordered : ordered.slice(0, 5);
    if (current && !visible.some((entry) => entry.item === current)) {
      if (visible.length === 5) visible.pop();
      visible.push(ordered.find((entry) => entry.item === current)!);
    }
    if (!visible.length) lines.push('  尚未明确履约项');
    for (const { item, depth } of visible) {
      const marker = item === current ? '▶' : ' ';
      const branch = depth ? `${'  '.repeat(Math.min(depth, 3))}↳ ` : '';
      lines.push(`${marker} ${branch}${name(item.candidateRef)}`);
      if (detailed || item === current)
        lines.push(
          ...fulfillmentInteractionLines(snapshot, item, detailed).map(
            (line) => `    ${line}`,
          ),
        );
      if (detailed && item.parentFulfillmentRef)
        lines.push(
          `    前序：${name(item.parentFulfillmentRef)}；触发：${brief(item.trigger!)}`,
        );
    }
    if (ordered.length > visible.length)
      lines.push(
        `  另 ${ordered.length - visible.length} 项见 /evidence-status`,
      );
  }
  const participantCoverage =
    participants.length || things.length ? '部分明确' : '待明确';
  lines.push(
    `事实覆盖：${
      current
        ? fulfillmentCoverage(current)
        : context.kind === 'contract'
          ? '上下文已知 · 当前履约待明确'
          : `${context.kind === 'channel' ? '协商凭证' : '领域对象'} ${targetRef ? '已知' : '待明确'} · 参与人／标的物 ${participantCoverage}`
    }`,
  );
  if (current) {
    if (current.parentFulfillmentRef)
      lines.push(
        `前序／触发：${name(current.parentFulfillmentRef)} · ${brief(current.trigger!)}`,
      );
    const consequences = context.fulfillments.filter(
      (item) => item.parentFulfillmentRef === current.candidateRef,
    );
    lines.push(
      `异常责任：${
        consequences.length
          ? consequences
              .slice(0, 3)
              .map(
                (item) =>
                  `${brief(item.trigger!, 40)} → ${name(item.candidateRef)}`,
              )
              .join('；')
          : '尚未记录（不表示不存在）'
      }`,
    );
  }
  if (detailed)
    lines.push(
      `来源引用：${[...new Set([...context.sourceRefs, ...(current?.sourceRefs ?? [])])].join('、')}（发现依据，不是业务批准）`,
      '候选详细说明：',
      ...candidateDescriptionLines(snapshot, [
        context.contextRef,
        ...context.roleRefs,
        ...(context?.participantRefs ?? []),
        ...context.thingRefs,
        ...context.evidenceRefs,
        ...context.fulfillments.flatMap((item) => [
          item.candidateRef,
          item.requestEvidence.evidenceRef,
          item.confirmationEvidence.evidenceRef,
          ...item.supportingEvidenceRefs,
          ...item.participantRefs,
          ...item.thingRefs,
        ]),
      ]),
    );
  lines.push(...trailing);
  return lines;
}
