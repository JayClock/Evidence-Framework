import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIG_PATH,
  STATE_PATH,
  createInitialState,
  loadConfig,
  loadState,
  projectPath,
  relativeProjectPath,
  ensureWorkspace,
  removeWorkflowState,
  projectEntryExists,
  writeTextAtomic,
  writeJsonAtomic,
  saveState,
  readText,
} from './storage.ts';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-test-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('project paths', () => {
  it('normalizes project-relative and absolute in-project paths', async () => {
    const root = await temporaryRoot();
    expect(projectPath(root, '@/apps/example.ts')).toBe(
      join(root, 'apps/example.ts'),
    );
    expect(relativeProjectPath(root, join(root, 'apps/example.ts'))).toBe(
      'apps/example.ts',
    );
  });

  it('rejects traversal outside the project', async () => {
    const root = await temporaryRoot();
    expect(() => projectPath(root, '../outside.txt')).toThrow(
      'Path escapes project root',
    );
  });
});

describe('workspace layout', () => {
  it('creates only the modeling layout and preserves legacy artifacts until explicit deletion', async () => {
    const root = await temporaryRoot();
    await ensureWorkspace(root);
    expect(await projectEntryExists(root, 'artifacts/02-modeling')).toBe(true);
    expect(await projectEntryExists(root, 'artifacts/02-domain')).toBe(false);
    const legacy = 'artifacts/02-domain/aggregates.md';
    const current = 'artifacts/02-modeling/fm-model/model.yaml';
    await writeTextAtomic(root, legacy, '# 旧设计');
    await writeTextAtomic(root, current, 'schemaVersion: "3.0"');
    await saveState(root, createInitialState('test', 'goal'));
    await removeWorkflowState(root, false);
    expect(await loadState(root)).toBeNull();
    expect(await readText(root, legacy)).toBe('# 旧设计');
    expect(await projectEntryExists(root, current)).toBe(true);
    await removeWorkflowState(root, true);
    expect(await projectEntryExists(root, legacy)).toBe(false);
    expect(await projectEntryExists(root, current)).toBe(false);
    expect(await projectEntryExists(root, 'artifacts/02-modeling')).toBe(true);
  });
});

describe('configuration decoding', () => {
  it('loads modeling profiles and gates without a separate domain phase', async () => {
    const root = await temporaryRoot();
    await writeJsonAtomic(root, CONFIG_PATH, {
      models: {
        modeling: { model: 'openai/example', thinkingLevel: 'medium' },
      },
      gates: { modeling: 'review_if' },
    });
    const config = await loadConfig(root);
    expect(config.models.modeling).toEqual({
      model: 'openai/example',
      thinkingLevel: 'medium',
    });
    expect(config.gates.modeling).toBe('review_if');
    expect(config.models).not.toHaveProperty('domain');
    expect(config.gates).not.toHaveProperty('domain');
  });

  it.each([
    { models: { domain: { model: 'openai/old' } } },
    { gates: { domain: 'auto' } },
    { gates: { domain: 'auto', modeling: 'review' } },
  ])(
    'rejects legacy domain config rather than silently dropping it: %j',
    async (config) => {
      const root = await temporaryRoot();
      await writeJsonAtomic(root, CONFIG_PATH, config);
      const before = await readText(root, CONFIG_PATH);
      await expect(loadConfig(root)).rejects.toThrow(
        'domain 阶段已合并为 modeling',
      );
      expect(await readText(root, CONFIG_PATH)).toBe(before);
    },
  );
  it('sanitizes invalid optional values and preserves an intentional empty command list', async () => {
    const root = await temporaryRoot();
    await writeJsonAtomic(root, CONFIG_PATH, {
      version: 1,
      maxRounds: -1,
      autoContinueArtifacts: 'yes',
      qualityCommands: [],
      models: {
        coding: { model: ' openai/example ', thinkingLevel: 'invalid' },
      },
      gates: { coding: 'invalid', review: 'auto' },
    });

    const config = await loadConfig(root);
    expect(config.maxRounds).toBe(3);
    expect(config.autoContinueArtifacts).toBe(true);
    expect(config.qualityCommands).toEqual([]);
    expect(config.models.coding).toEqual({
      model: 'openai/example',
      thinkingLevel: 'high',
    });
    expect(config.gates.coding).toBe('review');
    expect(config.gates.review).toBe('auto');
  });
});

describe('state decoding', () => {
  it('initializes fulfillment modeling progress independently from document artifacts', () => {
    const state = createInitialState('project', 'goal') as unknown as {
      modeling: unknown;
    };
    expect(state.modeling).toEqual({
      applicable: null,
      rationale: null,
      files: [],
      machineValidated: false,
      simulationPassed: null,
    });
  });

  it('round-trips a version 6 state with an empty discovery cursor', async () => {
    const root = await temporaryRoot();
    const state = createInitialState('project', 'goal');
    expect(state.version).toBe(6);
    expect(state.phase).toBe('modeling');
    expect(state.discovery).toMatchObject({
      stage: 'discovering',
      revision: 0,
    });
    expect(state.runId).toMatch(/^[a-f0-9-]{36}$/);
    expect(state).not.toHaveProperty('interviews');
    await saveState(root, state);
    expect(await loadState(root)).toEqual(state);
    expect(await readText(root, 'artifacts/00-input/interview.md')).toBe('');
  });

  it.each([1, 2, 3, 4, 5])(
    'rejects version %s rather than migrating or fabricating evidence',
    async (version) => {
      const root = await temporaryRoot();
      const legacy = { ...createInitialState('project', 'goal'), version };
      await writeJsonAtomic(root, STATE_PATH, legacy);
      const before = await readText(root, STATE_PATH);
      await expect(loadState(root)).rejects.toThrow(
        `unsupported version ${version}`,
      );
      expect(await readText(root, STATE_PATH)).toBe(before);
    },
  );

  it('rejects retired domain phase even if the version was manually changed', async () => {
    const root = await temporaryRoot();
    await writeJsonAtomic(root, STATE_PATH, {
      ...createInitialState('project', 'goal'),
      phase: 'domain',
    });
    await expect(loadState(root)).rejects.toThrow('unknown phase');
  });

  it('rejects retired requirements configuration', async () => {
    const root = await temporaryRoot();
    await writeJsonAtomic(root, CONFIG_PATH, {
      models: { requirements: { model: null } },
    });
    await expect(loadConfig(root)).rejects.toThrow(
      'requirements 已并入 modeling',
    );
  });

  it('rejects the retired waiting_input status', async () => {
    const root = await temporaryRoot();
    await writeJsonAtomic(root, STATE_PATH, {
      ...createInitialState('project', 'goal'),
      status: 'waiting_input',
    });
    await expect(loadState(root)).rejects.toThrow('unknown status');
  });

  it('rejects a state that could bypass a required Red checkpoint', async () => {
    const root = await temporaryRoot();
    const state = createInitialState('project', 'goal');
    state.phase = 'coding';
    state.coding.tdd.stage = 'refactor';
    await writeJsonAtomic(root, STATE_PATH, state);

    await expect(loadState(root)).rejects.toThrow(
      'Refactor stage requires Red evidence',
    );
  });
});
