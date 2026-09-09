import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ModelPublisher } from './model.js';
import { fmPaths } from './paths.js';
import { recoverWorkspace } from './recovery.js';
import { ToolLease } from './runtime.js';
import { StateStore } from './state.js';

const roots: string[] = [];
async function project() {
  const root = await mkdtemp(join(tmpdir(), 'fm-modeling-recovery-'));
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
  return { root, store, state };
}
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true }))));

describe('workspace recovery', () => {
  it('restores the last valid backup when target rename was interrupted', async () => {
    const { root } = await project();
    const paths = fmPaths(root);
    await rename(paths.model, paths.backup);
    await mkdir(join(paths.staging, 'orphan'), { recursive: true });
    await writeFile(join(paths.staging, 'orphan/model.yaml'), 'bad');

    await expect(recoverWorkspace(root)).resolves.toMatchObject({ modelRevision: 1 });
    await expect(recoverWorkspace(root)).resolves.toMatchObject({ modelRevision: 1 });
  });

  it('clears a stale execution without restarting the agent', async () => {
    const { root, store, state } = await project();
    await store.saveState({
      ...state,
      execution: {
        id: 'EXEC-stale',
        sessionId: 'old-session',
        inputRevision: state.revision,
        startedAt: new Date().toISOString(),
      },
    });
    expect((await recoverWorkspace(root))?.execution).toBeNull();
  });

  it('reports an externally modified model instead of replacing it', async () => {
    const { root } = await project();
    await writeFile(join(fmPaths(root).model, 'model.yaml'), 'externally changed\n');
    await expect(recoverWorkspace(root)).rejects.toThrow('外部修改');
  });
});

describe('ToolLease', () => {
  it('removes only tools that it activated', () => {
    let active = ['read', 'foreign'];
    const pi = {
      getActiveTools: () => active,
      setActiveTools: vi.fn((names: string[]) => {
        active = names;
      }),
    };
    const lease = new ToolLease(pi as never);
    lease.activate(['read', 'fm_model_submit']);
    active.push('added-later');
    lease.release();
    expect(active).toEqual(['read', 'foreign', 'added-later']);
  });
});
