import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { Value } from 'typebox/value';
import {
  DiscoveryContentSchema,
  DiscoverySnapshotSchema,
  DiscoveryEntrySchema,
  DiscoverySubmissionSchema,
  type DiscoveryEntry,
  type DiscoveryEvent,
  type DiscoverySubmission,
  type DiscussionTarget,
  type DiscoveryAnswer,
  type DiscoveryContent,
  type DiscoveryQuestion,
  type DiscoverySnapshot,
} from './discovery-schema.ts';
import {
  appendHistory,
  appendTextAtomic,
  readText,
  relativeProjectPath,
  REQUIREMENTS_PATH,
  saveState,
  writeJsonAtomic,
} from './storage.ts';
import { emptyDiscovery, projectDiscovery } from './discovery-ledger.ts';
import type { EvidenceState } from './types.ts';
import {
  activeResolution,
  duplicateQuestion,
  latestAnswer,
  pendingQuestions,
  unansweredQuestions,
  unresolvedBlockingQuestions,
} from './discovery-questions.ts';
import {
  assertResolutionSelectionFresh,
  markChangedResolutionSources,
  validateResolutionRecords,
} from './discovery-resolutions.ts';
export {
  activeResolution,
  latestAnswer,
  pendingQuestions,
  unansweredQuestions,
  unresolvedBlockingQuestions,
} from './discovery-questions.ts';

const locks = new Map<string, Promise<void>>();
export async function withModelingLock<T>(
  root: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = resolve(root);
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const tail = previous.then(() => held);
  locks.set(key, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export function digestText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function discoveryPath(
  state: EvidenceState,
  revision = state.discovery.revision,
): string {
  return `artifacts/02-modeling/discovery/${state.runId}/revision-${revision}.json`;
}

export function discoveryEvidencePaths(state: EvidenceState): string[] {
  return Array.from({ length: state.discovery.revision }, (_, i) =>
    discoveryPath(state, i + 1),
  );
}

export async function loadDiscoveryEntries(
  root: string,
  state: EvidenceState,
): Promise<DiscoveryEntry[]> {
  if (!state.discovery.path) {
    if (state.discovery.revision !== 0 || state.discovery.digest !== null)
      throw new Error('发现记录路径与当前运行不一致');
    return [];
  }
  if (state.discovery.path !== discoveryPath(state))
    throw new Error('发现记录路径与当前运行不一致');
  const entries: DiscoveryEntry[] = [];
  let digest = state.discovery.digest;
  for (let revision = state.discovery.revision; revision > 0; revision--) {
    const raw = await readText(root, discoveryPath(state, revision));
    if (digestText(raw) !== digest)
      throw new Error('发现记录摘要不一致，请恢复记录或重新初始化');
    let entry: unknown;
    try {
      entry = JSON.parse(raw);
    } catch {
      throw new Error('发现记录不是有效 JSON');
    }
    if (
      entry &&
      typeof entry === 'object' &&
      'version' in entry &&
      entry.version !== 4
    )
      throw new Error('仅支持发现记录 v4，不迁移旧快照；请由人工重新初始化');
    if (
      !Value.Check(DiscoveryEntrySchema, entry) ||
      entry.runId !== state.runId ||
      entry.revision !== revision
    )
      throw new Error('发现记录结构或运行版本不一致');
    entries.push(entry);
    digest = entry.previousDigest;
  }
  if (digest !== null) throw new Error('发现历史链起点无效');
  return entries.reverse();
}

export async function loadDiscovery(
  root: string,
  state: EvidenceState,
): Promise<DiscoverySnapshot> {
  const entries = await loadDiscoveryEntries(root, state);
  const snapshot = entries.length
    ? projectDiscovery(state.runId, entries)
    : emptyDiscovery(state.runId);
  if (!Value.Check(DiscoverySnapshotSchema, snapshot))
    throw new Error('发现投影超限或格式无效');
  await markChangedResolutionSources(root, snapshot);
  return snapshot;
}

export function discoveryViewPath(state: EvidenceState): string {
  return `.evidence/cache/discovery/${state.runId}/current.json`;
}

// One disposable read cache, never a business source or a Gate input. All
// validation/recovery replays the journal, ignoring any cached bytes.
export async function refreshDiscoveryView(
  root: string,
  state: EvidenceState,
  snapshot?: DiscoverySnapshot,
): Promise<DiscoverySnapshot> {
  const view = snapshot ?? (await loadDiscovery(root, state));
  await writeJsonAtomic(root, discoveryViewPath(state), {
    kind: 'derived-discovery-view',
    journalPath: state.discovery.path,
    journalDigest: state.discovery.digest,
    ...view,
  });
  return view;
}

export function assertDiscoveryRevision(
  state: EvidenceState,
  expectedRevision: number,
): void {
  if (state.phase !== 'modeling' || state.paused)
    throw new Error('当前不是活动的 Modeling 阶段');
  if (state.discovery.revision !== expectedRevision)
    throw new Error('发现版本已改变，请重新读取后操作');
}

export function reopenDiscovery(state: EvidenceState): void {
  state.discovery.stage = 'discovering';
  state.currentArtifactIndex = 0;
  state.pendingGate = null;
  state.modeling.applicable = null;
  state.modeling.rationale = null;
  state.modeling.machineValidated = false;
  state.modeling.simulationPassed = null;
  state.lastError = null;
  state.lastReport = null;
  state.coding.planDigest = null;
}

export function nextDiscoveryEntry(
  state: EvidenceState,
  event: DiscoveryEvent,
): DiscoveryEntry {
  return {
    version: 4,
    runId: state.runId,
    revision: state.discovery.revision + 1,
    previousDigest: state.discovery.digest,
    recordedAt: new Date().toISOString(),
    event,
  };
}

export async function appendDiscoveryEvent(
  root: string,
  state: EvidenceState,
  event: DiscoveryEvent,
): Promise<void> {
  const entry = nextDiscoveryEntry(state, event);
  if (!Value.Check(DiscoveryEntrySchema, entry))
    throw new Error('发现记录超限或格式无效，未保存');
  const snapshot = projectDiscovery(state.runId, [
    ...(await loadDiscoveryEntries(root, state)),
    entry,
  ]);
  if (!Value.Check(DiscoverySnapshotSchema, snapshot))
    throw new Error('发现投影超限或格式无效，未保存');
  await markChangedResolutionSources(root, snapshot);
  const text = `${JSON.stringify(entry, null, 2)}\n`;
  const path = discoveryPath(state, entry.revision);
  await appendTextAtomic(root, path, text);
  state.discovery = {
    ...state.discovery,
    revision: entry.revision,
    path,
    digest: digestText(text),
  };
  appendHistory(
    state,
    'discovery_appended',
    `${entry.revision}: ${event.kind}`,
  );
  await saveState(root, state);
  await refreshDiscoveryView(root, state, snapshot);
}

// Called only by manual commands, never exposed as an agent tool or an answer source.
export async function controlDiscoveryInteraction(
  root: string,
  state: EvidenceState,
  action: 'finish' | 'resume' | 'skip',
  questionId?: string,
): Promise<void> {
  if (
    state.phase !== 'modeling' ||
    state.paused ||
    state.status === 'running' ||
    state.discovery.stage !== 'discovering'
  )
    throw new Error('请在未暂停且空闲的 Modeling 发现阶段操作');
  const snapshot = await loadDiscovery(root, state);
  const interaction = snapshot.interaction;
  if (action === 'resume' || action === 'skip')
    await assertResolutionSelectionFresh(
      root,
      snapshot,
      action === 'skip' ? questionId : undefined,
    );
  if (action === 'skip') {
    if (
      !questionId ||
      !unansweredQuestions(snapshot).some((q) => q.id === questionId)
    )
      throw new Error('只能暂缓尚未回答的问题；更正请记录真实回答');
    interaction.deferredQuestionIds = [
      ...new Set([...interaction.deferredQuestionIds, questionId]),
    ];
    interaction.activeQuestionId = null;
    interaction.needsConsolidation = true;
  } else {
    interaction.stopped = action === 'finish';
    if (action === 'resume') {
      interaction.deferredQuestionIds = [];
      if (interaction.needsConsolidation) interaction.activeQuestionId = null;
      else
        interaction.activeQuestionId =
          unansweredQuestions(snapshot)[0]?.id ?? null;
    }
  }
  snapshot.interaction = interaction;
  snapshot.draft = null;
  reopenDiscovery(state);
  state.status = pendingQuestions(snapshot).length ? 'waiting_answer' : 'ready';
  appendHistory(
    state,
    'discovery_interaction',
    `manual:${action}${questionId ? `:${questionId}` : ''}`,
  );
  await appendDiscoveryEvent(root, state, {
    kind: 'interaction',
    action,
    questionId: questionId ?? null,
  });
}

export async function askQuestions(
  root: string,
  state: EvidenceState,
  questions: DiscoveryQuestion[],
): Promise<void> {
  const snapshot = await loadDiscovery(root, state);
  if (snapshot.interaction.stopped)
    throw new Error(
      '人工已结束本轮问答；仅整理已有信息。由人工运行 /evidence-discovery resume 后才能重新提问',
    );
  if (questions.length !== 1)
    throw new Error('每次只提出一个核心问题；不要将多个问题塞进一题');
  assertConsolidated(snapshot);
  if (pendingQuestions(snapshot).length)
    throw new Error('仍有待回答问题，请先运行 /evidence-answer');
  const question = questions[0];
  const existing = snapshot.questions.find((q) => q.id === question.id);
  if (existing) {
    await assertResolutionSelectionFresh(root, snapshot, question.id);
    if (
      latestAnswer(snapshot, question.id) ||
      activeResolution(snapshot, question.id) ||
      snapshot.interaction.deferredQuestionIds.includes(question.id)
    )
      throw new Error('已回答或暂缓的问题不能自动重问；请由人工补充或恢复问答');
    if (
      existing.gapKey !== question.gapKey ||
      existing.focus !== question.focus ||
      existing.prompt !== question.prompt ||
      existing.impact !== question.impact ||
      existing.blocking !== question.blocking ||
      JSON.stringify(existing.sourceRefs) !==
        JSON.stringify(question.sourceRefs) ||
      existing.target?.contractRef !== question.target?.contractRef ||
      existing.target?.fulfillmentRef !== question.target?.fulfillmentRef
    )
      throw new Error('重用历史未答问题必须保持原文；新的缺口使用新 Q-ID');
  } else {
    assertDiscussionTarget(snapshot, question.target);
    if (!question.gapKey)
      throw new Error('新问题须提供稳定 gapKey；先核对已有事实和历史缺口');
    const duplicate = duplicateQuestion(snapshot, question);
    if (duplicate)
      throw new Error(
        `同一业务缺口不得换题号重问：${duplicate.id}；复用已有事实或原 Q-ID，暂缓仍遵守人工控制`,
      );
    if (snapshot.questions.length >= 500)
      throw new Error('单次发现最多 500 个问题');
  }
  validateRefs(snapshot, question.sourceRefs, false);
  assertDiscussionTarget(snapshot, question.target);
  if (!existing) snapshot.questions.push(question);
  snapshot.interaction.activeQuestionId = question.id;
  snapshot.draft = null;
  reopenDiscovery(state);
  state.status = 'waiting_answer';
  await appendDiscoveryEvent(root, state, { kind: 'question', question });
}

export async function answerQuestion(
  root: string,
  state: EvidenceState,
  answer: Omit<DiscoveryAnswer, 'id' | 'recordedAt'>,
): Promise<void> {
  const snapshot = await loadDiscovery(root, state);
  if (!snapshot.questions.some((q) => q.id === answer.questionId))
    throw new Error('问题不存在');
  if (!answer.text.trim() || !answer.respondent.trim())
    throw new Error('回答和回答者不能为空');
  if (snapshot.answers.length >= 2000) throw new Error('回答记录已达上限');
  snapshot.answers.push({
    ...answer,
    id: `A-${String(snapshot.answers.length + 1).padStart(3, '0')}`,
    recordedAt: new Date().toISOString(),
  });
  snapshot.interaction.deferredQuestionIds =
    snapshot.interaction.deferredQuestionIds.filter(
      (id) => id !== answer.questionId,
    );
  snapshot.draft = null;
  snapshot.interaction.activeQuestionId = null;
  snapshot.interaction.needsConsolidation = true;
  reopenDiscovery(state);
  state.status = 'ready';
  const saved = snapshot.answers[snapshot.answers.length - 1];
  const previous = snapshot.answers
    .slice(0, -1)
    .reverse()
    .find((a) => a.questionId === answer.questionId);
  await appendDiscoveryEvent(root, state, {
    kind: 'answer',
    answer: saved,
    supersedes: previous?.id ?? null,
  });
}

export function assertConsolidated(snapshot: DiscoverySnapshot): void {
  if (snapshot.interaction.needsConsolidation)
    throw new Error(
      '先保存消化结果，再决定下一问或执行草稿／定稿校验；回答和跳过不能直接当作已更新的模型',
    );
}

function validateRefs(
  snapshot: DiscoverySnapshot,
  refs: string[],
  explicit: boolean,
): void {
  const sourceIds = new Set(
    snapshot.content?.sources.map((source) => source.id),
  );
  sourceIds.add('INPUT');
  for (const ref of refs) {
    if (sourceIds.has(ref)) continue;
    const answer = snapshot.answers.find((value) => value.id === ref);
    if (!answer || latestAnswer(snapshot, answer.questionId)?.id !== answer.id)
      throw new Error(`来源不存在或回答已被更正：${ref}`);
    if (explicit && answer.status !== 'answered')
      throw new Error(`未知/排除回答不能支持正式事实：${ref}`);
  }
  if (explicit && !refs.length) throw new Error('明确事实和场景预期必须有来源');
}

export function assertDiscussionTarget(
  snapshot: DiscoverySnapshot,
  target: DiscussionTarget,
): void {
  if (target === null) return;
  const contract = snapshot.content?.contractView.contracts.find(
    (c) => c.contextRef === target.contractRef,
  );
  if (
    !contract ||
    (target.fulfillmentRef !== null &&
      !contract.fulfillments.some(
        (f) => f.candidateRef === target.fulfillmentRef,
      ))
  )
    throw new Error('讨论目标必须属于已记录的合同及其履约项');
}

export function assertDiscoveryContracts(snapshot: DiscoverySnapshot): void {
  // Stale resolutions are inactive interpretations, not current business facts.
  // Keep them visible for audit; their unresolved questions remain blockers.
  const staleFacts = snapshot.staleRecordKeys.filter(
    (key) => !key.startsWith('resolution:'),
  );
  if (staleFacts.length)
    throw new Error(
      `当前发现记录依据已失效（来源变化或回答已被更正）：${staleFacts.join('、')}`,
    );
  const view = snapshot.content?.contractView;
  if (!view) return;
  const used = new Set<string>();
  const candidate = (ref: string) => {
    if (used.has(ref)) throw new Error(`合同、角色或履约候选重复占用：${ref}`);
    used.add(ref);
    const value = snapshot.content?.candidates.find((c) => c.id === ref);
    if (!value) throw new Error(`合同视图引用的候选不存在：${ref}`);
    validateRefs(snapshot, value.sourceRefs, value.confidence === 'explicit');
    return value;
  };
  for (const contract of view.contracts) {
    const context = candidate(contract.contextRef);
    validateRefs(
      snapshot,
      contract.sourceRefs,
      context.confidence === 'explicit',
    );
    for (const role of contract.roleRefs) if (role !== null) candidate(role);
    const items = new Map(
      contract.fulfillments.map((f) => [f.candidateRef, f]),
    );
    for (const item of contract.fulfillments) {
      const value = candidate(item.candidateRef);
      validateRefs(snapshot, item.sourceRefs, value.confidence === 'explicit');
      const { rightHolderRef, obligorRef } = item;
      if (rightHolderRef !== null && rightHolderRef === obligorRef)
        throw new Error('履约权利方和义务方不能相同');
      for (const role of [rightHolderRef, obligorRef])
        if (role !== null && !contract.roleRefs.includes(role))
          throw new Error('履约权责方必须属于当前合同双方');
      if ((item.parentFulfillmentRef === null) !== (item.trigger === null))
        throw new Error('异常履约必须同时记录前序履约与触发条件');
      const visited = new Set([item.candidateRef]);
      let parent = item.parentFulfillmentRef;
      while (parent !== null) {
        if (visited.has(parent)) throw new Error('异常履约关系不能循环');
        visited.add(parent);
        const predecessor = items.get(parent);
        if (!predecessor) throw new Error('异常履约的前序项必须属于同一合同');
        parent = predecessor.parentFulfillmentRef;
      }
    }
  }
  assertDiscussionTarget(snapshot, view.current);
}

function allowedSourcePath(path: string): boolean {
  return (
    !path.startsWith('.evidence/') &&
    !path.startsWith('.pi/') &&
    !path.startsWith('reports/') &&
    (!path.startsWith('artifacts/') || path.startsWith('artifacts/00-input/'))
  );
}

async function captureSources(
  root: string,
  sources: DiscoveryContent['sources'],
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`重复来源 ID：${source.id}`);
    ids.add(source.id);
    const path = relativeProjectPath(root, source.path);
    // Evidence-produced documents cannot be recycled as an independent business source.
    if (path !== source.path || !allowedSourcePath(path))
      throw new Error(
        `来源必须是项目内的原始材料，而非模型或报告：${source.path}`,
      );
    const resolvedPath = relativeProjectPath(
      await realpath(root),
      await realpath(resolve(root, path)),
    );
    if (!allowedSourcePath(resolvedPath))
      throw new Error(`来源链接指向受保护记录：${path}`);
    const text = await readText(root, path);
    if (!text.trim()) throw new Error(`来源文件不存在或为空：${path}`);
    hashes[path] = digestText(text);
  }
  const input = await readText(root, REQUIREMENTS_PATH);
  if (!input.trim()) throw new Error('缺少原始输入');
  hashes[REQUIREMENTS_PATH] = digestText(input);
  return hashes;
}

export async function appendDiscoveryRecords(
  root: string,
  state: EvidenceState,
  submission: DiscoverySubmission,
): Promise<void> {
  if (!Value.Check(DiscoverySubmissionSchema, submission))
    throw new Error(
      '发现记录格式无效：提供 summary、sourceRefs 和本轮 records；候选 label 必填（1–40字符、单行、无首尾空白）；不接受完整 content 快照。',
    );
  const entries = await loadDiscoveryEntries(root, state);
  // Capture only explicitly asserted source versions, never silently refresh
  // an unrelated source when appending a note or consolidating an answer.
  const sources = submission.records.flatMap((record) =>
    record.kind === 'source' ? [record.value] : [],
  );
  const event: DiscoveryEvent = {
    kind: 'discovery',
    submission,
    sourceHashes: await captureSources(root, sources),
  };
  const previous = projectDiscovery(state.runId, entries);
  if (previous.sourceHashes[REQUIREMENTS_PATH]) {
    if (
      event.sourceHashes[REQUIREMENTS_PATH] !==
      previous.sourceHashes[REQUIREMENTS_PATH]
    )
      throw new Error(
        '原始输入已变化；不能用无关追加记录重新确认 INPUT，请重新初始化',
      );
    delete event.sourceHashes[REQUIREMENTS_PATH];
  }
  const snapshot = projectDiscovery(state.runId, [
    ...entries,
    nextDiscoveryEntry(state, event),
  ]);
  const content = snapshot.content;
  if (!content) throw new Error('追加记录未形成有效发现视图');
  validateRefs(snapshot, submission.sourceRefs, false);
  await validateResolutionRecords(root, snapshot, submission.records);
  await markChangedResolutionSources(root, snapshot);
  for (const list of [content.candidates, content.cases]) {
    if (new Set(list.map((value) => value.id)).size !== list.length)
      throw new Error('候选或场景 ID 重复');
  }
  for (const candidate of content.candidates)
    validateRefs(
      snapshot,
      candidate.sourceRefs,
      candidate.confidence === 'explicit',
    );
  for (const scenario of content.cases)
    validateRefs(snapshot, scenario.sourceRefs, true);
  assertDiscoveryContracts(snapshot);
  reopenDiscovery(state);
  state.status =
    snapshot.interaction.stopped && unresolvedBlockingQuestions(snapshot).length
      ? 'ready'
      : 'running';
  await appendDiscoveryEvent(root, state, event);
}

export async function assertDiscoveryReady(
  root: string,
  state: EvidenceState,
): Promise<DiscoverySnapshot> {
  const snapshot = await loadDiscovery(root, state);

  if (!snapshot.content || !Object.keys(snapshot.sourceHashes).length)
    throw new Error('尚未保存范围、来源、候选及场景回放记录');
  if (!Value.Check(DiscoveryContentSchema, snapshot.content))
    throw new Error('范围、排除项或工作说明尚不完整，不能定稿');
  assertConsolidated(snapshot);
  assertDiscoveryContracts(snapshot);
  const blockers = unresolvedBlockingQuestions(snapshot);
  if (blockers.length)
    throw new Error(`阻塞问题未解决：${blockers.map((q) => q.id).join('、')}`);
  for (const [path, hash] of Object.entries(snapshot.sourceHashes)) {
    if (digestText(await readText(root, path)) !== hash)
      throw new Error(`原始材料已变化，需要重新发现：${path}`);
  }
  for (const candidate of snapshot.content.candidates) {
    validateRefs(
      snapshot,
      candidate.sourceRefs,
      candidate.confidence === 'explicit',
    );
    if (candidate.confidence !== 'explicit' && candidate.modelRefs.length)
      throw new Error(`未确认候选不能绑定正式模型：${candidate.id}`);
  }
  for (const kind of ['normal', 'boundary', 'exception']) {
    if (!snapshot.content.cases.some((scenario) => scenario.kind === kind))
      throw new Error(`缺少 ${kind} 回放或有依据的不适用说明`);
  }
  for (const scenario of snapshot.content.cases)
    validateRefs(snapshot, scenario.sourceRefs, true);
  return snapshot;
}

export async function finalizeDiscovery(
  root: string,
  state: EvidenceState,
): Promise<void> {
  await assertDiscoveryReady(root, state);
  state.discovery.stage = 'finalizing';
  state.status = 'ready';
  state.currentArtifactIndex = 0;
  appendHistory(state, 'discovery_finalizing', state.discovery.digest ?? '');
  await saveState(root, state);
}

export async function requireFinalizing(
  root: string,
  state: EvidenceState,
): Promise<void> {
  if (state.discovery.stage !== 'finalizing')
    throw new Error(
      '先完成交互发现并调用 evidence_finalize_discovery；不能跳过发现提交工件',
    );
  await assertDiscoveryReady(root, state);
}
