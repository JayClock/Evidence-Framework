import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { fmPaths } from './paths.js';
import { StateStore } from './state.js';

const roots: string[] = [];
async function root() {
  const value = await mkdtemp(join(tmpdir(), 'fm-modeling-state-'));
  roots.push(value);
  return value;
}
afterEach(async () =>
  Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true }))),
);

describe('StateStore', () => {
  it('stores the original input only in the first immutable event', async () => {
    const project = await root();
    const store = new StateStore(project, {
      now: () => new Date('2026-04-01T10:00:00Z'),
    });
    const state = await store.createRun('FM-2026-001', '作者结算争议');

    const stateJson = await readFile(fmPaths(project).state, 'utf8');
    expect(stateJson).not.toContain('作者结算争议');
    expect((await store.readEvent(state.runId, 1)).event).toEqual({
      kind: 'input-recorded',
      sourceId: 'INPUT',
      text: '作者结算争议',
    });
    await expect(store.readEvents(state)).resolves.toHaveLength(1);
  });

  it('rejects stale revisions without overwriting history', async () => {
    const project = await root();
    const store = new StateStore(project);
    await store.createRun('FM-2026-001', '需求');

    await expect(
      store.appendEvent(0, {
        kind: 'interaction-stopped',
        requestedAt: new Date().toISOString(),
        lastModelRevision: 0,
        lastAppliedRevision: 0,
        unappliedRevisions: [1],
      }),
    ).rejects.toThrow('Revision conflict');
    expect((await store.loadState())?.revision).toBe(1);
  });

  it('detects event tampering and unknown state versions', async () => {
    const project = await root();
    const store = new StateStore(project);
    const state = await store.createRun('FM-2026-001', '需求');
    const path = join(
      fmPaths(project).runs,
      state.runId,
      'events',
      'revision-000001.json',
    );
    await writeFile(
      path,
      (await readFile(path, 'utf8')).replace('需求', '篡改'),
      'utf8',
    );
    await expect(store.recover()).rejects.toThrow('digest mismatch');

    await writeFile(
      fmPaths(project).state,
      JSON.stringify({ version: 2, runId: 'x', revision: 1 }),
    );
    await expect(store.loadState()).rejects.toThrow(
      'Unsupported FM state version',
    );
  });
});
