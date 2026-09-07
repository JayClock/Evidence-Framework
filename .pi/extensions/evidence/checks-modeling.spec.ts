import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runModelingChecks, runReviewChecks } from './checks.ts';
import { listFmModelFiles, validateFmModel } from './modeling.ts';
import {
  createInitialState,
  DEFAULT_CONFIG,
  writeTextAtomic,
} from './storage.ts';
import { validateDocumentPhase } from './validation.ts';
import { seedCompletedStory } from './testing-test-support.ts';
import { seedDiscovery } from './discovery-test-support.ts';

vi.mock('./modeling.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./modeling.ts')>()),
  validateFmModel: vi.fn(),
  listFmModelFiles: vi.fn(),
}));
vi.mock('./validation.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./validation.ts')>()),
  validateDocumentPhase: vi.fn(),
}));

const roots: string[] = [];

beforeEach(() => {
  vi.mocked(validateFmModel)
    .mockReset()
    .mockResolvedValue({
      passed: true,
      machineValidated: true,
      simulationPassed: true,
      items: [
        { name: 'FM schema validation', status: 'pass', details: 'passed' },
      ],
    });
  vi.mocked(listFmModelFiles)
    .mockReset()
    .mockResolvedValue(['artifacts/02-modeling/fm-model/generated/model.json']);
});

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function checkHarness(phase: 'modeling' | 'review') {
  const root = await mkdtemp(join(tmpdir(), 'evidence-fm-checks-'));
  roots.push(root);
  const state = createInitialState('test', 'goal');
  state.phase = phase;
  await seedDiscovery(root, state);
  vi.mocked(validateDocumentPhase).mockResolvedValue({
    phase,
    subject: phase,
    round: 0,
    passed: true,
    warnings: 0,
    createdAt: new Date().toISOString(),
    items: [],
  });
  if (phase === 'review') {
    await writeTextAtomic(
      root,
      'artifacts/06-review/final-review.md',
      '# US-001 AC-001-01 AC-001-02\n',
    );
    await writeTextAtomic(
      root,
      'artifacts/02-modeling/fm-model/generated/model.json',
      '{}',
    );
  }
  const pi = {
    exec: vi.fn(async () => ({
      code: 0,
      stdout: 'passed',
      stderr: '',
      killed: false,
    })),
  };
  const config = {
    ...structuredClone(DEFAULT_CONFIG),
    qualityCommands: ['npm test'],
  };
  const run = async () => {
    if (phase === 'review') await seedCompletedStory(root, state);
    return (phase === 'modeling' ? runModelingChecks : runReviewChecks)({
      root,
      state,
      pi,
      config,
      timeoutMs: 1000,
    });
  };
  return { state, pi, run };
}

describe.each(['modeling', 'review'] as const)('%s FM gate checks', (phase) => {
  it('blocks an undecided model without executing a validator', async () => {
    const { run, pi } = await checkHarness(phase);
    const result = await run();
    expect(result.report.passed).toBe(false);
    expect(result.report.items).toContainEqual(
      expect.objectContaining({ name: 'FM applicability', status: 'fail' }),
    );
    expect(validateFmModel).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it('refreshes model inventory but blocks Review evidence reuse if that inventory changes', async () => {
    const { state, run } = await checkHarness(phase);
    state.modeling.applicable = true;
    const result = await run();
    expect(result.report.passed).toBe(phase === 'modeling');
    if (phase === 'review')
      expect(result.report.items).toContainEqual(
        expect.objectContaining({
          status: 'fail',
          details: expect.stringContaining('测试契约已变化'),
        }),
      );
    expect(state.modeling.files).toEqual([
      'artifacts/02-modeling/fm-model/generated/model.json',
    ]);
    expect(state.modeling.machineValidated).toBe(true);
    expect(state.modeling.simulationPassed).toBe(true);
  });

  it('never converts an unsuccessful validator result into a passing gate', async () => {
    const { state, run, pi } = await checkHarness(phase);
    state.modeling.applicable = true;
    vi.mocked(validateFmModel).mockResolvedValue({
      passed: false,
      machineValidated: false,
      simulationPassed: null,
      items: [],
    });
    const result = await run();
    expect(result.report.passed).toBe(false);
    expect(result.report.items.some((item) => item.status === 'fail')).toBe(
      true,
    );
    expect(pi.exec).not.toHaveBeenCalled();
  });
});
