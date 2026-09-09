import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pendingQuestions,
  unresolvedBlockingQuestions,
} from '../../../modeling/discovery/questions.ts';
import {
  appendDiscoveryEvent,
  loadDiscovery,
} from '../../../state/discovery/index.ts';
import * as storage from '../../../storage.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from '../../../storage.ts';
import { discoveryContent } from '../../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../../tests/support/quality-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const question = {
  id: 'Q-001',
  gapKey: 'input.share-basis',
  focus: 'lineage',
  target: null,
  prompt: '分成金额根据什么计算？',
  impact: '确定计算依据',
  blocking: true,
  sourceRefs: ['INPUT'],
};
async function setup() {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '逐问建模');
  state.status = 'running';
  await saveState(h.root, state);
  await h.saveDiscovery({
    expectedRevision: 0,
    content: discoveryContent(),
  });
  await h.tool('evidence_ask_questions', {
    expectedRevision: 1,
    questions: [question],
  });
  h.api.exec.mockResolvedValue({
    code: 0,
    killed: false,
    stdout: '{"login":"tester"}',
    stderr: '',
  });
  h.ui.select.mockResolvedValue('事实或决定');
  h.ui.editor.mockResolvedValue('按实收金额计算；每月结算。');
  return h;
}
async function current(h: Awaited<ReturnType<typeof setup>>) {
  const state = (await loadState(h.root))!;
  return { state, snapshot: await loadDiscovery(h.root, state) };
}

describe('adaptive one-question dialogue', () => {
  it('rejects a batch without changing stored state', async () => {
    const h = await setup();
    await h.command('evidence-answer', 'Q-001');
    await h.command('evidence-run');
    await h.saveDiscovery({
      expectedRevision: 3,
      content: discoveryContent(),
    });
    const before = await readText(h.root, '.evidence/state.json');
    await expect(
      h.tool('evidence_ask_questions', {
        expectedRevision: 4,
        questions: [
          { ...question, id: 'Q-002' },
          { ...question, id: 'Q-003' },
        ],
      }),
    ).rejects.toThrow('每次只提出一个');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it.each([
    '事实或决定',
    '未知，仍需澄清',
    '移出本次范围（回答中说明原因）',
    '暂不确定／跳过此题',
  ])(
    'starts exactly one consolidation after %s, requiring a save before the next question',
    async (mode) => {
      const h = await setup();
      h.ui.select.mockResolvedValue(mode);
      await h.command('evidence-answer', 'Q-001');
      const { state, snapshot } = await current(h);
      expect(state).toMatchObject({
        status: 'running',
        round: 0,
        pendingGate: null,
      });
      expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
      expect(h.api.sendUserMessage).toHaveBeenCalledWith(
        expect.stringContaining('先保存消化结果，再决定下一问'),
      );
      expect(snapshot.interaction).toMatchObject({
        needsConsolidation: true,
        activeQuestionId: null,
      });
      if (mode === '暂不确定／跳过此题') {
        expect(snapshot.answers).toEqual([]);
        expect(h.api.exec).not.toHaveBeenCalled();
      } else
        expect(snapshot.answers[0].text).toBe('按实收金额计算；每月结算。');
      await expect(
        h.tool('evidence_ask_questions', {
          expectedRevision: 3,
          questions: [{ ...question, id: 'Q-002' }],
        }),
      ).rejects.toThrow('先保存消化结果');
      await expect(
        h.tool('evidence_finalize_discovery', { expectedRevision: 3 }),
      ).rejects.toThrow('更新模型');
      await expect(
        h.tool('evidence_check_model_draft', {
          expectedRevision: 3,
          files: [
            { path: 'model.yaml', content: 'not-read-before-consolidation' },
          ],
        }),
      ).rejects.toThrow('先保存消化结果');
      await h.saveDiscovery({
        expectedRevision: 3,
        content: discoveryContent(),
      });
      await h.tool('evidence_ask_questions', {
        expectedRevision: 4,
        questions: [
          {
            ...question,
            id: 'Q-002',
            gapKey: 'input.refund-deduction',
            prompt: '退款是否从实收金额中扣除？',
          },
        ],
      });
      expect((await current(h)).state.status).toBe('waiting_answer');
      expect(
        pendingQuestions((await current(h)).snapshot).map((q) => q.id),
      ).toEqual(['Q-002']);
      expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves earlier questions as gaps, not a mandatory queue, and can select one unchanged question again', async () => {
    const h = await setup();
    const { state, snapshot } = await current(h);
    snapshot.interaction.activeQuestionId = 'Q-001';
    snapshot.questions.push({
      ...question,
      id: 'Q-002',
      gapKey: 'input.refund-deduction',
      prompt: '退款如何扣减？',
    });
    await appendDiscoveryEvent(h.root, state, {
      kind: 'question',
      question: snapshot.questions[1],
    });
    const original = await readText(h.root, state.discovery.path!);
    await h.command('evidence-answer', 'Q-001');
    let saved = await current(h);
    expect(saved.state.status).toBe('running');
    expect(saved.snapshot.questions).toHaveLength(2);
    expect(saved.snapshot.interaction.deferredQuestionIds).toEqual([]);
    expect(
      unresolvedBlockingQuestions(saved.snapshot).map((q) => q.id),
    ).toEqual(['Q-002']);
    expect(pendingQuestions(saved.snapshot)).toEqual([]);
    expect(await readText(h.root, state.discovery.path!)).toBe(original);
    await h.saveDiscovery({
      expectedRevision: 4,
      content: discoveryContent(),
    });
    await expect(
      h.tool('evidence_ask_questions', {
        expectedRevision: 5,
        questions: [{ ...snapshot.questions[1], prompt: '改写后的另一件事？' }],
      }),
    ).rejects.toThrow('必须保持原文');
    await h.tool('evidence_ask_questions', {
      expectedRevision: 5,
      questions: [snapshot.questions[1]],
    });
    saved = await current(h);
    expect(saved.snapshot.questions).toHaveLength(2);
    expect(pendingQuestions(saved.snapshot).map((q) => q.id)).toEqual([
      'Q-002',
    ]);
  });

  it.each(['事实或决定', '暂不确定／跳过此题'])(
    'cannot automatically re-ask %s by reusing its ID',
    async (mode) => {
      const h = await setup();
      h.ui.select.mockResolvedValue(mode);
      await h.command('evidence-answer', 'Q-001');
      await h.saveDiscovery({
        expectedRevision: 3,
        content: discoveryContent(),
      });
      await expect(
        h.tool('evidence_ask_questions', {
          expectedRevision: 4,
          questions: [question],
        }),
      ).rejects.toThrow('不能自动重问');
    },
  );

  it('keeps the committed answer and consolidation requirement if automatic startup fails', async () => {
    const h = await setup();
    h.api.sendUserMessage.mockImplementationOnce(() => {
      throw new Error('测试：启动失败');
    });
    await h.command('evidence-answer', 'Q-001');
    const { state, snapshot } = await current(h);
    expect(state.status).toBe('blocked');
    expect(snapshot.answers).toHaveLength(1);
    expect(snapshot.interaction.needsConsolidation).toBe(true);
  });

  it.each(['paused', 'downstream', 'new-run'])(
    'does not automatically start after %s changes between persistence and kickoff',
    async (mode) => {
      const h = await setup();
      const originalLoad = storage.loadState;
      const load = vi
        .spyOn(storage, 'loadState')
        .mockImplementation(async (root) => {
          const state = await originalLoad(root);
          // The first read after answer persistence is the automatic kickoff recheck.
          if (state?.status === 'ready' && state.discovery.revision === 3) {
            load.mockRestore();
            if (mode === 'paused') state.paused = true;
            if (mode === 'downstream') state.phase = 'architecture';
            const changed =
              mode === 'new-run'
                ? createInitialState('other', '另一个运行')
                : state;
            await saveState(root, changed);
            return changed;
          }
          return state;
        });
      await h.command('evidence-answer', 'Q-001');
      expect(h.api.sendUserMessage).not.toHaveBeenCalled();
      const state = (await loadState(h.root))!;
      if (mode === 'paused') expect(state.paused).toBe(true);
      if (mode === 'downstream') expect(state.phase).toBe('architecture');
      if (mode === 'new-run') expect(state.projectName).toBe('other');
    },
  );

  it('ignores a second entry while the answer dialog is open and starts only one task', async () => {
    const h = await setup();
    const results = await Promise.allSettled([
      h.command('evidence-answer', 'Q-001'),
      h.command('evidence-answer', 'Q-001'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(2);
    expect(h.ui.select).toHaveBeenCalledTimes(1);
    expect((await current(h)).snapshot.answers).toHaveLength(1);
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it('does not restart after cancellation or empty input', async () => {
    const h = await setup();
    h.ui.editor.mockResolvedValue(' ');
    const before = await readText(h.root, '.evidence/state.json');
    await h.command('evidence-answer', 'Q-001');
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it('retains consolidation requirement after interruption/reload and permits stopping after a save', async () => {
    const h = await setup();
    await h.command('evidence-answer', 'Q-001');
    await h.events.get('session_start')!({}, h.ctx);
    expect((await current(h)).state.status).toBe('ready');
    await h.command('evidence-run');
    await expect(
      h.tool('evidence_ask_questions', {
        expectedRevision: 3,
        questions: [{ ...question, id: 'Q-002' }],
      }),
    ).rejects.toThrow('先保存消化结果');
    await h.saveDiscovery({
      expectedRevision: 3,
      content: discoveryContent(),
    });
    await h.events.get('agent_settled')!({}, h.ctx);
    expect((await current(h)).state.status).toBe('ready');
    expect(pendingQuestions((await current(h)).snapshot)).toEqual([]);
  });

  it('resumes an unprocessed skip by consolidating before selecting the next question, not restoring a mandatory queue', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue('暂不确定／跳过此题');
    await h.command('evidence-answer', 'Q-001');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-discovery', 'resume');
    expect((await current(h)).state.status).toBe('ready');
    await h.command('evidence-run');
    await h.saveDiscovery({
      expectedRevision: 4,
      content: discoveryContent(),
    });
    expect(pendingQuestions((await current(h)).snapshot)).toEqual([]);
    await h.tool('evidence_ask_questions', {
      expectedRevision: 5,
      questions: [
        {
          ...question,
          id: 'Q-002',
          gapKey: 'input.settlement-example',
          prompt: '有实际结算单可以核对吗？',
        },
      ],
    });
    expect(
      pendingQuestions((await current(h)).snapshot).map((q) => q.id),
    ).toEqual(['Q-002']);
    expect(
      unresolvedBlockingQuestions((await current(h)).snapshot).map((q) => q.id),
    ).toEqual(['Q-001', 'Q-002']);
  });

  it('does not resume automatic questioning when a human supplements a stopped round', async () => {
    const h = await setup();
    await h.command('evidence-discovery', 'finish');
    await h.events.get('agent_settled')!({}, h.ctx);
    h.api.sendUserMessage.mockClear();
    await h.command('evidence-answer', 'Q-001');
    expect((await current(h)).state.status).toBe('ready');
    expect((await current(h)).snapshot.interaction.stopped).toBe(true);
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
  });
});
