import { stripVTControlCharacters } from 'node:util';
import type {
  DiscoverySnapshot,
  DiscussionTarget,
} from './discovery-schema.ts';
import {
  assertDiscoveryContracts,
  assertDiscussionTarget,
  loadDiscovery,
  pendingQuestions,
} from './discovery.ts';
import type { EvidenceState } from './types.ts';

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

function describe(snapshot: DiscoverySnapshot, ref: string | null): string {
  if (ref === null) return '待明确';
  const candidate = snapshot.content?.candidates.find((c) => c.id === ref);
  if (!candidate) return '待重新核对';
  const mark = { inferred: '（候选）', unknown: '（待明确）', explicit: '' }[
    candidate.confidence
  ];
  return `${brief(candidate.description, 40)}${mark}`;
}

export function questionLabel(
  snapshot: DiscoverySnapshot,
  questionId: string,
): string {
  const question = snapshot.questions.find((q) => q.id === questionId);
  if (!question) return questionId;
  try {
    assertDiscoveryContracts(snapshot);
    assertDiscussionTarget(snapshot, question.target);
  } catch {
    return `${question.id} [原合同待核对] ${brief(question.prompt)}`;
  }
  let path = '';
  if (question.target) {
    const parts = [describe(snapshot, question.target.contractRef)];
    if (question.target.fulfillmentRef)
      parts.push(describe(snapshot, question.target.fulfillmentRef));
    path = `${parts.join(' › ')} · `;
  }
  return `${question.id} ${path}${brief(question.prompt)}`;
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
  try {
    assertDiscoveryContracts(snapshot);
    assertDiscussionTarget(snapshot, target);
  } catch {
    return ['合同关系：依据或引用已失效，待重新核对', questionLine];
  }
  if (target === null)
    return [
      '合同上下文：待明确（不为领域或签约前讨论补造合同）',
      '双方角色：待明确',
      '当前展开：未选择履约项',
      questionLine,
    ];
  const contract = snapshot.content!.contractView.contracts.find(
    (c) => c.contextRef === target.contractRef,
  )!;
  const current = contract.fulfillments.find(
    (f) => f.candidateRef === target.fulfillmentRef,
  );
  const name = (ref: string | null) => describe(snapshot, ref);
  const lines = [
    `合同上下文：${name(contract.contextRef)}`,
    `双方角色：${contract.roleRefs.map(name).join(' ↔ ')}`,
    '履约权责（权利方 → 义务方）：',
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
      `${marker} ${branch}${name(item.rightHolderRef)} ── ${name(item.candidateRef)} ──▶ ${name(item.obligorRef)}`,
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
    lines.push(
      `  请求依据：${current.request === null ? '待明确' : brief(current.request)}`,
    );
    lines.push(
      `  履约期限：${current.deadline === null ? '待明确' : brief(current.deadline)}`,
    );
    lines.push(
      `  确认依据：${current.confirmation === null ? '待明确' : brief(current.confirmation)}`,
    );
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
    );
  lines.push(questionLine);
  return lines;
}

export async function loadContractView(
  root: string,
  state: EvidenceState,
  detailed = false,
): Promise<string[]> {
  if (state.phase !== 'modeling') return [];
  try {
    return contractViewLines(await loadDiscovery(root, state), { detailed });
  } catch (error) {
    return [
      `合同视图不可用：${brief(error instanceof Error ? error.message : String(error))}`,
    ];
  }
}
