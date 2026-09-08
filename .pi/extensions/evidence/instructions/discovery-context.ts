import {
  latestAnswer,
  unresolvedBlockingQuestions,
} from '../modeling/discovery/questions.ts';
import type {
  DiscoveryEntry,
  DiscoverySnapshot,
  DiscussionTarget,
} from '../modeling/discovery/schema.ts';
import { discoveryPath, discoveryViewPath } from '../state/discovery/index.ts';
import { writeTextAtomic } from '../storage.ts';
import type { EvidenceState } from '../types.ts';

export const DISCOVERY_PACKET_LIMIT = 14000;
export type ReadRange = { path: string; offset: number; limit: number };
type Detail = { key: string; label?: string; value: unknown };
export type DiscoveryContext = {
  detailsPath: string;
  ranges: Map<string, ReadRange>;
  pending: DiscoveryEntry[];
  pendingRange: ReadRange;
  catalog: ReadRange;
  target: DiscussionTarget;
  candidateIds: string[];
};

export function discoveryDetailsPath(state: EvidenceState): string {
  return discoveryViewPath(state).replace(
    /current\.json$/,
    'context-details.md',
  );
}

export function clipContext(text: string, max: number): string {
  return text.length <= max
    ? text
    : `${text.slice(0, Math.max(0, max - 12))}…[已截短，见原文]`;
}

export function readHint(range: ReadRange | undefined): string {
  if (!range) return '尚无记录';
  return `read(path=${JSON.stringify(range.path)}, offset=${range.offset}, limit=${Math.min(range.limit, 40)})；完整范围 ${range.offset}–${range.offset + range.limit - 1} 行，未读完时继续分页`;
}

function pendingInputs(
  entries: DiscoveryEntry[],
  snapshot: DiscoverySnapshot,
): DiscoveryEntry[] {
  let after = 0;
  entries.forEach((entry, index) => {
    if (entry.event.kind === 'discovery') after = index + 1;
  });
  return entries.slice(after).filter((entry) => {
    const event = entry.event;
    return (
      event.kind === 'interaction' ||
      (event.kind === 'answer' &&
        latestAnswer(snapshot, event.answer.questionId)?.id === event.answer.id)
    );
  });
}

function inputQuestionId(entry: DiscoveryEntry): string | null {
  if (entry.event.kind === 'answer') return entry.event.answer.questionId;
  if (entry.event.kind === 'interaction') return entry.event.questionId;
  return null;
}

function selectContext(
  snapshot: DiscoverySnapshot,
  pending: DiscoveryEntry[],
): Pick<DiscoveryContext, 'target' | 'candidateIds'> {
  const questionId =
    pending
      .map(inputQuestionId)
      .filter((id) => id !== null)
      .at(-1) ?? snapshot.interaction.activeQuestionId;
  const question = snapshot.questions.find((q) => q.id === questionId);
  // A null question target is meaningful: do not reuse a different contract cursor.
  const target = question
    ? question.target
    : (snapshot.content?.contractView.current ?? null);
  const contract = snapshot.content?.contractView.contracts.find(
    (c) => c.contextRef === target?.contractRef,
  );
  if (contract) {
    const item = contract.fulfillments.find(
      (f) => f.candidateRef === target?.fulfillmentRef,
    );
    return {
      target,
      candidateIds: [
        ...new Set([
          contract.contextRef,
          ...contract.roleRefs.filter((ref) => ref !== null),
          ...(item
            ? [
                item.candidateRef,
                ...(item.parentFulfillmentRef
                  ? [item.parentFulfillmentRef]
                  : []),
              ]
            : []),
        ]),
      ],
    };
  }
  // Domain/channel have no contract target. Prefer candidates affected by pending
  // answer sources, then recently asserted candidates. No name/keyword guessing.
  const answerRefs = new Set(
    pending.flatMap((entry) =>
      entry.event.kind === 'answer' ? [entry.event.answer.id] : [],
    ),
  );
  const recent = [...(snapshot.content?.candidates ?? [])].sort((a, b) => {
    const score = (id: string) =>
      Number(snapshot.recordHeads[`candidate:${id}`]?.split('-')[1] ?? 0);
    return score(b.id) - score(a.id);
  });
  const related = recent.filter((candidate) =>
    candidate.sourceRefs.some((ref) => answerRefs.has(ref)),
  );
  return {
    target,
    candidateIds: [...new Set([...related, ...recent].map((c) => c.id))].slice(
      0,
      5,
    ),
  };
}

function detailItems(
  state: EvidenceState,
  snapshot: DiscoverySnapshot,
  pending: DiscoveryEntry[],
): Detail[] {
  const content = snapshot.content;
  const versioned = (key: string, value: unknown, label?: string): Detail => ({
    key,
    label,
    value: {
      recordRef: snapshot.recordHeads[key] ?? null,
      stale: snapshot.staleRecordKeys.includes(key),
      value,
    },
  });
  const items: Detail[] = pending.map((entry) => {
    const questionId = inputQuestionId(entry);
    return {
      key: `input:${entry.revision}`,
      value: {
        journalPath: discoveryPath(state, entry.revision),
        event: entry.event,
        question: snapshot.questions.find((q) => q.id === questionId) ?? null,
      },
    };
  });
  items.push(
    versioned('scope', {
      scope: content?.scope ?? '',
      excludedScope: content?.excludedScope ?? '',
    }),
  );
  items.push(
    versioned('position', {
      focus: content?.focus ?? 'scope',
      current: content?.contractView.current ?? null,
    }),
  );
  items.push({ key: 'feedback', value: chunkedText(state.feedback ?? '') });
  for (const candidate of content?.candidates ?? [])
    items.push(
      versioned(`candidate:${candidate.id}`, candidate, candidate.label),
    );
  for (const contract of content?.contractView.contracts ?? []) {
    const { fulfillments, ...header } = contract;
    items.push(
      versioned(`contract:${contract.contextRef}`, {
        ...header,
        fulfillmentIds: fulfillments.map((f) => f.candidateRef),
      }),
    );
    for (const item of fulfillments)
      items.push(
        versioned(`fulfillment:${contract.contextRef}:${item.candidateRef}`, {
          contractRef: contract.contextRef,
          ...item,
        }),
      );
  }
  for (const scenario of content?.cases ?? [])
    items.push(versioned(`case:${scenario.id}`, scenario));
  for (const source of content?.sources ?? [])
    items.push(versioned(`source:${source.id}`, source));
  for (const question of snapshot.questions)
    items.push({ key: `question:${question.id}`, value: question });
  for (const resolution of snapshot.questionResolutions)
    items.push(versioned(`resolution:${resolution.questionId}`, resolution));
  for (const answer of snapshot.answers)
    items.push({
      key: `answer:${answer.id}`,
      value: {
        ...answer,
        current: latestAnswer(snapshot, answer.questionId)?.id === answer.id,
      },
    });
  items.push({
    key: 'gaps',
    value: {
      blocking: unresolvedBlockingQuestions(snapshot).map((q) => q.id),
      questions: snapshot.questions.map((q) => ({
        id: q.id,
        gapKey: q.gapKey ?? null,
        target: q.target,
      })),
      resolutions: snapshot.questionResolutions.map((value) => ({
        questionId: value.questionId,
        recordRef: snapshot.recordHeads[`resolution:${value.questionId}`],
        stale: snapshot.staleRecordKeys.includes(
          `resolution:${value.questionId}`,
        ),
        sourceRefs: value.sourceRefs,
      })),
      deferred: snapshot.interaction.deferredQuestionIds,
      staleRecordKeys: snapshot.staleRecordKeys,
      withdrawnRecordKeys: snapshot.withdrawnRecordKeys,
    },
  });
  // Split aggregate notes into readable lines without losing a single character.
  items.push({
    key: 'notes',
    value: {
      ...chunkedText(content?.notes ?? ''),
      correction: '更正具体 note 须按 recordHeads 的 D-ID 回读日志',
      recordHeads: Object.fromEntries(
        Object.entries(snapshot.recordHeads).filter(([key]) =>
          key.startsWith('note:'),
        ),
      ),
    },
  });
  return items;
}

function chunkedText(text: string) {
  return {
    encoding: 'textChunks 按顺序无分隔拼接，还原完整原文',
    textChunks: text.match(/[\s\S]{1,2000}/g) ?? [],
  };
}

// Disposable, line-indexed details let the existing read tool fetch one object,
// instead of repeatedly loading current.json or the entire journal into the LLM.
export async function prepareDiscoveryContext(
  root: string,
  state: EvidenceState,
  snapshot: DiscoverySnapshot,
  entries: DiscoveryEntry[],
): Promise<DiscoveryContext> {
  const pending = pendingInputs(entries, snapshot);
  const detailsPath = discoveryDetailsPath(state);
  const lines = [
    `# 发现视图明细（派生缓存，非业务来源）`,
    `runId=${state.runId}; revision=${snapshot.revision}; digest=${state.discovery.digest}`,
    '',
  ];
  const ranges = new Map<string, ReadRange>();
  const items = detailItems(state, snapshot, pending);
  const catalog: Array<{
    key: string;
    label?: string;
    offset: number;
    limit: number;
  }> = [];
  for (const item of items) {
    lines.push(`## ${item.key}`);
    const offset = lines.length + 1;
    const body = JSON.stringify(item.value, null, 2).split('\n');
    lines.push(...body, '');
    ranges.set(item.key, { path: detailsPath, offset, limit: body.length });
    catalog.push({
      key: item.key,
      label: item.label,
      offset,
      limit: body.length,
    });
  }
  const firstPending = ranges.get(`input:${pending[0]?.revision}`);
  const lastPending = ranges.get(`input:${pending.at(-1)?.revision}`);
  lines.push('## catalog');
  const indexOffset = lines.length + 1;
  const indexLines = JSON.stringify(catalog, null, 2).split('\n');
  lines.push(...indexLines);
  await writeTextAtomic(root, detailsPath, `${lines.join('\n')}\n`);
  return {
    detailsPath,
    ranges,
    pending,
    pendingRange:
      firstPending && lastPending
        ? {
            ...firstPending,
            limit: lastPending.offset + lastPending.limit - firstPending.offset,
          }
        : { path: detailsPath, offset: 1, limit: 2 },
    catalog: {
      path: detailsPath,
      offset: indexOffset,
      limit: indexLines.length,
    },
    ...selectContext(snapshot, pending),
  };
}

export function inputContextLines(
  context: DiscoveryContext,
  snapshot: DiscoverySnapshot,
): string {
  let remaining = 4800;
  let omitted = 0;
  const rows: string[] = [];
  for (const entry of context.pending) {
    const event = entry.event;
    const question = snapshot.questions.find(
      (q) => q.id === inputQuestionId(entry),
    );
    const text = `${question ? `${question.id}：${clipContext(question.prompt, 400)}\n` : ''}${JSON.stringify(event)}`;
    const hint = readHint(context.ranges.get(`input:${entry.revision}`));
    if (text.length + hint.length + 2 > remaining) {
      omitted++;
      continue;
    }
    rows.push(`${text}\n${hint}`);
    remaining -= text.length + hint.length + 2;
  }
  if (!context.pending.length)
    return '无待消化的新人工输入；不要重读所有历史回答。';
  if (omitted)
    rows.push(
      `尚有 ${omitted} 项未内嵌，不代表已消化。必须读取全部遗漏新输入后再保存：${readHint(context.pendingRange)}`,
    );
  return rows.join('\n');
}

export function candidateContextLines(
  snapshot: DiscoverySnapshot,
  context: DiscoveryContext,
): string {
  const rows: string[] = [];
  for (const id of context.candidateIds) {
    const candidate = snapshot.content?.candidates.find((c) => c.id === id);
    if (!candidate) continue;
    const key = `candidate:${id}`;
    rows.push(
      `${id} ${candidate.label} [${candidate.confidence}${snapshot.staleRecordKeys.includes(key) ? '；依据失效' : ''}] ${snapshot.recordHeads[key]}\n${clipContext(candidate.description, 420)}\n来源：${clipContext(candidate.sourceRefs.join('、'), 200)}\n${readHint(context.ranges.get(key))}`,
    );
  }
  if (context.target?.fulfillmentRef) {
    const key = `fulfillment:${context.target.contractRef}:${context.target.fulfillmentRef}`;
    const contract = snapshot.content?.contractView.contracts.find(
      (c) => c.contextRef === context.target?.contractRef,
    );
    const item = contract?.fulfillments.find(
      (f) => f.candidateRef === context.target?.fulfillmentRef,
    );
    const label = (id: string | null) =>
      snapshot.content?.candidates.find((c) => c.id === id)?.label ?? '待明确';
    if (item)
      rows.unshift(
        `${key} ${snapshot.recordHeads[key]}${snapshot.staleRecordKeys.includes(key) ? '；依据失效' : ''}\n当前展开：${label(item.candidateRef)}\n履约请求：${label(item.rightHolderRef)} → ${label(item.obligorRef)}\n要求／依据：${clipContext(item.request ?? '待明确', 420)}\n期限：${clipContext(item.deadline ?? '待明确', 260)}\n履约确认凭证：${clipContext(item.confirmation ?? '待明确', 420)}\n前序：${item.parentFulfillmentRef ?? '无'}；触发：${clipContext(item.trigger ?? '无', 200)}\n来源：${clipContext(item.sourceRefs.join('、'), 200)}\n${readHint(context.ranges.get(key))}`,
      );
  }
  return (
    boundedContextRows(rows, 3600) ||
    '尚无可定位的候选；不为填充上下文而编造合同或对象。'
  );
}

export function boundedContextRows(rows: string[], limit: number): string {
  const kept: string[] = [];
  let size = 0;
  for (const row of rows) {
    if (size + row.length + 2 > limit - 80) continue;
    kept.push(row);
    size += row.length + 2;
  }
  if (kept.length < rows.length)
    kept.push(
      `另有 ${rows.length - kept.length} 项未内嵌，按明细索引读取；遗漏不表示无此对象或缺口。`,
    );
  return kept.join('\n\n');
}
