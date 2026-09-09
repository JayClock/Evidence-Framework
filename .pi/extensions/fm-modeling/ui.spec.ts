import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelPublisher } from './model.js';
import { StateStore } from './state.js';
import { nextQuestionId, QuestionInteraction } from './ui.js';

const roots: string[] = [];
async function published() {
  const root = await mkdtemp(join(tmpdir(), 'fm-modeling-ui-'));
  roots.push(root);
  const store = new StateStore(root);
  const initial = await store.createRun('FM-2026-001', '需求');
  const state = await new ModelPublisher(root, store, {
    validate: async () => ({ valid: true, simulationPassed: null }),
  }).submit({
    runId: initial.runId,
    expectedRevision: 1,
    expectedModelRevision: 0,
    summary: '首版',
    sourceRefs: ['INPUT'],
    files: [{ path: 'model.yaml', content: 'schemaVersion: 3\n' }],
  });
  const pi = {
    getActiveTools: () => ['read'],
    setActiveTools: vi.fn(),
    sendUserMessage: vi.fn(),
  };
  return { root, store, state, pi };
}
afterEach(async () =>
  Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true }))),
);

describe('QuestionInteraction', () => {
  it('asks only after a model outcome and keeps one active question', async () => {
    const { store, state, pi } = await published();
    const interaction = new QuestionInteraction(pi as never, store);
    const asked = await interaction.ask({
      runId: state.runId,
      expectedRevision: state.revision,
      gapKey: 'payment.deadline',
      prompt: '付款期限依据什么确定？',
      impact: '影响逾期判断',
      sourceRefs: ['INPUT'],
    });
    expect(asked.activeQuestionId).toBe('Q-001');
    await expect(
      interaction.ask({
        runId: state.runId,
        expectedRevision: asked.revision,
        gapKey: 'payment.confirmation',
        prompt: '什么凭证证明付款？',
        impact: '影响履约确认',
        sourceRefs: ['INPUT'],
      }),
    ).rejects.toThrow('已有未回答问题');
  });

  it('persists an answer before starting the next modeling turn', async () => {
    const { root, store, state, pi } = await published();
    const interaction = new QuestionInteraction(pi as never, store);
    await interaction.ask({
      runId: state.runId,
      expectedRevision: state.revision,
      gapKey: 'payment.deadline',
      prompt: '付款期限依据什么确定？',
      impact: '影响逾期判断',
      sourceRefs: ['INPUT'],
    });
    const select = vi.fn(async () => '回答');
    const ctx = {
      cwd: root,
      hasUI: true,
      ui: {
        select,
        editor: async () => '以结算单截止日期为准',
        notify: vi.fn(),
      },
      sessionManager: { getSessionId: () => 'session-1' },
    };
    await interaction.open(ctx as never);

    const current = await store.loadState();
    expect(current?.execution?.inputRevision).toBe(current?.revision);
    expect(
      (await store.readEvent(state.runId, current!.revision)).event,
    ).toEqual({
      kind: 'answer-recorded',
      answerId: 'A-001',
      questionId: 'Q-001',
      text: '以结算单截止日期为准',
    });
    expect(select).toHaveBeenCalledWith(
      'Q-001 · 付款期限依据什么确定？\n影响：影响逾期判断',
      ['回答', '停止', '取消'],
    );
    expect(pi.sendUserMessage).toHaveBeenCalledOnce();
  });

  it('reuses the question id for the same stable gap key', () => {
    expect(
      nextQuestionId(
        [
          {
            event: {
              kind: 'question-asked',
              questionId: 'Q-003',
              gapKey: 'payment.deadline',
            },
          },
        ] as never,
        'payment.deadline',
      ),
    ).toBe('Q-003');
  });
});
