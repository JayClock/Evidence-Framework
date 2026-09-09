import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  controlDiscoveryInteraction,
  loadDiscovery,
} from '../../../state/discovery/index.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from '../../../storage.ts';
import { contractContent } from '../../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../../tests/support/quality-test-support.ts';
import { FINISH_DISCOVERY } from '../discovery-interaction.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const question = {
  id: 'Q-001',
  gapKey: 'c-005.payment-proof',
  focus: 'evidence',
  target: { kind: 'contract', contextRef: 'C-001', fulfillmentRef: 'C-005' },
  prompt: '什么凭证证明分成已支付？',
  impact: '确定完成依据',
  blocking: true,
  sourceRefs: ['INPUT'],
};
async function setup(
  hasUI = true,
  mode: ExtensionContext['mode'] = hasUI ? 'rpc' : 'print',
) {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '合成问答交互测试');
  state.status = 'running';
  await saveState(h.root, state);
  h.ctx.hasUI = hasUI;
  h.ctx.mode = mode;
  await h.saveDiscovery({
    expectedRevision: 0,
    content: contractContent(),
  });
  const result = await h.tool('evidence_ask_questions', {
    expectedRevision: 1,
    questions: [question],
  });
  h.api.exec.mockResolvedValue({
    code: 0,
    killed: false,
    stdout: '{"login":"tester"}',
    stderr: '',
  });
  h.ui.editor.mockResolvedValue('根据银行回单确认。');
  // Lifecycle events have no command-only waitForIdle. Exercise the real context boundary.
  const { waitForIdle: _wait, ...eventCtx } = h.ctx;
  const settled = () =>
    h.events.get('agent_settled')!({}, eventCtx as typeof h.ctx);
  return { ...h, result, settled };
}
async function snapshot(h: Awaited<ReturnType<typeof setup>>) {
  return loadDiscovery(h.root, (await loadState(h.root))!);
}

describe('automatic current-question entry', () => {
  it('persists first, waits until settled, and opens the editor with one answer selection', async () => {
    const h = await setup();
    expect(h.result).toMatchObject({ terminate: true });
    expect((await loadState(h.root))!.status).toBe('waiting_answer');
    expect(h.ui.select).not.toHaveBeenCalled();
    expect(h.ui.setEditorText).not.toHaveBeenCalledWith('/evidence-answer');
    h.ui.select.mockResolvedValue('回答');
    await h.settled();
    expect(h.ui.select).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('当前问题：Q-001 什么凭证证明分成已支付？'),
      ['回答', '更新模型（纳入已积累的发现）', FINISH_DISCOVERY],
      { signal: expect.any(AbortSignal) },
    );
    expect(h.ui.editor).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('▶ 支付分成'),
      '',
    );
    expect(h.ctx.waitForIdle).not.toHaveBeenCalled();
    expect((await snapshot(h)).answers).toEqual([
      expect.objectContaining({
        questionId: 'Q-001',
        respondent: 'github.com/tester',
        text: '根据银行回单确认。',
        status: 'answered',
      }),
    ]);
    expect((await snapshot(h)).interaction.needsConsolidation).toBe(true);
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);

    // Only a new saved question may offer a new menu; no mandatory history queue.
    await h.saveDiscovery({
      expectedRevision: 3,
      content: contractContent(),
    });
    await h.tool('evidence_ask_questions', {
      expectedRevision: 4,
      questions: [
        {
          ...question,
          id: 'Q-002',
          gapKey: 'c-005.proof-provider',
          prompt: '回单由谁提供？',
        },
      ],
    });
    h.ui.select.mockResolvedValue(undefined);
    await h.settled();
    await h.settled();
    expect(h.ui.select).toHaveBeenCalledTimes(2);
    expect(h.ui.select.mock.lastCall![0]).toContain('当前问题：Q-002');
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it('finishes without looking up GitHub or creating an answer and keeps blockers', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue(FINISH_DISCOVERY);
    await h.settled();
    expect(h.api.exec).not.toHaveBeenCalled();
    expect(h.ui.editor).not.toHaveBeenCalled();
    expect((await snapshot(h)).answers).toEqual([]);
    expect((await snapshot(h)).interaction.stopped).toBe(true);
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    const saved = await h.saveDiscovery({
      expectedRevision: 3,
      content: contractContent(),
    });
    expect(saved).toMatchObject({
      terminate: true,
      content: [{ text: expect.stringContaining('阻塞项：Q-001') }],
    });
    await h.settled();
    await h.events.get('session_start')!({ reason: 'reload' }, h.ctx);
    await h.settled();
    expect(h.ui.select).toHaveBeenCalledTimes(1);
    expect((await snapshot(h)).interaction.stopped).toBe(true);
  });

  it.each(['menu', 'editor', 'empty', 'github'])(
    'leaves evidence unchanged after %s cancellation/failure, with manual retry',
    async (step) => {
      const h = await setup();
      const before = await readText(h.root, '.evidence/state.json');
      const original = await snapshot(h);
      h.ui.select.mockResolvedValue(step === 'menu' ? undefined : '回答');
      if (step === 'editor') h.ui.editor.mockResolvedValue(undefined);
      if (step === 'empty') h.ui.editor.mockResolvedValue('  ');
      if (step === 'github') h.api.exec.mockResolvedValue({ code: 1 });
      await h.settled();
      await h.settled();
      expect(h.ui.select).toHaveBeenCalledTimes(1);
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect(await snapshot(h)).toEqual(original);
      expect(h.api.sendUserMessage).not.toHaveBeenCalled();
      if (step === 'menu') expect(h.api.exec).not.toHaveBeenCalled();
      if (step === 'github') expect(h.ui.editor).not.toHaveBeenCalled();
      h.ui.select.mockResolvedValue(undefined);
      await h.command('evidence-answer');
      expect(h.ui.select).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['rpc', 'print', 'json'] as const)(
    'retains textual context and the question for %s clients without TUI cards',
    async (mode) => {
      const h = await setup(mode === 'rpc', mode);
      const text = JSON.stringify(h.result.content);
      expect(text).toContain(
        '当前建模位置：合同上下文 › 作者合作协议 › 支付分成',
      );
      expect(text).toContain('权责：作者 → 平台');
      expect(text).toContain('履约确认凭证：待明确');
      expect(text).toContain(question.prompt);
      expect(text).toContain('/evidence-answer');
      expect(text).not.toContain('稍后打开问答卡片');
      expect(h.result).toMatchObject({
        terminate: true,
        details: { revision: 2 },
      });
      await h.settled();
      expect((await loadState(h.root))!.status).toBe('waiting_answer');
      if (mode === 'rpc') {
        expect(h.ui.select).toHaveBeenCalledTimes(1);
        expect(h.ui.select.mock.lastCall![0]).toContain(question.prompt);
      } else {
        expect(h.ui.select).not.toHaveBeenCalled();
        expect(text).toContain('请在交互模式中');
      }
      expect((await snapshot(h)).answers).toEqual([]);
    },
  );

  it('defers the offer while Pi is not idle', async () => {
    const h = await setup();
    vi.mocked(h.ctx.isIdle).mockReturnValue(false);
    await h.settled();
    expect(h.ui.select).not.toHaveBeenCalled();
    vi.mocked(h.ctx.isIdle).mockReturnValue(true);
    await h.settled();
    expect(h.ui.select).toHaveBeenCalledTimes(1);
  });

  it.each(['paused', 'downstream', 'new-run', 'revision', 'stopped'])(
    'discards a queued offer after %s changes',
    async (change) => {
      const h = await setup();
      const state = (await loadState(h.root))!;
      if (change === 'paused') state.paused = true;
      if (change === 'downstream') {
        state.phase = 'architecture';
        state.status = 'ready';
      }
      if (change === 'revision' || change === 'stopped')
        await controlDiscoveryInteraction(
          h.root,
          state,
          change === 'stopped' ? 'finish' : 'resume',
        );
      await saveState(
        h.root,
        change === 'new-run' ? createInitialState('other', '新运行') : state,
      );
      const before = await readText(h.root, '.evidence/state.json');
      await h.settled();
      expect(h.ui.select).not.toHaveBeenCalled();
      expect(h.api.exec).not.toHaveBeenCalled();
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    },
  );

  it('prevents overlapping automatic/manual dialogs', async () => {
    const h = await setup();
    let close!: (value: string | undefined) => void;
    h.ui.select.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          close = resolve;
        }),
    );
    const showing = h.settled();
    await vi.waitFor(() => expect(h.ui.select).toHaveBeenCalledTimes(1));
    await h.settled();
    await h.command('evidence-answer');
    expect(h.ui.select).toHaveBeenCalledTimes(1);
    close('回答');
    await showing;
    expect((await snapshot(h)).answers).toHaveLength(1);
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it.each(['paused', 'downstream', 'new-run', 'stopped', 'shutdown'])(
    'rejects a stale editor after %s without saving or starting work',
    async (change) => {
      const h = await setup();
      const original = await snapshot(h);
      h.ui.select.mockResolvedValue('回答');
      h.ui.editor.mockImplementationOnce(async () => {
        const state = (await loadState(h.root))!;
        if (change === 'paused') state.paused = true;
        if (change === 'downstream') {
          state.phase = 'architecture';
          state.status = 'ready';
        }
        if (change === 'stopped')
          await controlDiscoveryInteraction(h.root, state, 'finish');
        if (change === 'shutdown')
          await h.events.get('session_shutdown')!({ reason: 'reload' }, h.ctx);
        await saveState(
          h.root,
          change === 'new-run' ? createInitialState('other', '新运行') : state,
        );
        return '已经失效的编辑内容';
      });
      await h.settled();
      expect(h.api.sendUserMessage).not.toHaveBeenCalled();
      if (change !== 'new-run')
        expect((await snapshot(h)).answers).toEqual(original.answers);
      else expect((await loadState(h.root))!.projectName).toBe('other');
      expect(h.ui.select.mock.calls[0][2].signal.aborted).toBe(
        change === 'shutdown',
      );
    },
  );
});
