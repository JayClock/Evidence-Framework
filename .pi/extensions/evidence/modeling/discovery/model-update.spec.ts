import { describe, expect, it } from 'vitest';
import { memoryModeling } from '../../tests/support/memory-modeling.ts';
import { projectDiscovery } from './replay.ts';
import {
  discoveryContent,
  fixtureSubmission,
} from '../../tests/support/discovery-fixtures.ts';
import type { FormalizationAssessment } from './schema.ts';
import {
  contextAssessment,
  contextSlice,
} from '../../tests/support/context-assessment.ts';

function assessment(): FormalizationAssessment {
  const value = contextAssessment();
  value.contexts.push(
    contextSlice('C-002', 'domain', ['identity', 'structure']),
  );
  value.contexts[1].facts[1].status = 'unknown';
  value.questions = [
    {
      questionId: 'Q-001',
      affectedFactRefs: ['C-002.structure'],
      reasoning: '本题只影响第二个 Context 的结构事实，不依赖整个候选。',
      sourceRefs: ['INPUT'],
    },
  ];
  return value;
}
async function partialBatch() {
  const h = memoryModeling();
  const content = discoveryContent();
  content.candidates.push({
    ...content.candidates[0],
    id: 'C-002',
    label: '后续责任',
    description: '待明确的后续责任',
    confidence: 'unknown',
  });
  await h.service.appendDiscoveryRecords(
    h.root,
    h.state,
    fixtureSubmission(content, projectDiscovery(h.state.runId, h.entries)),
  );
  await h.service.askQuestions(h.root, h.state, [
    {
      id: 'Q-001',
      gapKey: 'c-002.liability',
      focus: '后续责任',
      target: null,
      prompt: '后续责任依据什么约定？',
      impact: '影响后续责任单元',
      blocking: true,
      sourceRefs: ['INPUT'],
    },
  ]);
  await h.service.controlDiscoveryInteraction(h.root, h.state, 'update-model');
  return h;
}

// Synthetic business facts, not a claim about the product under discovery.
describe('manual model update batches', () => {
  it('does not authorize a model update merely by accumulating facts or finishing questions', async () => {
    const h = memoryModeling();
    await h.consolidate();
    h.state.status = 'ready';
    await h.service.controlDiscoveryInteraction(h.root, h.state, 'finish');
    await expect(
      h.service.finalizeDiscovery(h.root, h.state, assessment()),
    ).rejects.toThrow('更新模型');
    expect(h.state.discovery.stage).toBe('discovering');
    expect(h.state.pendingGate).toBeNull();
  });

  it('publishes a complete independent unit while retaining the downstream question, then waits for manual convergence', async () => {
    const h = await partialBatch();
    expect(
      await h.service.finalizeDiscovery(h.root, h.state, assessment()),
    ).toBe(true);
    let snapshot = projectDiscovery(h.state.runId, h.entries);
    expect(snapshot.formalization?.includedCandidateRefs).toEqual(['C-001']);
    expect(snapshot.formalization?.pendingCandidateRefs).toEqual(['C-002']);
    h.sources.set(
      'artifacts/02-modeling/ubiquitous-language.md',
      '合成统一语言',
    );
    h.sources.set('model.yaml', '合成模型');
    h.state.modeling.files = ['model.yaml'];
    await h.service.completeModelUpdate(h.root, h.state);
    snapshot = projectDiscovery(h.state.runId, h.entries);
    expect(snapshot.appliedModel?.includedCandidateRefs).toEqual(['C-001']);
    expect(snapshot.questions).toHaveLength(1);
    expect(snapshot.answers).toEqual([]);
    expect(snapshot.interaction.stopped).toBe(true);
    expect(h.state.discovery.stage).toBe('discovering');
    expect(h.state.currentArtifactIndex).toBe(0);
    expect(h.state.pendingGate).toBeNull();
    await h.service.controlDiscoveryInteraction(h.root, h.state, 'converge');
    expect(h.state.discovery.stage).toBe('finalizing');
    expect(h.state.currentArtifactIndex).toBe(2);
    await h.service.readFinalizedDiscovery(h.root, h.state);
  });

  it('persists an empty assessment without falsely completing a blocked dependency', async () => {
    const h = await partialBatch();
    const value = assessment();
    value.contexts[0].dependencies.push({
      consumerFactRef: 'C-001.rule',
      providerFactRef: 'C-002.structure',
      kind: 'decision',
      purpose: '合成规则实际需要此结构事实才能判断。',
      sourceRefs: ['INPUT'],
    });
    expect(await h.service.finalizeDiscovery(h.root, h.state, value)).toBe(
      false,
    );
    expect(h.state.discovery.stage).toBe('discovering');
    // Retrying without a new assessment cannot turn the saved empty set into
    // permission to publish a full model.
    await expect(
      h.service.finalizeDiscovery(h.root, h.state, undefined!),
    ).rejects.toThrow('每次更新必须提交');
    expect(h.state.discovery.stage).toBe('discovering');
    expect(
      projectDiscovery(h.state.runId, h.entries).formalization
        ?.pendingCandidateRefs,
    ).toEqual(['C-001', 'C-002']);
  });

  it('rejects omitted history, global blockers and missing replay instead of guessing completeness', async () => {
    const h = await partialBatch();
    const value = assessment();
    value.contexts.pop();
    await expect(
      h.service.finalizeDiscovery(h.root, h.state, value),
    ).rejects.toThrow('全部有效历史候选');
    const global = assessment();
    global.questions[0].affectedFactRefs = null;
    expect(await h.service.finalizeDiscovery(h.root, h.state, global)).toBe(
      false,
    );
    const missing = assessment();
    missing.contexts[0].caseRefs = [];
    await expect(
      h.service.finalizeDiscovery(h.root, h.state, missing),
    ).rejects.toThrow('回放');
  });

  it('can abandon an idle unfinished update and resume accumulating answers without publishing', async () => {
    const h = await partialBatch();
    await h.service.finalizeDiscovery(h.root, h.state, assessment());
    const model = structuredClone(h.state.modeling);
    await h.service.controlDiscoveryInteraction(h.root, h.state, 'resume');
    const snapshot = projectDiscovery(h.state.runId, h.entries);
    expect(snapshot.modelUpdateRequested).toBe(false);
    expect(snapshot.interaction.stopped).toBe(false);
    expect(h.state.discovery.stage).toBe('discovering');
    expect(h.state.status).toBe('waiting_answer');
    expect(h.state.modeling).toEqual(model);
    expect(snapshot.appliedModel).toBeNull();
  });

  it('prevents convergence when publication is stale or model files have changed', async () => {
    const h = await partialBatch();
    await h.service.finalizeDiscovery(h.root, h.state, assessment());
    h.sources.set(
      'artifacts/02-modeling/ubiquitous-language.md',
      '合成统一语言',
    );
    h.sources.set('model.yaml', '合成模型');
    h.state.modeling.files = ['model.yaml'];
    await h.service.completeModelUpdate(h.root, h.state);
    h.sources.set('model.yaml', '被修改的模型');
    await expect(
      h.service.controlDiscoveryInteraction(h.root, h.state, 'converge'),
    ).rejects.toThrow('模型文件已变化');
    await h.service.answerQuestion(h.root, h.state, {
      questionId: 'Q-001',
      text: '新增约定',
      respondent: '合成测试人员',
      status: 'answered',
    });
    await expect(
      h.service.controlDiscoveryInteraction(h.root, h.state, 'converge'),
    ).rejects.toThrow('先保存消化结果');
  });

  it('rejects a finalizing flag without the current Context assessment instead of using a legacy hand-off', async () => {
    const h = memoryModeling();
    await h.consolidate();
    h.state.discovery.stage = 'finalizing';
    await expect(
      h.service.readFinalizedDiscovery(h.root, h.state),
    ).rejects.toThrow('尚未提交 Context assessment');
  });

  it('keeps the last published model evidence when new facts are accumulated', async () => {
    const h = memoryModeling();
    h.state.modeling = {
      applicable: true,
      rationale: 'previous batch',
      files: ['previous.yaml'],
      machineValidated: true,
      simulationPassed: true,
    };
    const published = structuredClone(h.state.modeling);
    await h.consolidate();
    expect(h.state.modeling).toEqual(published);
    expect(projectDiscovery(h.state.runId, h.entries).answers).toEqual([]);
  });
});
