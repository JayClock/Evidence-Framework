import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from '../../../storage.ts';
import { contractContent } from '../../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../../tests/support/quality-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
function expectNoStatusDisplay(h: Awaited<ReturnType<typeof qualityHarness>>) {
  expect(
    h.ui.setWidget.mock.calls.every(([, value]) => value === undefined),
  ).toBe(true);
  expect(
    h.ui.setStatus.mock.calls.every(([, value]) => value === undefined),
  ).toBe(true);
}

describe('conversation-only Evidence status', () => {
  it.each([
    'modeling',
    'architecture',
    'planning',
    'coding',
    'review',
    'complete',
  ] as const)(
    'clears retired displays on reload without recreating them in %s',
    async (phase) => {
      const h = await qualityHarness(roots);
      const state = createInitialState('test', '不重复展示状态');
      state.phase = phase;
      state.status = phase === 'complete' ? 'complete' : 'ready';
      await saveState(h.root, state);
      const before = await readText(h.root, '.evidence/state.json');
      await h.events.get('session_start')!({}, h.ctx);
      expect(h.ui.setWidget).toHaveBeenCalledWith('evidence', undefined);
      expect(h.ui.setStatus).toHaveBeenCalledWith('evidence', undefined);
      expect(h.ui.setStatus).toHaveBeenCalledWith('evidence-check', undefined);
      await h.command('evidence-status');
      expect(h.api.sendMessage.mock.lastCall![0].content).toContain(
        'Evidence 状态',
      );
      expectNoStatusDisplay(h);
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    },
  );

  it('keeps contract questions, answers, automatic consolidation and on-demand status without a fixed panel', async () => {
    const h = await qualityHarness(roots);
    const state = createInitialState('test', '保留一问一答');
    state.status = 'running';
    await saveState(h.root, state);
    await h.saveDiscovery({
      expectedRevision: 0,
      content: contractContent(),
    });
    const question = await h.tool('evidence_ask_questions', {
      expectedRevision: 1,
      questions: [
        {
          id: 'Q-001',
          gapKey: 'c-005.payment-proof',
          target: {
            kind: 'contract',
            contextRef: 'C-001',
            fulfillmentRef: 'C-005',
          },
          focus: 'evidence',
          prompt: '什么凭证证明分成已支付？',
          impact: '确定完成依据',
          blocking: true,
          sourceRefs: ['INPUT'],
        },
      ],
    });
    expect(question).toMatchObject({
      terminate: true,
      content: [
        {
          text: expect.stringContaining(
            '当前建模位置：合同上下文 › 作者合作协议 › 支付分成',
          ),
        },
      ],
    });
    h.ui.select.mockResolvedValue('事实或决定');
    h.ui.editor.mockResolvedValue('根据银行回单确认。');
    h.api.exec.mockResolvedValue({
      code: 0,
      killed: false,
      stdout: '{"login":"tester"}',
      stderr: '',
    });
    await h.command('evidence-answer', 'Q-001');
    expect(h.ui.editor.mock.lastCall![0]).toContain('▶ 支付分成');
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    expect((await loadState(h.root))!.status).toBe('running');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-pause');
    await h.command('evidence-resume');
    await h.command('evidence-status');
    const status = h.api.sendMessage.mock.lastCall![0].content;
    expect(status).toContain(
      '当前建模位置：合同上下文 › 作者合作协议 › 支付分成',
    );
    expect(status).toContain('进度：合同上下文 › 作者合作协议 › 支付分成');
    expect(status).not.toContain('进度：发现 v');
    expectNoStatusDisplay(h);
  });
});
