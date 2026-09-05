import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadState,
  readText,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import {
  codingHarness,
  completeMockCycle,
  completionParameters,
  redParameters,
} from './testing-test-support.ts';

import { advanceAfterApproval } from './workflow.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const green = {
  storyId: 'US-001',
  observation: '最小实现通过当前计划中的行为测试。',
};
const refactor = {
  storyId: 'US-001',
  refactorSummary: completionParameters.refactorSummary,
};
const acceptance = { storyId: 'US-001', taskId: 'TASK-001-02' };

describe('recoverable testing evidence', () => {
  it('keeps failed Green/Refactor and failed acceptance retryable without spending rounds', async () => {
    const h = await codingHarness(roots);
    const failure = {
      code: 1,
      stdout: 'AssertionError: expected false to be true',
      stderr: '',
      killed: false,
    };
    h.api.exec.mockResolvedValueOnce(failure);
    await h.tool('evidence_tdd_red', redParameters);
    h.api.exec.mockResolvedValueOnce(failure);
    await expect(h.tool('evidence_tdd_green', green)).rejects.toThrow('Green');
    expect((await loadState(h.root))?.coding.tdd.stage).toBe('green');
    await h.events.get('session_start')!({}, h.ctx);
    await h.command('evidence-run');
    await h.tool('evidence_tdd_green', green);
    h.api.exec.mockResolvedValueOnce(failure);
    await expect(
      h.tool('evidence_complete_tdd_cycle', refactor),
    ).rejects.toThrow('Refactor');
    expect((await loadState(h.root))?.coding).toMatchObject({
      tdd: { stage: 'refactor' },
      cycles: [],
    });
    await h.tool('evidence_complete_tdd_cycle', refactor);
    h.api.exec.mockResolvedValueOnce(failure);
    await expect(h.tool('evidence_verify_task', acceptance)).rejects.toThrow(
      '验证失败',
    );
    expect((await loadState(h.root))?.coding.verifications).toEqual([]);
    await h.tool('evidence_verify_task', acceptance);
    expect(await loadState(h.root)).toMatchObject({
      round: 0,
      pendingGate: null,
    });
  });

  it.each(['coding-revision', 'review-back'])(
    'requires a new cycle after %s while preserving history and the story baseline',
    async (action) => {
      const h = await codingHarness(roots);
      await completeMockCycle(h);
      await h.tool('evidence_verify_task', acceptance);
      await h.tool('evidence_complete_story', completionParameters);
      const original = (await loadState(h.root))!;
      if (action === 'coding-revision') {
        await h.command(
          'evidence-revise',
          '补充当前场景的错误处理行为及回归测试。',
        );
      } else {
        advanceAfterApproval(original);
        await saveState(h.root, original);
        h.ui.confirm.mockResolvedValue(true);
        await h.command('evidence-back');
      }
      await h.command('evidence-run');
      const revised = (await loadState(h.root))!;
      expect(revised.coding).toMatchObject({
        baseline: original.coding.baseline,
        cycles: original.coding.cycles,
        revisionStart: 1,
        records: {},
      });
      await expect(
        h.tool('evidence_complete_story', completionParameters),
      ).rejects.toThrow('当前修订');
      await completeMockCycle(h);
      await h.tool('evidence_complete_story', completionParameters);
      expect(await loadState(h.root)).toMatchObject({
        round: action === 'coding-revision' ? 1 : 0,
        status: 'waiting_review',
        coding: {
          cycles: [
            expect.objectContaining({ id: 1 }),
            expect.objectContaining({ id: 2 }),
          ],
        },
      });
    },
  );

  it('rechecks acceptance and quality without inventing another Red after a quality failure', async () => {
    const h = await codingHarness(roots);
    await completeMockCycle(h);
    await h.tool('evidence_verify_task', acceptance);
    h.api.exec.mockImplementation(async (_command, args) => ({
      code: args[1] === 'npm run lint' ? 1 : 0,
      stdout: '2 tests passed',
      stderr: '',
      killed: false,
    }));
    await h.tool('evidence_complete_story', completionParameters);
    expect(await loadState(h.root)).toMatchObject({
      status: 'ready',
      round: 1,
      pendingGate: null,
      coding: { cycles: [expect.objectContaining({ id: 1 })] },
    });
    h.api.exec.mockResolvedValue({
      code: 0,
      stdout: '2 tests passed',
      stderr: '',
      killed: false,
    });
    await h.command('evidence-check');
    expect(await loadState(h.root)).toMatchObject({
      status: 'waiting_review',
      round: 1,
    });
    expect(
      JSON.parse(await readText(h.root, 'artifacts/05-coding/US-001.json'))
        .passed,
    ).toBe(true);
  });

  it('rejects weakening a Red test before Green and rejects corrupted persisted cycles on restore', async () => {
    const h = await codingHarness(roots);
    await completeMockCycle(h);
    const original = (await loadState(h.root))!;
    const corrupted = structuredClone(original);
    corrupted.coding.cycles[0].green.command = 'npm test -- unrelated.spec.ts';
    await writeJsonAtomic(h.root, '.evidence/state.json', corrupted);
    await expect(loadState(h.root)).rejects.toThrow(
      'invalid TDD cycle evidence',
    );
    await writeJsonAtomic(h.root, '.evidence/state.json', original);
    h.api.exec.mockResolvedValueOnce({
      code: 1,
      stdout: 'expected false to be true',
      stderr: '',
      killed: false,
    });
    await h.tool('evidence_tdd_red', redParameters);
    await writeTextAtomic(
      h.root,
      'src/feature.spec.ts',
      'test("always passes", () => {});',
    );
    await expect(h.tool('evidence_tdd_green', green)).rejects.toThrow(
      'Red 后测试文件已改变',
    );
    expect((await loadState(h.root))?.coding.tdd.stage).toBe('green');
  });

  it.each([
    'SyntaxError',
    'Cannot find module',
    'No tests found',
    'No test suite found in file',
    '# tests 0',
    '',
  ])('does not record %j as a behavioral Red', async (output) => {
    const h = await codingHarness(roots);
    h.api.exec.mockResolvedValueOnce({
      code: 1,
      stdout: output,
      stderr: '',
      killed: false,
    });
    await expect(h.tool('evidence_tdd_red', redParameters)).rejects.toThrow(
      'Red',
    );
    expect((await loadState(h.root))?.coding.tdd.stage).toBe('red');
  });

  it('rejects blank checkpoint observations without corrupting persistent state', async () => {
    const h = await codingHarness(roots);
    h.api.exec.mockResolvedValueOnce({
      code: 1,
      stdout: 'expected false to be true',
      stderr: '',
      killed: false,
    });
    await expect(
      h.tool('evidence_tdd_red', {
        ...redParameters,
        expectedFailure: ' '.repeat(20),
      }),
    ).rejects.toThrow('说明');
    expect((await loadState(h.root))?.coding.tdd.stage).toBe('red');
  });
});
