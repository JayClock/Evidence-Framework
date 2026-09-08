import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGate } from '../../gates.ts';
import { createInitialState, loadState, saveState } from '../../storage.ts';
import { qualityHarness } from '../../tests/support/quality-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Evidence leaves session naming to Pi and the user', () => {
  it.each(['startup', 'reload', 'new', 'resume', 'fork'])(
    'does not rename sessions on %s with active, paused or completed workflow state',
    async (reason) => {
      const h = await qualityHarness(roots);
      for (const mode of ['active', 'paused', 'complete'] as const) {
        const state = createInitialState('test', '保留会话名称');
        state.paused = mode === 'paused';
        state.phase = mode === 'complete' ? 'complete' : 'modeling';
        state.status = mode === 'complete' ? 'complete' : 'ready';
        await saveState(h.root, state);
        await h.events.get('session_start')!({ reason }, h.ctx);
        expect(h.api.setSessionName).not.toHaveBeenCalled();
      }
    },
  );

  it('does not rename a session without workflow state', async () => {
    const h = await qualityHarness(roots);
    await rm(join(h.root, '.evidence/state.json'));
    await h.events.get('session_start')!({ reason: 'startup' }, h.ctx);
    expect(h.api.setSessionName).not.toHaveBeenCalled();
  });

  it('initializes and runs discovery without assigning a session name', async () => {
    const h = await qualityHarness(roots);
    h.ui.confirm.mockResolvedValue(true);
    await h.command('evidence-init', '保留用户会话名称');
    expect(await loadState(h.root)).toMatchObject({ status: 'running' });
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(h.api.setSessionName).not.toHaveBeenCalled();
  });

  it('runs the next task without overwriting a manually renamed session', async () => {
    const h = await qualityHarness(roots);
    const state = createInitialState('test', '保留用户会话名称');
    state.status = 'ready';
    await saveState(h.root, state);
    await h.command('evidence-run');
    expect(await loadState(h.root)).toMatchObject({ status: 'running' });
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(h.api.setSessionName).not.toHaveBeenCalled();
  });

  it.each([
    ['modeling', 'architecture'],
    ['review', 'complete'],
  ] as const)(
    'advances %s to %s after approval without renaming the session',
    async (phase, nextPhase) => {
      const h = await qualityHarness(roots);
      h.state.phase = phase;
      h.state.status = 'waiting_review';
      h.state.pendingGate = await createGate(
        h.root,
        h.state,
        {
          phase,
          subject: '会话名称回归测试',
          round: h.state.round,
          passed: true,
          warnings: 0,
          createdAt: new Date().toISOString(),
          items: [],
        },
        `reports/${phase}-session-name.md`,
      );
      await saveState(h.root, h.state);
      h.ui.select.mockResolvedValue('批准并继续');
      await h.command('evidence-review');
      expect(await loadState(h.root)).toMatchObject({ phase: nextPhase });
      expect(h.api.setSessionName).not.toHaveBeenCalled();
    },
  );
});
