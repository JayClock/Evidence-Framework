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

describe('configuration decoding', () => {
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

  it('round-trips a version 4 state without creating interview state or a snapshot', async () => {
    const root = await temporaryRoot();
    const state = createInitialState('project', 'goal');
    expect(state.version).toBe(4);
    expect(state.runId).toMatch(/^[a-f0-9-]{36}$/);
    expect(state).not.toHaveProperty('interviews');
    await saveState(root, state);
    expect(await loadState(root)).toEqual(state);
    expect(await readText(root, 'artifacts/00-input/interview.md')).toBe('');
  });

  it.each([1, 2, 3])(
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
