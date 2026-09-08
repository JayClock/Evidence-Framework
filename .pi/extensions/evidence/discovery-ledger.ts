import { isDeepStrictEqual } from 'node:util';
import type {
  DiscoveryContent,
  DiscoveryEntry,
  DiscoveryRecord,
  DiscoverySnapshot,
} from './discovery-schema.ts';
import {
  activeResolution,
  latestAnswer,
  unansweredQuestions,
} from './discovery-questions.ts';

export function emptyDiscovery(runId: string): DiscoverySnapshot {
  return {
    version: 4,
    runId,
    revision: 0,
    previousDigest: null,
    recordedAt: '',
    content: null,
    sourceHashes: {},
    recordHeads: {},
    withdrawnRecordKeys: [],
    staleRecordKeys: [],
    questions: [],
    answers: [],
    questionResolutions: [],
    draft: null,
    interaction: {
      stopped: false,
      activeQuestionId: null,
      needsConsolidation: false,
      deferredQuestionIds: [],
    },
  };
}

export function discoveryRecordId(revision: number, index: number): string {
  return `D-${String(revision).padStart(3, '0')}-${String(index + 1).padStart(3, '0')}`;
}

type Head = {
  ref: string;
  record: Exclude<DiscoveryRecord, { kind: 'withdraw' }>;
  withdrawn: boolean;
  basis: Record<string, string>;
  sourceHash?: string;
  questionAnswerRef?: string | null;
};

function recordKey(record: Head['record'], ref: string): string {
  switch (record.kind) {
    case 'candidate':
    case 'source':
    case 'case':
      return `${record.kind}:${record.value.id}`;
    case 'resolution':
      return `resolution:${record.value.questionId}`;
    case 'contract':
      return `contract:${record.value.contextRef}`;
    case 'fulfillment':
      return `fulfillment:${record.value.contractRef}:${record.value.candidateRef}`;
    case 'note':
      return `note:${ref}`;
    default:
      return record.kind;
  }
}

function appendRecord(
  heads: Map<string, Head>,
  record: DiscoveryRecord,
  ref: string,
): void {
  const previous =
    record.supersedes === null
      ? undefined
      : [...heads.entries()].find(([, head]) => head.ref === record.supersedes);
  if (record.supersedes !== null && !previous)
    throw new Error(
      `更正或撤回必须引用当前记录，不能引用不存在或已被替代的 D-ID：${record.supersedes}`,
    );
  if (record.kind === 'withdraw') {
    if (!previous || previous[1].withdrawn) throw new Error('不能重复撤回记录');
    heads.set(previous[0], { ...previous[1], ref, withdrawn: true });
    return;
  }
  const key =
    record.kind === 'note' && previous ? previous[0] : recordKey(record, ref);
  if (
    previous &&
    (previous[0] !== key || previous[1].record.kind !== record.kind)
  )
    throw new Error('更正不能改变记录的业务身份或类型');
  if (heads.has(key) && !previous)
    throw new Error(`对象已有记录，必须显式 supersedes：${key}`);
  heads.set(key, { ref, record, withdrawn: false, basis: {} });
}

function materializeContent(heads: Map<string, Head>): DiscoveryContent {
  const content: DiscoveryContent = {
    scope: '',
    excludedScope: '',
    focus: 'scope',
    notes: '',
    sources: [],
    candidates: [],
    cases: [],
    contractView: { current: null, contracts: [] },
  };
  const active = [...heads.values()]
    .filter((head) => !head.withdrawn)
    .map((head) => head.record);
  for (const record of active) {
    switch (record.kind) {
      case 'scope':
        Object.assign(content, record.value);
        break;
      case 'position':
        content.focus = record.value.focus;
        content.contractView.current = record.value.current;
        break;
      case 'note':
        content.notes += `${content.notes ? '\n\n' : ''}${record.value}`;
        break;
      case 'source':
        content.sources.push(record.value);
        break;
      case 'candidate':
        content.candidates.push(record.value);
        break;
      case 'case':
        content.cases.push(record.value);
        break;
      case 'contract':
        content.contractView.contracts.push({
          ...record.value,
          fulfillments: [],
        });
        break;
    }
  }
  for (const record of active) {
    if (record.kind !== 'fulfillment') continue;
    const { contractRef, ...fulfillment } = record.value;
    const contract = content.contractView.contracts.find(
      (value) => value.contextRef === contractRef,
    );
    if (!contract)
      throw new Error(
        `履约引用的合同不存在，撤回合同须同时撤回其履约：${contractRef}`,
      );
    contract.fulfillments.push(fulfillment);
  }
  return content;
}

function applyControl(
  snapshot: DiscoverySnapshot,
  event: Extract<DiscoveryEntry['event'], { kind: 'interaction' }>,
): void {
  const interaction = snapshot.interaction;
  if (event.action === 'skip') {
    if (
      !event.questionId ||
      !unansweredQuestions(snapshot).some((q) => q.id === event.questionId)
    )
      throw new Error('只能暂缓尚未回答的问题');
    interaction.deferredQuestionIds = [
      ...new Set([...interaction.deferredQuestionIds, event.questionId]),
    ];
    interaction.activeQuestionId = null;
    interaction.needsConsolidation = true;
  } else {
    if (event.questionId !== null) throw new Error('结束或恢复不能携带问题 ID');
    interaction.stopped = event.action === 'finish';
    if (event.action === 'resume') {
      interaction.deferredQuestionIds = [];
      interaction.activeQuestionId = interaction.needsConsolidation
        ? null
        : (unansweredQuestions(snapshot)[0]?.id ?? null);
    }
  }
}

// Only the journal is persisted. This projection may be discarded and rebuilt.
export function projectDiscovery(
  runId: string,
  entries: DiscoveryEntry[],
): DiscoverySnapshot {
  const snapshot = emptyDiscovery(runId);
  const heads = new Map<string, Head>();
  const hashes: Record<string, string> = {};
  for (const entry of entries) {
    const { event } = entry;
    snapshot.revision = entry.revision;
    snapshot.previousDigest = entry.previousDigest;
    snapshot.recordedAt = entry.recordedAt;
    snapshot.draft = null;
    switch (event.kind) {
      case 'discovery': {
        const added = new Set<string>();
        event.submission.records.forEach((record, i) => {
          const ref = discoveryRecordId(entry.revision, i);
          appendRecord(heads, record, ref);
          added.add(ref);
        });
        // Bind SRC references to the exact assertion version, not merely its
        // reusable business ID. Corrections cannot silently rebase old claims.
        for (const head of heads.values()) {
          if (!added.has(head.ref) || head.withdrawn) continue;
          const value = head.record.value;
          if (head.record.kind === 'source')
            head.sourceHash = event.sourceHashes[head.record.value.path];
          if (head.record.kind === 'resolution') {
            const questionId = head.record.value.questionId;
            if (
              !snapshot.questions.some((question) => question.id === questionId)
            )
              throw new Error(`解决依据引用的问题不存在：${questionId}`);
            head.questionAnswerRef =
              latestAnswer(snapshot, questionId)?.id ?? null;
          }
          const ownRefs =
            typeof value === 'object' && 'sourceRefs' in value
              ? value.sourceRefs
              : [];
          head.basis = Object.fromEntries(
            [...new Set([...event.submission.sourceRefs, ...ownRefs])].map(
              (ref) => [
                ref,
                ref.startsWith('SRC-')
                  ? (heads.get(`source:${ref}`)?.ref ?? '')
                  : ref,
              ],
            ),
          );
        }
        Object.assign(hashes, event.sourceHashes);
        materializeSnapshot(snapshot, heads, hashes);
        if (
          snapshot.interaction.activeQuestionId &&
          activeResolution(snapshot, snapshot.interaction.activeQuestionId)
        )
          snapshot.interaction.activeQuestionId = null;
        snapshot.interaction.needsConsolidation = false;
        break;
      }
      case 'question': {
        const existing = snapshot.questions.find(
          (q) => q.id === event.question.id,
        );
        if (existing && !isDeepStrictEqual(existing, event.question))
          throw new Error('历史问题不可改写');
        if (!existing) snapshot.questions.push(event.question);
        snapshot.interaction.activeQuestionId = event.question.id;
        break;
      }
      case 'answer': {
        const previous = [...snapshot.answers]
          .reverse()
          .find((a) => a.questionId === event.answer.questionId);
        if (
          event.supersedes !== (previous?.id ?? null) ||
          !snapshot.questions.some((q) => q.id === event.answer.questionId) ||
          event.answer.id !==
            `A-${String(snapshot.answers.length + 1).padStart(3, '0')}`
        )
          throw new Error('回答引用或更正链无效');
        snapshot.answers.push(event.answer);
        snapshot.interaction.deferredQuestionIds =
          snapshot.interaction.deferredQuestionIds.filter(
            (id) => id !== event.answer.questionId,
          );
        snapshot.interaction.activeQuestionId = null;
        snapshot.interaction.needsConsolidation = true;
        break;
      }
      case 'interaction':
        materializeSnapshot(snapshot, heads, hashes);
        applyControl(snapshot, event);
        break;
      case 'draft':
        snapshot.draft = event.result;
        break;
    }
  }
  materializeSnapshot(snapshot, heads, hashes);
  if (
    snapshot.interaction.activeQuestionId &&
    activeResolution(snapshot, snapshot.interaction.activeQuestionId)
  )
    snapshot.interaction.activeQuestionId = null;
  return structuredClone(snapshot);
}

function materializeSnapshot(
  snapshot: DiscoverySnapshot,
  heads: Map<string, Head>,
  hashes: Record<string, string>,
): void {
  if (heads.size) snapshot.content = materializeContent(heads);
  snapshot.questionResolutions = [...heads.values()].flatMap((head) =>
    !head.withdrawn && head.record.kind === 'resolution'
      ? [head.record.value]
      : [],
  );
  snapshot.recordHeads = Object.fromEntries(
    [...heads].map(([key, head]) => [key, head.ref]),
  );
  snapshot.withdrawnRecordKeys = [...heads]
    .filter(([, head]) => head.withdrawn)
    .map(([key]) => key);
  const latestAnswers = new Map(
    snapshot.answers.map((answer) => [answer.questionId, answer.id]),
  );
  snapshot.staleRecordKeys = [...heads]
    .filter(
      ([, head]) =>
        !head.withdrawn &&
        ((head.record.kind === 'source' &&
          head.sourceHash !== hashes[head.record.value.path]) ||
          (head.record.kind === 'resolution' &&
            head.questionAnswerRef !==
              (latestAnswer(snapshot, head.record.value.questionId)?.id ??
                null)) ||
          Object.entries(head.basis).some(([ref, version]) => {
            if (ref.startsWith('SRC-')) {
              const source = heads.get(`source:${ref}`);
              return (
                !source ||
                source.withdrawn ||
                source.ref !== version ||
                (source.record.kind === 'source' &&
                  source.sourceHash !== hashes[source.record.value.path])
              );
            }
            if (ref.startsWith('A-')) {
              const answer = snapshot.answers.find((a) => a.id === ref);
              return !answer || latestAnswers.get(answer.questionId) !== ref;
            }
            return ref !== 'INPUT';
          })),
    )
    .map(([key]) => key);
  const paths = new Set([
    'artifacts/00-input/requirements.md',
    ...(snapshot.content?.sources.map((s) => s.path) ?? []),
  ]);
  snapshot.sourceHashes = Object.fromEntries(
    Object.entries(hashes).filter(([path]) => paths.has(path)),
  );
}
