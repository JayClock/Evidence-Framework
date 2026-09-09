import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelingController } from './controller.js';
import { StateStore } from './state.js';

const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'fm-modeling-controller-'));
  roots.push(root);
  const notify = vi.fn();
  const sendUserMessage = vi.fn();
  const setActiveTools = vi.fn();
  const pi = {
    getAllTools: () => [],
    getCommands: () => [],
    getActiveTools: () => ['read'],
    setActiveTools,
    sendUserMessage,
  };
  const ctx = {
    cwd: root,
    waitForIdle: vi.fn(),
    ui: { notify },
    sessionManager: { getSessionId: () => 'session-1' },
  };
  return { root, store: new StateStore(root), pi, ctx, notify, sendUserMessage, setActiveTools };
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true }))));

describe('ModelingController first turn', () => {
  it('records input before starting exactly one modeling turn', async () => {
    const { store, pi, ctx, sendUserMessage, setActiveTools } = await setup();
    await new ModelingController(pi as never, store).handle('  作者结算需求  ', ctx as never);

    const state = await store.loadState();
    expect(state).toMatchObject({ runId: expect.stringMatching(/^FM-\d{4}-001$/), revision: 1 });
    expect((await store.readEvent(state!.runId, 1)).event).toMatchObject({
      kind: 'input-recorded',
      text: '  作者结算需求  ',
    });
    expect(setActiveTools).toHaveBeenCalledWith(expect.arrayContaining(['read', 'fm_model_submit']));
    expect(sendUserMessage).toHaveBeenCalledOnce();
    expect(sendUserMessage.mock.calls[0]?.[0]).toContain('fm_model_submit');
  });

  it('does not overwrite an active run or start from empty input', async () => {
    const { store, pi, ctx, notify, sendUserMessage } = await setup();
    await new ModelingController(pi as never, store).handle('', ctx as never);
    expect(notify).toHaveBeenCalledWith('用法：/evidence-model <需求描述>', 'info');

    await store.createRun('FM-2026-001', '原需求');
    await new ModelingController(pi as never, store).handle('新需求', ctx as never);
    expect(sendUserMessage).not.toHaveBeenCalled();
    expect((await store.readEvent('FM-2026-001', 1)).event).toMatchObject({ text: '原需求' });
  });

  it('refuses a foreign tool namespace conflict', async () => {
    const { store, pi, ctx, notify } = await setup();
    pi.getAllTools = () => [
      {
        name: 'fm_model_submit',
        sourceInfo: { path: '/other/plugin.ts' },
      },
    ] as never;
    await new ModelingController(pi as never, store).handle('需求', ctx as never);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('无法启动'), 'error');
    expect(await store.loadState()).toBeNull();
  });
});
