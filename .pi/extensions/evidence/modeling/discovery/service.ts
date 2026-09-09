import { Value } from 'typebox/value';
import { REQUIREMENTS_PATH } from '../../contracts/paths.ts';
import type { EvidenceState } from '../../types.ts';
import { digestText } from '../digest.ts';
import type { DiscoveryRepository } from './ports.ts';
import { reopenDiscovery } from './progress.ts';
import { assessFormalization, discoveryBasisDigest } from './formalization.ts';
import {
  activeResolution,
  duplicateQuestion,
  latestAnswer,
  pendingQuestions,
  unansweredQuestions,
} from './questions.ts';
import { projectDiscovery } from './replay.ts';
import { createResolutionChecks } from './resolutions.ts';
import type { FinalizedDiscovery } from './result.ts';
import {
  assertConsolidated,
  assertBusinessView,
  assertDiscussionTarget,
  validateRefs,
} from './rules.ts';
import {
  DiscoveryContentSchema,
  DiscoverySubmissionSchema,
  type DiscoveryAnswer,
  type DiscoveryEvent,
  type DiscoveryQuestion,
  type DiscoverySnapshot,
  type DiscoverySubmission,
  sameDiscussionTarget,
  type DiscoveryControlAction,
  type FormalizationAssessment,
} from './schema.ts';

// The caller serializes load/validate/append. No UI, filesystem or Gate decision lives here.
export function createDiscoveryService(repository: DiscoveryRepository) {
  const {
    loadDiscovery,
    loadDiscoveryEntries,
    appendDiscoveryEvent,
    nextDiscoveryEntry,
    captureSources,
    readText,
    saveState,
    appendHistory,
  } = repository;
  const {
    assertResolutionSelectionFresh,
    markChangedResolutionSources,
    validateResolutionRecords,
  } = createResolutionChecks(readText);
  // Called only by manual commands, never exposed as an agent tool or an answer source.
  async function controlDiscoveryInteraction(
    root: string,
    state: EvidenceState,
    action: DiscoveryControlAction,
    questionId?: string,
  ): Promise<void> {
    if (
      state.phase !== 'modeling' ||
      state.paused ||
      state.status === 'running' ||
      (state.discovery.stage !== 'discovering' &&
        !(
          action === 'resume' &&
          state.currentArtifactIndex < 2 &&
          !state.pendingGate
        ))
    )
      throw new Error('请在未暂停且空闲的 Modeling 发现阶段操作');
    const snapshot = await loadDiscovery(root, state);
    if (
      state.discovery.stage === 'finalizing' &&
      !snapshot.modelUpdateRequested
    )
      throw new Error('当前不是模型更新批次；需求收敛须先通过人工修订重开发现');
    const interaction = snapshot.interaction;
    if (action === 'converge') await assertAppliedModel(root, state, snapshot);
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
      interaction.stopped = action !== 'resume';
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
    state.status = pendingQuestions(snapshot).length
      ? 'waiting_answer'
      : 'ready';
    if (action === 'converge') {
      state.discovery.stage = 'finalizing';
      state.currentArtifactIndex = 2;
    }
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

  async function askQuestions(
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
        throw new Error(
          '已回答或暂缓的问题不能自动重问；请由人工补充或恢复问答',
        );
      if (
        existing.gapKey !== question.gapKey ||
        existing.focus !== question.focus ||
        existing.prompt !== question.prompt ||
        existing.impact !== question.impact ||
        existing.blocking !== question.blocking ||
        JSON.stringify(existing.sourceRefs) !==
          JSON.stringify(question.sourceRefs) ||
        !sameDiscussionTarget(existing.target, question.target)
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

  async function answerQuestion(
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

  async function appendDiscoveryRecords(
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
    assertBusinessView(snapshot);
    reopenDiscovery(state);
    state.status =
      snapshot.interaction.stopped && !snapshot.modelUpdateRequested
        ? 'ready'
        : 'running';
    await appendDiscoveryEvent(root, state, event);
  }

  async function assertDiscoveryReady(
    root: string,
    state: EvidenceState,
    assessment?: FormalizationAssessment,
  ): Promise<DiscoverySnapshot> {
    const snapshot = await loadDiscovery(root, state);

    if (!snapshot.content || !Object.keys(snapshot.sourceHashes).length)
      throw new Error('尚未保存范围、来源、候选及场景回放记录');
    assertConsolidated(snapshot);
    assertBusinessView(snapshot);
    const currentAssessment = assessment ?? snapshot.formalization?.assessment;
    if (!currentAssessment)
      throw new Error(
        '尚未提交 Context assessment；不能跳过评估或沿用旧定稿协议',
      );
    const formalization = assessFormalization(snapshot, currentAssessment);
    if (!assessment) formalization.revision = snapshot.formalization!.revision;
    if (
      (!formalization.assessment.applicability.applicable ||
        formalization.includedFactRefs.length) &&
      !Value.Check(DiscoveryContentSchema, snapshot.content)
    )
      throw new Error('范围、排除项或工作说明尚不完整，不能定稿');
    snapshot.formalization = formalization;
    for (const [path, hash] of Object.entries(snapshot.sourceHashes)) {
      if (digestText(await readText(root, path)) !== hash)
        throw new Error(`原始材料已变化，需要重新发现：${path}`);
    }
    return snapshot;
  }

  async function finalizeDiscovery(
    root: string,
    state: EvidenceState,
    assessment: FormalizationAssessment,
  ): Promise<boolean> {
    if (!(await loadDiscovery(root, state)).modelUpdateRequested)
      throw new Error(
        '请由人工选择「更新模型」（/evidence-discovery update-model）；积累问答或结束本轮不授权定稿',
      );
    if (!assessment)
      throw new Error(
        '每次更新必须提交当前 Context assessment，不复用旧协议或默认完整范围',
      );
    const snapshot = await assertDiscoveryReady(root, state, assessment);
    await appendDiscoveryEvent(root, state, {
      kind: 'formalization',
      value: snapshot.formalization!,
    });
    if (
      assessment.applicability.applicable &&
      !snapshot.formalization!.includedFactRefs.length
    ) {
      state.discovery.stage = 'discovering';
      state.currentArtifactIndex = 0;
      state.status = 'ready';
      await saveState(root, state);
      return false;
    }
    state.discovery.stage = 'finalizing';
    state.status = 'ready';
    state.currentArtifactIndex = 0;
    appendHistory(state, 'discovery_finalizing', state.discovery.digest ?? '');
    await saveState(root, state);
    return true;
  }

  async function completeModelUpdate(
    root: string,
    state: EvidenceState,
  ): Promise<void> {
    const snapshot = await assertDiscoveryReady(root, state);
    if (
      !snapshot.modelUpdateRequested ||
      state.discovery.stage !== 'finalizing'
    )
      throw new Error('当前没有人工授权的模型更新');
    const paths = [
      'artifacts/02-modeling/ubiquitous-language.md',
      ...state.modeling.files,
    ];
    const fileHashes: Record<string, string> = {};
    for (const path of paths) {
      const content = await readText(root, path);
      if (!content) throw new Error(`模型更新产物缺失：${path}`);
      fileHashes[path] = digestText(content);
    }
    state.discovery.stage = 'discovering';
    state.currentArtifactIndex = 0;
    state.status = 'ready';
    await appendDiscoveryEvent(root, state, {
      kind: 'model-applied',
      value: {
        revision: snapshot.revision,
        basisDigest: discoveryBasisDigest(snapshot),
        fileHashes,
        includedCandidateRefs: snapshot.formalization!.includedCandidateRefs,
        pendingCandidateRefs: snapshot.formalization!.pendingCandidateRefs,
        includedFactRefs: snapshot.formalization!.includedFactRefs,
        contexts: snapshot.formalization!.contexts,
      },
    });
  }

  async function assertAppliedModel(
    root: string,
    state: EvidenceState,
    snapshot: DiscoverySnapshot,
  ): Promise<void> {
    assertConsolidated(snapshot);
    if (
      !snapshot.appliedModel ||
      snapshot.modelUpdateRequested ||
      snapshot.appliedModel.basisDigest !== discoveryBasisDigest(snapshot)
    )
      throw new Error(
        '存在尚未更新进模型的发现，或尚无已发布模型；请先选择「更新模型」',
      );
    await assertDiscoveryReady(root, state);
    for (const [path, hash] of Object.entries(
      snapshot.appliedModel.fileHashes,
    )) {
      if (digestText(await readText(root, path)) !== hash)
        throw new Error(`已发布模型文件已变化：${path}；请重新更新模型`);
    }
  }

  async function readFinalizedDiscovery(
    root: string,
    state: EvidenceState,
  ): Promise<FinalizedDiscovery> {
    if (state.discovery.stage !== 'finalizing')
      throw new Error(
        '先完成交互发现并调用 evidence_finalize_discovery；不能跳过发现提交工件',
      );
    const snapshot = await assertDiscoveryReady(root, state);
    if (state.phase === 'modeling' && state.currentArtifactIndex < 2) {
      if (!snapshot.modelUpdateRequested)
        throw new Error('统一语言和 FM 提交必须属于人工授权的更新批次');
    } else {
      await assertAppliedModel(root, state, snapshot);
    }
    return {
      runId: state.runId,
      revision: snapshot.revision,
      journalDigest: state.discovery.digest,
      snapshot,
    };
  }

  async function requireFinalizing(
    root: string,
    state: EvidenceState,
  ): Promise<void> {
    await readFinalizedDiscovery(root, state);
  }
  return {
    controlDiscoveryInteraction,
    askQuestions,
    answerQuestion,
    appendDiscoveryRecords,
    assertDiscoveryReady,
    finalizeDiscovery,
    completeModelUpdate,
    requireFinalizing,
    readFinalizedDiscovery,
  };
}
