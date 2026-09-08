import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeJsonAtomic,
} from '../../storage.ts';
import { contractContent } from '../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../tests/support/quality-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup(sessionId = 'owner') {
  const h = await qualityHarness(roots);
  h.ctx.sessionManager = {
    getSessionId: () => sessionId,
  } as ExtensionContext['sessionManager'];
  const state = (await loadState(h.root))!;
  Object.assign(state, {
    execution: {
      id: 'test-execution',
      sessionId: 'owner',
      pid: process.pid,
      hostname: hostname(),
    },
  });
  await saveState(h.root, state);
  return h;
}

async function emit(
  h: Awaited<ReturnType<typeof setup>>,
  name: string,
  reason = 'startup',
) {
  await h.events.get(name)!({ reason }, h.ctx);
}

describe('execution ownership and interrupted recovery', () => {
  it.each(['startup', 'resume', 'reload', 'new', 'fork'])(
    'does not reset another session on %s',
    async (reason) => {
      const h = await setup('other-session');
      const before = await readText(h.root, '.evidence/state.json');
      await emit(h, 'session_start', reason);
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    },
  );

  it('does not reset a busy owner, or change paused state during reload', async () => {
    const h = await setup();
    vi.mocked(h.ctx.isIdle).mockReturnValue(false);
    const before = await readText(h.root, '.evidence/state.json');
    await emit(h, 'session_start', 'reload');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    vi.mocked(h.ctx.isIdle).mockReturnValue(true);
    const state = (await loadState(h.root))!;
    state.paused = true;
    await saveState(h.root, state);
    const paused = await readText(h.root, '.evidence/state.json');
    await emit(h, 'session_start', 'reload');
    expect(await readText(h.root, '.evidence/state.json')).toBe(paused);
  });

  it('does not let an unrelated or busy agent_settled reset active work', async () => {
    const h = await setup('other-session');
    const before = await readText(h.root, '.evidence/state.json');
    await emit(h, 'agent_settled');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    h.ctx.sessionManager = {
      getSessionId: () => 'owner',
    } as ExtensionContext['sessionManager'];
    vi.mocked(h.ctx.isIdle).mockReturnValue(false);
    await emit(h, 'agent_settled');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it('allows the original modeling task to save after an unrelated session starts', async () => {
    const h = await setup();
    const state = createInitialState('test', '跨会话保存回归');
    state.status = 'running';
    state.execution = (await loadState(h.root))!.execution;
    await saveState(h.root, state);
    await h.saveDiscovery({ expectedRevision: 0, content: contractContent() });
    const otherCtx = {
      ...h.ctx,
      sessionManager: { getSessionId: () => 'other-session' },
    } as typeof h.ctx;
    await h.events.get('session_start')!({ reason: 'startup' }, otherCtx);
    await h.saveDiscovery({ expectedRevision: 1, content: contractContent() });
    expect(await loadState(h.root)).toMatchObject({
      status: 'running',
      discovery: { revision: 2 },
    });
  });

  it('treats an inaccessible process as alive rather than interrupted', async () => {
    const h = await setup('other-session');
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('permission denied'), { code: 'EPERM' });
    });
    const before = await readText(h.root, '.evidence/state.json');
    await emit(h, 'session_start');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
  });

  it('recovers an idle owner on reload and records the triggering session/reason', async () => {
    const h = await setup();
    await emit(h, 'session_start', 'reload');
    expect(await loadState(h.root)).toMatchObject({
      status: 'ready',
      execution: null,
      history: expect.arrayContaining([
        expect.objectContaining({
          event: 'interrupted_run_recovered',
          detail: expect.stringMatching(/reload.*owner/),
        }),
      ]),
    });
  });

  it('recovers a dead local process, but not a live foreign process or remote host', async () => {
    const h = await setup('other-session');
    for (const owner of [
      { pid: process.ppid, hostname: hostname() },
      { pid: process.pid, hostname: 'another-host' },
    ]) {
      const state = (await loadState(h.root))!;
      Object.assign(state, {
        execution: { id: 'test-execution', sessionId: 'owner', ...owner },
      });
      await saveState(h.root, state);
      const before = await readText(h.root, '.evidence/state.json');
      await emit(h, 'session_start');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    }
    const dead = spawnSync(process.execPath, ['-e', '']);
    expect(dead.status).toBe(0);
    const state = (await loadState(h.root))!;
    Object.assign(state, {
      execution: {
        id: 'dead-execution',
        sessionId: 'owner',
        pid: dead.pid,
        hostname: hostname(),
      },
    });
    await saveState(h.root, state);
    await emit(h, 'session_start');
    expect(await loadState(h.root)).toMatchObject({
      status: 'ready',
      execution: null,
    });
  });

  it('preserves legacy running state until an explicit confirmed run', async () => {
    const h = await setup();
    const state = (await loadState(h.root))!;
    Object.assign(state, { execution: null });
    await saveState(h.root, state);
    const before = await readText(h.root, '.evidence/state.json');
    await emit(h, 'session_start');
    await emit(h, 'agent_settled');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    h.ui.confirm.mockResolvedValue(false);
    await h.command('evidence-run');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    h.ui.confirm.mockResolvedValue(true);
    await h.command('evidence-run');
    expect(await loadState(h.root)).toMatchObject({
      status: 'running',
      execution: { sessionId: 'owner', pid: process.pid, hostname: hostname() },
    });
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
  });

  it('rechecks legacy state after confirmation instead of replacing a newly claimed task', async () => {
    const h = await setup();
    const state = (await loadState(h.root))!;
    state.execution = null;
    await saveState(h.root, state);
    let claimed = '';
    h.ui.confirm.mockImplementation(async () => {
      const latest = (await loadState(h.root))!;
      latest.execution = {
        id: 'new-claim',
        sessionId: 'other-session',
        pid: process.pid,
        hostname: hostname(),
      };
      await saveState(h.root, latest);
      claimed = await readText(h.root, '.evidence/state.json');
      return true;
    });
    await h.command('evidence-run');
    expect(await readText(h.root, '.evidence/state.json')).toBe(claimed);
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
  });

  it('reads missing legacy ownership without writing and rejects malformed ownership', async () => {
    const h = await setup();
    const { execution: _owner, ...legacy } = (await loadState(h.root))!;
    await writeJsonAtomic(h.root, '.evidence/state.json', legacy);
    const before = await readText(h.root, '.evidence/state.json');
    expect((await loadState(h.root))!.execution).toBeNull();
    await emit(h, 'session_start');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    for (const pid of [0, -1, 1.5, '123', Number.MAX_SAFE_INTEGER + 1]) {
      await writeJsonAtomic(h.root, '.evidence/state.json', {
        ...legacy,
        execution: { id: 'bad', sessionId: 'owner', hostname: hostname(), pid },
      });
      await expect(loadState(h.root)).rejects.toThrow('execution owner');
    }
  });

  it('binds a fresh task and lets only its settled owner release it', async () => {
    const h = await setup();
    const state = (await loadState(h.root))!;
    state.status = 'ready';
    await saveState(h.root, state);
    await h.command('evidence-run');
    expect(await loadState(h.root)).toMatchObject({
      status: 'running',
      execution: { sessionId: 'owner', pid: process.pid, hostname: hostname() },
    });
    await emit(h, 'agent_settled');
    expect(await loadState(h.root)).toMatchObject({
      status: 'ready',
      execution: null,
    });
  });
});
