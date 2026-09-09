import { describe, expect, it } from 'vitest';
import { REQUIREMENTS_PATH } from '../../contracts/paths.ts';
import { domainAssessment } from '../../tests/support/discovery-fixtures.ts';
import { memoryModeling } from '../../tests/support/memory-modeling.ts';
import { projectDiscovery } from './replay.ts';
import type { DiscoveryQuestion } from './schema.ts';

const question: DiscoveryQuestion = {
  id: 'Q-001',
  gapKey: 'c-001.identity',
  focus: '对象身份',
  target: null,
  prompt: '这个对象依据什么识别身份？',
  impact: '确定身份规则',
  blocking: true,
  sourceRefs: ['INPUT'],
};

describe('headless discovery service', () => {
  it('preserves ask → human answer → consolidation → finalization without dispatch or approval', async () => {
    const h = memoryModeling();
    await h.consolidate();
    await h.service.askQuestions(h.root, h.state, [question]);
    expect(h.state.status).toBe('waiting_answer');
    await expect(
      h.service.finalizeDiscovery(h.root, h.state, domainAssessment()),
    ).rejects.toThrow('更新模型');
    await h.service.answerQuestion(h.root, h.state, {
      questionId: question.id,
      status: 'answered',
      text: '合成回答：按输入声明的标识识别。',
      respondent: '合成测试人员',
    });
    expect(h.state.status).toBe('ready');
    await expect(
      h.service.assertDiscoveryReady(h.root, h.state, domainAssessment()),
    ).rejects.toThrow('先保存消化结果');
    await h.consolidate();
    h.state.status = 'ready';
    await h.service.controlDiscoveryInteraction(
      h.root,
      h.state,
      'update-model',
    );
    await h.service.finalizeDiscovery(h.root, h.state, domainAssessment());
    expect(h.state.discovery.stage).toBe('finalizing');
    expect(h.state.phase).toBe('modeling');
    expect(h.state.pendingGate).toBeNull();
    expect(h.state.modeling.machineValidated).toBe(false);
    expect(h.state.coding.storyIds).toEqual([]);
    const result = await h.service.readFinalizedDiscovery(h.root, h.state);
    expect(result).toEqual({
      runId: h.state.runId,
      revision: h.state.discovery.revision,
      journalDigest: h.state.discovery.digest,
      snapshot: projectDiscovery(h.state.runId, h.entries),
    });
    expect(result.snapshot.sourceHashes[REQUIREMENTS_PATH]).toBeTruthy();
    expect(result.snapshot.answers).toHaveLength(1);
  });

  it('does not produce a hand-off before finalizing, or after a source changes', async () => {
    const h = memoryModeling();
    await h.consolidate();
    await expect(
      h.service.readFinalizedDiscovery(h.root, h.state),
    ).rejects.toThrow('先完成交互发现');
    h.state.status = 'ready';
    await h.service.controlDiscoveryInteraction(
      h.root,
      h.state,
      'update-model',
    );
    await h.service.finalizeDiscovery(h.root, h.state, domainAssessment());
    const before = structuredClone(h.state);
    await h.service.readFinalizedDiscovery(h.root, h.state);
    expect(h.state).toEqual(before);
    h.sources.set(REQUIREMENTS_PATH, '变更的合成输入');
    await expect(
      h.service.readFinalizedDiscovery(h.root, h.state),
    ).rejects.toThrow('原始材料已变化');
    expect(h.state).toEqual(before);
  });

  it('keeps a manually deferred gap under the original question identity and blocks finalization', async () => {
    const h = memoryModeling();
    await h.consolidate();
    await h.service.askQuestions(h.root, h.state, [question]);
    await h.service.controlDiscoveryInteraction(
      h.root,
      h.state,
      'skip',
      question.id,
    );
    await h.consolidate();
    await expect(
      h.service.askQuestions(h.root, h.state, [{ ...question, id: 'Q-002' }]),
    ).rejects.toThrow('同一业务缺口');
    const assessment = domainAssessment();
    assessment.questions = [
      {
        questionId: 'Q-001',
        affectedFactRefs: ['C-001.identity'],
        reasoning: '人工跳过未解决该对象的身份依据，不能正式纳入。',
        sourceRefs: ['INPUT'],
      },
    ];
    h.state.status = 'ready';
    await h.service.controlDiscoveryInteraction(
      h.root,
      h.state,
      'update-model',
    );
    expect(await h.service.finalizeDiscovery(h.root, h.state, assessment)).toBe(
      false,
    );
    const snapshot = await h.repository.loadDiscovery(h.root, h.state);
    expect(snapshot.answers).toEqual([]);
    expect(snapshot.questions.map((value) => value.id)).toEqual(['Q-001']);
    expect(snapshot.interaction.deferredQuestionIds).toEqual(['Q-001']);
  });
});
