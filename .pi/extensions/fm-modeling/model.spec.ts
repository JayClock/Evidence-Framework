import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ModelPublisher, digestDirectory, type BundleFile } from './model.js';
import { fmPaths } from './paths.js';
import { StateStore } from './state.js';

const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'fm-modeling-model-'));
  roots.push(root);
  const store = new StateStore(root);
  const state = await store.createRun('FM-2026-001', '客户档案');
  return { root, store, state };
}
afterEach(async () =>
  Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true }))),
);

const bundle = (label = 'one'): BundleFile[] => [
  { path: 'model.yaml', content: `schemaVersion: 3\nname: ${label}\n` },
  { path: 'README.md', content: `# ${label}\n` },
];

describe('ModelPublisher', () => {
  it('publishes a validated full bundle and records changed files', async () => {
    const { root, store, state } = await setup();
    const publisher = new ModelPublisher(root, store, {
      validate: async () => ({ valid: true, simulationPassed: null }),
    });
    const published = await publisher.submit({
      runId: state.runId,
      expectedRevision: 1,
      expectedModelRevision: 0,
      summary: '首版',
      sourceRefs: ['INPUT'],
      files: bundle(),
    });

    expect(published.modelRevision).toBe(1);
    expect(published.lastAppliedRevision).toBe(1);
    expect(
      await readFile(join(fmPaths(root).model, 'model.yaml'), 'utf8'),
    ).toContain('one');
    expect((await store.readEvent(state.runId, 2)).event).toMatchObject({
      kind: 'model-published',
      changedFiles: ['README.md', 'model.yaml'],
    });
  });

  it('records a no-op without replacing the model', async () => {
    const { root, store, state } = await setup();
    const publisher = new ModelPublisher(root, store, {
      validate: async () => ({ valid: true, simulationPassed: null }),
    });
    const first = await publisher.submit({
      runId: state.runId,
      expectedRevision: 1,
      expectedModelRevision: 0,
      summary: '首版',
      sourceRefs: ['INPUT'],
      files: bundle(),
    });
    const second = await publisher.submit({
      runId: state.runId,
      expectedRevision: first.revision,
      expectedModelRevision: first.modelRevision,
      summary: '复核',
      sourceRefs: ['INPUT'],
      files: bundle(),
    });

    expect(second.modelRevision).toBe(1);
    expect(
      (await store.readEvent(state.runId, second.revision)).event.kind,
    ).toBe('model-noop');
  });

  it('keeps the previous model after validation or rename failure', async () => {
    const { root, store, state } = await setup();
    const good = new ModelPublisher(root, store, {
      validate: async () => ({ valid: true, simulationPassed: null }),
    });
    const first = await good.submit({
      runId: state.runId,
      expectedRevision: 1,
      expectedModelRevision: 0,
      summary: '首版',
      sourceRefs: ['INPUT'],
      files: bundle('stable'),
    });
    const invalid = new ModelPublisher(root, store, {
      validate: async () => ({
        valid: false,
        simulationPassed: null,
        errors: ['bad'],
      }),
    });
    const failed = await invalid.submit({
      runId: state.runId,
      expectedRevision: first.revision,
      expectedModelRevision: first.modelRevision,
      summary: '无效',
      sourceRefs: ['INPUT'],
      files: bundle('invalid'),
    });
    expect(failed.modelRevision).toBe(1);
    expect(
      await readFile(join(fmPaths(root).model, 'model.yaml'), 'utf8'),
    ).toContain('stable');

    const rollback = new ModelPublisher(root, store, {
      validate: async () => ({ valid: true, simulationPassed: null }),
      renameDirectory: async (from, to) => {
        if (
          basename(String(from)).startsWith(state.runId) &&
          basename(String(to)) === 'model'
        ) {
          throw new Error('simulated rename failure');
        }
        await rename(from, to);
      },
    });
    const rolledBack = await rollback.submit({
      runId: state.runId,
      expectedRevision: failed.revision,
      expectedModelRevision: failed.modelRevision,
      summary: '回滚',
      sourceRefs: ['INPUT'],
      files: bundle('replacement'),
    });
    expect(rolledBack.modelRevision).toBe(1);
    expect(
      (await store.readEvent(state.runId, rolledBack.revision)).event,
    ).toMatchObject({
      kind: 'model-publication-failed',
      stage: 'publish',
    });
    expect(
      await readFile(join(fmPaths(root).model, 'model.yaml'), 'utf8'),
    ).toContain('stable');
  });

  it('rejects unsafe, duplicate, generated, and incomplete paths', async () => {
    const { root, store, state } = await setup();
    const publisher = new ModelPublisher(root, store, {
      validate: async () => ({ valid: true, simulationPassed: null }),
    });
    const base = {
      runId: state.runId,
      expectedRevision: 1,
      expectedModelRevision: 0,
      summary: 'bad',
      sourceRefs: ['INPUT'],
    };
    await expect(
      publisher.submit({
        ...base,
        files: [{ path: '../x.yaml', content: '' }],
      }),
    ).rejects.toThrow();
    await expect(
      publisher.submit({
        ...base,
        files: [{ path: 'generated/x.yaml', content: '' }],
      }),
    ).rejects.toThrow();
    await expect(
      publisher.submit({ ...base, files: bundle().concat(bundle()[0]!) }),
    ).rejects.toThrow('重复');
  });
});

describe('digestDirectory', () => {
  it('includes paths and contents deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fm-modeling-digest-'));
    roots.push(root);
    await mkdir(join(root, 'x'));
    await writeFile(join(root, 'x/a.yaml'), 'a');
    const first = await digestDirectory(root);
    await writeFile(join(root, 'x/a.yaml'), 'b');
    expect(await digestDirectory(root)).not.toBe(first);
  });
});
