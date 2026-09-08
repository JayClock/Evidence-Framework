import { stripVTControlCharacters } from 'node:util';
import { activeResolution, pendingQuestions } from './questions.ts';
import { assertDiscoveryContracts, assertDiscussionTarget } from './rules.ts';
import type {
  ContractView,
  DiscoverySnapshot,
  DiscussionTarget,
} from './schema.ts';

// Display bounds only; source text and business evidence are never rewritten.
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
  const candidate = snapshot.content?.candidates.find((c) => c.id === ref);
  if (!candidate) return '待重新核对';
  const mark = { inferred: '（候选）', unknown: '（待明确）', explicit: '' }[
    candidate.confidence
  ];
  const label = candidate.label
    ? brief(candidate.label, 40)
    : `${ref}（名称待整理）`;
  return `${label}${mark}`;
}

// Full explanations belong to on-demand views, never to names or arrow ends.
export function candidateDescriptionLines(
  snapshot: DiscoverySnapshot,
  refs: Array<string | null>,
): string[] {
  return [...new Set(refs)].flatMap((ref) => {
    const candidate = snapshot.content?.candidates.find((c) => c.id === ref);
    if (!candidate) return [];
    return [
      `${candidate.id} ${candidateName(snapshot, candidate.id)}：${brief(candidate.description, Infinity)}`,
      `  来源：${candidate.sourceRefs.map((source) => brief(source, Infinity)).join('、')}`,
    ];
  });
}

// Shared by TUI cards and text/RPC views. A confirmation is evidence, not an
// inferred approver or a runtime completion status. Legacy text stays verbatim.
export function fulfillmentInteractionLines(
  snapshot: DiscoverySnapshot,
  item: ContractView['contracts'][number]['fulfillments'][number],
  fullText = false,
): string[] {
  const name = (ref: string | null) => candidateName(snapshot, ref);
  const field = (value: string | null) =>
    value === null ? '待明确' : brief(value, fullText ? Infinity : 100);
  return [
    `履约请求：${name(item.rightHolderRef)} → ${name(item.obligorRef)}（权利方 → 义务方）`,
    `要求／依据：${field(item.request)}`,
    `履约期限：${field(item.deadline)}`,
    `履约确认凭证：${field(item.confirmation)}`,
    ...(!fullText &&
    [item.request, item.deadline, item.confirmation].some(
      (value) => value !== null && brief(value) !== brief(value, Infinity),
    )
      ? ['说明已截短，完整原文见 /evidence-status']
      : []),
  ];
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
  const question = snapshot.questions.find((q) => q.id === questionId);
  if (!question) return questionId;
  const resolution = snapshot.questionResolutions.find(
    (value) => value.questionId === question.id,
  );
  let mark = '';
  if (resolution)
    mark = activeResolution(snapshot, question.id)
      ? '[已关联依据] '
      : '[依据失效] ';
  try {
    assertDiscoveryContracts(snapshot);
    assertDiscussionTarget(snapshot, question.target);
  } catch {
    return `${question.id} ${mark}[原合同待核对] ${brief(question.prompt)}`;
  }
  let path = '';
  if (question.target) {
    const parts = [candidateName(snapshot, question.target.contractRef)];
    if (question.target.fulfillmentRef)
      parts.push(candidateName(snapshot, question.target.fulfillmentRef));
    path = `${parts.join(' › ')} · `;
  }
  return `${question.id} ${mark}${path}${brief(question.prompt)}`;
}

// A business view, not workflow progress, a completion percentage or runtime fulfillment status.
export function contractViewLines(
  snapshot: DiscoverySnapshot,
  options: { questionId?: string; detailed?: boolean } = {},
): string[] {
  const question = options.questionId
    ? snapshot.questions.find((q) => q.id === options.questionId)
    : pendingQuestions(snapshot)[0];
  let questionLine = '当前问题：暂无待答问题';
  if (snapshot.interaction.needsConsolidation)
    questionLine = '当前问题：正在整理本次输入';
  if (snapshot.interaction.stopped) questionLine = '当前问题：本轮已结束';
  if (question)
    questionLine = `当前问题：${question.id} ${brief(question.prompt, 180)}`;
  const target: DiscussionTarget = question
    ? question.target
    : (snapshot.content?.contractView.current ?? null);
  let resolutionLines: string[] = [];
  if (options.detailed)
    resolutionLines = snapshot.questionResolutions.flatMap((value) =>
      questionResolutionLines(snapshot, value.questionId),
    );
  else if (question)
    resolutionLines = questionResolutionLines(snapshot, question.id);
  try {
    assertDiscoveryContracts(snapshot);
    assertDiscussionTarget(snapshot, target);
  } catch {
    return [
      '合同关系：依据或引用已失效，待重新核对',
      questionLine,
      ...resolutionLines,
    ];
  }
  if (target === null)
    return [
      '合同上下文：待明确（不为领域或签约前讨论补造合同）',
      '双方角色：待明确',
      '当前展开：未选择履约项',
      questionLine,
      ...resolutionLines,
    ];
  const contract = snapshot.content!.contractView.contracts.find(
    (c) => c.contextRef === target.contractRef,
  )!;
  const current = contract.fulfillments.find(
    (f) => f.candidateRef === target.fulfillmentRef,
  );
  const name = (ref: string | null) => candidateName(snapshot, ref);
  const lines = [
    `合同上下文：${name(contract.contextRef)}`,
    `双方角色：${contract.roleRefs.map(name).join(' ↔ ')}`,
    '候选履约（请求 → 确认凭证）：',
  ];
  const ordered: Array<{
    item: (typeof contract.fulfillments)[number];
    depth: number;
  }> = [];
  const visit = (parent: string | null, depth: number) => {
    for (const item of contract.fulfillments.filter(
      (f) => f.parentFulfillmentRef === parent,
    )) {
      ordered.push({ item, depth });
      visit(item.candidateRef, depth + 1);
    }
  };
  visit(null, 0);
  // Keep the selected item visible even when the contract has many obligations.
  const visible = options.detailed ? ordered : ordered.slice(0, 5);
  if (current && !visible.some((entry) => entry.item === current)) {
    if (visible.length === 5) visible.pop();
    visible.push(ordered.find((entry) => entry.item === current)!);
  }
  if (!visible.length) lines.push('  尚未明确履约项');
  for (const { item, depth } of visible) {
    const marker = item === current ? '▶' : ' ';
    const branch = depth ? `${'  '.repeat(Math.min(depth, 3))}↳ ` : '';
    lines.push(
      `${marker} ${branch}${name(item.candidateRef)}`,
      ...fulfillmentInteractionLines(snapshot, item, options.detailed).map(
        (line) => `    ${line}`,
      ),
    );
    if (options.detailed && item.parentFulfillmentRef)
      lines.push(
        `    前序：${name(item.parentFulfillmentRef)}；触发：${brief(item.trigger!)}`,
      );
  }
  if (ordered.length > visible.length)
    lines.push(`  另 ${ordered.length - visible.length} 项见 /evidence-status`);
  lines.push(
    `当前展开：${current ? name(current.candidateRef) : '未选择履约项'}`,
  );
  if (current) {
    if (current.parentFulfillmentRef)
      lines.push(
        `  前序／触发：${name(current.parentFulfillmentRef)} · ${brief(current.trigger!)}`,
      );
    const consequences = contract.fulfillments.filter(
      (f) => f.parentFulfillmentRef === current.candidateRef,
    );
    lines.push(
      `  异常责任：${
        consequences.length
          ? consequences
              .slice(0, 3)
              .map((f) => `${brief(f.trigger!, 40)} → ${name(f.candidateRef)}`)
              .join('；')
          : '尚未记录（不表示不存在）'
      }`,
    );
  }
  if (options.detailed)
    lines.push(
      `来源引用：${[...new Set([...contract.sourceRefs, ...(current?.sourceRefs ?? [])])].join('、')}（发现依据，不是业务批准；材料新鲜度由定稿检查核对）`,
      '候选详细说明：',
      ...candidateDescriptionLines(snapshot, [
        contract.contextRef,
        ...contract.roleRefs,
        ...contract.fulfillments.map((item) => item.candidateRef),
      ]),
    );
  lines.push(questionLine, ...resolutionLines);
  return lines;
}
