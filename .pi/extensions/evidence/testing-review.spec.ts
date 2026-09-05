import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runReviewChecks } from './checks.ts';
import { createGate, hashArtifacts } from './gates.ts';
import { getPhaseDefinition } from './phases.ts';
import { validDocument } from './quality-test-support.ts';
import {
  createInitialState,
  DEFAULT_CONFIG,
  readText,
  writeTextAtomic,
} from './storage.ts';
import { testingInputDigest } from './test-plan.ts';
import { loadStoryRecord, saveStoryRecord } from './testing-evidence.ts';
import {
  acceptanceCatalog,
  manifest,
  seedCompletedStory,
  testingPlan,
} from './testing-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
function secondStory<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll('US-001', 'US-002')
      .replaceAll('AC-001', 'AC-002')
      .replaceAll('TASK-001', 'TASK-002')
      .replaceAll('CHECK-001', 'CHECK-002'),
  );
}
async function reviewHarness() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-review-testing-'));
  roots.push(root);
  const state = createInitialState('test', '验证所有故事而不只最后一个');
  state.phase = 'review';
  state.modeling.applicable = false;
  state.modeling.rationale = '当前隔离测试不涉及履约领域。';
  await seedCompletedStory(root, state);
  const first = await loadStoryRecord(root, state, 'US-001');
  const plan = structuredClone(testingPlan);
  plan.stories.push(secondStory(plan.stories[0]));
  const catalog = structuredClone(acceptanceCatalog);
  catalog.stories.push(secondStory(catalog.stories[0]));
  for (const [path, value] of [
    ['artifacts/01-requirements/story-map.md', catalog],
    ['artifacts/04-planning/sprint-1-backlog.md', plan],
  ] as const) {
    const before = await readText(root, path);
    await writeTextAtomic(
      root,
      path,
      before.slice(0, before.indexOf('```json')) + manifest(value),
    );
  }
  state.coding.storyIds = plan.stories.map((story) => story.id);
  state.coding.currentStoryIndex = 1;
  state.coding.planDigest = await testingInputDigest(root, state);
  first.planDigest = state.coding.planDigest;
  await saveStoryRecord(root, state, plan.stories[0], first);
  await saveStoryRecord(root, state, plan.stories[1], secondStory(first));
  const spec = getPhaseDefinition('review').artifacts[0];
  await writeTextAtomic(
    root,
    spec.output,
    validDocument(spec) + '\nAC-001-01 AC-001-02 AC-002-01 AC-002-02\n',
  );
  const pi = {
    exec: vi.fn(async () => ({
      code: 0,
      stdout: '2 tests passed',
      stderr: '',
      killed: false,
    })),
  };
  const run = () =>
    runReviewChecks({
      root,
      state,
      pi,
      config: DEFAULT_CONFIG,
      timeoutMs: 1000,
    });
  return { root, state, pi, run };
}

describe('all-story Review evidence', () => {
  it('replays every story and includes earlier records in the final Gate digest', async () => {
    const h = await reviewHarness();
    const result = await h.run();
    expect(result.report.passed).toBe(true);
    expect(result.report.items.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'TASK-001-02/CHECK-001-02',
        'TASK-002-02/CHECK-002-02',
        'npm test',
        'npm run lint',
        'npm run build',
      ]),
    );
    const gate = await createGate(
      h.root,
      h.state,
      result.report,
      result.markdownPath,
    );
    expect(gate.artifactPaths).toEqual(
      expect.arrayContaining([
        'artifacts/05-coding/US-001.json',
        'artifacts/05-coding/US-002.json',
        'src/acceptance.spec.ts',
      ]),
    );
    await writeTextAtomic(h.root, 'artifacts/05-coding/US-001.json', '{}');
    expect(await hashArtifacts(h.root, gate.artifactPaths)).not.toBe(
      gate.artifactDigest,
    );
    expect((await h.run()).report.passed).toBe(false);
  });

  it.each([
    'src/feature.ts',
    'src/acceptance.spec.ts',
    'reports/coding-fixture.md',
  ])('rejects missing historical evidence %s', async (path) => {
    const h = await reviewHarness();
    await rm(join(h.root, path), { force: true });
    expect((await h.run()).report.passed).toBe(false);
  });

  it('rejects a changed historical report even if current checks would pass', async () => {
    const h = await reviewHarness();
    await writeTextAtomic(
      h.root,
      'reports/coding-fixture.md',
      '# tampered report',
    );
    expect((await h.run()).report.passed).toBe(false);
    expect(h.pi.exec).not.toHaveBeenCalled();
  });

  it('does not bless source changes made while review commands are running', async () => {
    const h = await reviewHarness();
    h.pi.exec.mockImplementationOnce(async () => {
      await writeTextAtomic(
        h.root,
        'src/feature.ts',
        'export const feature = false;',
      );
      return { code: 0, stdout: '2 tests passed', stderr: '', killed: false };
    });
    const result = await h.run();
    expect(result.report.passed).toBe(false);
    expect(result.report.items).toContainEqual(
      expect.objectContaining({ name: 'Review 证据一致性', status: 'fail' }),
    );
  });
});
