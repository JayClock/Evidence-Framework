import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { realpath } from 'node:fs/promises';
import { Value } from 'typebox/value';
import {
  DiscoverySnapshotSchema,
  type DiscussionTarget,
  type DiscoveryAnswer,
  type DiscoveryContent,
  type DiscoveryQuestion,
  type DiscoverySnapshot,
} from './discovery-schema.ts';
import {
  appendHistory,
  projectEntryExists,
  readText,
  relativeProjectPath,
  REQUIREMENTS_PATH,
  saveState,
  writeTextAtomic,
} from './storage.ts';
import type { EvidenceState } from './types.ts';

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

export async function loadDiscovery(
  root: string,
  state: EvidenceState,
): Promise<DiscoverySnapshot> {
  if (!state.discovery.path) {
    return {
      version: 3,
      runId: state.runId,
      revision: 0,
      previousDigest: null,
      content: null,
      sourceHashes: {},
      questions: [],
      answers: [],
      interaction: {
        stopped: false,
        deferredQuestionIds: [],
        activeQuestionId: null,
        needsConsolidation: false,
      },
      draft: null,
      recordedAt: '',
    };
  }
  if (state.discovery.path !== discoveryPath(state))
    throw new Error('发现记录路径与当前运行不一致');
  const raw = await readText(root, state.discovery.path);
  if (digestText(raw) !== state.discovery.digest)
    throw new Error('发现记录摘要不一致，请恢复记录或重新初始化');
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(raw);
  } catch {
    throw new Error('发现快照不是有效 JSON');
  }
  if (
    snapshot &&
    typeof snapshot === 'object' &&
    'version' in snapshot &&
    snapshot.version !== 3
  )
    throw new Error(
      '仅支持发现快照 v3，不迁移旧快照；请先备份，再由人工 /evidence-reset 并 /evidence-init',
    );
  if (
    !Value.Check(DiscoverySnapshotSchema, snapshot) ||
    snapshot.runId !== state.runId ||
    snapshot.revision !== state.discovery.revision
  )
    throw new Error('发现记录结构或运行版本不一致');
  return snapshot;
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

export async function persistDiscovery(
  root: string,
  state: EvidenceState,
  snapshot: DiscoverySnapshot,
): Promise<void> {
  const revision = state.discovery.revision + 1;
  snapshot.revision = revision;
  snapshot.previousDigest = state.discovery.digest;
  snapshot.recordedAt = new Date().toISOString();
  if (!Value.Check(DiscoverySnapshotSchema, snapshot))
    throw new Error('发现内容超限或格式无效，未保存；请缩小文本/问题数量');
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const path = discoveryPath(state, revision);
  // A crash after writing a snapshot but before the pointer must not overwrite history.
  if (await projectEntryExists(root, path))
    throw new Error('发现快照已存在，请人工检查中断记录；不会覆盖历史');
  await writeTextAtomic(root, path, text);
  state.discovery = {
    ...state.discovery,
    revision,
    path,
    digest: digestText(text),
  };
  appendHistory(
    state,
    'discovery_saved',
    `${revision}: ${snapshot.content?.focus ?? 'scope'}`,
  );
  await saveState(root, state);
}

export function latestAnswer(
  snapshot: DiscoverySnapshot,
  questionId: string,
): DiscoveryAnswer | undefined {
  return [...snapshot.answers]
    .reverse()
    .find((answer) => answer.questionId === questionId);
}

export function unansweredQuestions(
  snapshot: DiscoverySnapshot,
): DiscoveryQuestion[] {
  return snapshot.questions.filter(
    (question) => !latestAnswer(snapshot, question.id),
  );
}

// Waiting for input and unresolved business knowledge are deliberately separate.
export function pendingQuestions(
  snapshot: DiscoverySnapshot,
): DiscoveryQuestion[] {
  if (snapshot.interaction.stopped || snapshot.interaction.needsConsolidation)
    return [];
  const active = snapshot.interaction.activeQuestionId;
  const deferred = new Set(snapshot.interaction.deferredQuestionIds);
  return unansweredQuestions(snapshot).filter(
    (question) => !deferred.has(question.id) && active === question.id,
  );
}

export function unresolvedBlockingQuestions(
  snapshot: DiscoverySnapshot,
): DiscoveryQuestion[] {
  return snapshot.questions.filter((question) => {
    const answer = latestAnswer(snapshot, question.id);
    return question.blocking && (!answer || answer.status === 'unknown');
  });
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
  await persistDiscovery(root, state, snapshot);
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
    if (
      latestAnswer(snapshot, question.id) ||
      snapshot.interaction.deferredQuestionIds.includes(question.id)
    )
      throw new Error('已回答或暂缓的问题不能自动重问；请由人工补充或恢复问答');
    if (
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
  } else if (snapshot.questions.length >= 500)
    throw new Error('单次发现最多 500 个问题');
  validateRefs(snapshot, question.sourceRefs, false);
  assertDiscussionTarget(snapshot, question.target);
  if (!existing) snapshot.questions.push(question);
  snapshot.interaction.activeQuestionId = question.id;
  snapshot.draft = null;
  reopenDiscovery(state);
  state.status = 'waiting_answer';
  await persistDiscovery(root, state, snapshot);
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
  await persistDiscovery(root, state, snapshot);
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
  content: DiscoveryContent,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  const ids = new Set<string>();
  for (const source of content.sources) {
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

export async function saveDiscoveryContent(
  root: string,
  state: EvidenceState,
  content: DiscoveryContent,
): Promise<void> {
  const snapshot = await loadDiscovery(root, state);
  snapshot.content = content;
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
  snapshot.sourceHashes = await captureSources(root, content);
  snapshot.interaction.needsConsolidation = false;
  snapshot.draft = null;
  reopenDiscovery(state);
  state.status =
    snapshot.interaction.stopped && unresolvedBlockingQuestions(snapshot).length
      ? 'ready'
      : 'running';
  await persistDiscovery(root, state, snapshot);
}

export async function assertDiscoveryReady(
  root: string,
  state: EvidenceState,
): Promise<DiscoverySnapshot> {
  const snapshot = await loadDiscovery(root, state);
  let predecessor = snapshot.previousDigest;
  for (
    let revision = state.discovery.revision - 1;
    revision > 0;
    revision -= 1
  ) {
    const historical = await loadDiscovery(root, {
      ...state,
      discovery: {
        ...state.discovery,
        revision,
        path: discoveryPath(state, revision),
        digest: predecessor,
      },
    });
    predecessor = historical.previousDigest;
  }
  if (predecessor !== null) throw new Error('发现历史链起点无效');
  if (!snapshot.content || !Object.keys(snapshot.sourceHashes).length)
    throw new Error('尚未保存范围、来源、候选及场景回放记录');
  assertDiscoveryContracts(snapshot);
  assertConsolidated(snapshot);
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
