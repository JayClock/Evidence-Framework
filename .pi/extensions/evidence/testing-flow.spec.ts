import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDocumentChecks } from './checks.ts';
import {
  loadState,
  readText,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import {
  codingHarness,
  completeMockCycle as cycle,
  completionParameters,
  manifest,
  redParameters,
  testingPlan,
} from './testing-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('procedure-level TDD', () => {
  it('records multiple cycles without spending rounds, preserves baseline on reload, and requires acceptance before the story gate', async () => {
    const h = await codingHarness(roots);
    expect(h.api.getAllTools().map((tool) => tool.name)).toContain(
      'evidence_complete_tdd_cycle',
    );
    const initial = (await loadState(h.root))!;
    await expect(
      h.tool('evidence_verify_task', {
        storyId: 'US-001',
        taskId: 'TASK-001-02',
      }),
    ).rejects.toThrow('前置任务');
    await cycle(h);
    await cycle(h);
    const saved = (await loadState(h.root))!;
    expect(saved.coding).toMatchObject({
      cycles: [
        expect.objectContaining({ taskId: 'TASK-001-01' }),
        expect.objectContaining({ taskId: 'TASK-001-01' }),
      ],
    });
    expect(saved).toMatchObject({
      phase: 'coding',
      status: 'running',
      round: 0,
      pendingGate: null,
    });
    expect(saved.coding.baseline).toEqual(initial.coding.baseline);
    await h.events.get('session_start')!({}, h.ctx);
    expect((await loadState(h.root))?.coding).toEqual(saved.coding);
    await h.command('evidence-run');
    await expect(
      h.tool('evidence_complete_story', completionParameters),
    ).rejects.toThrow('TASK-001-02');
    await h.tool('evidence_verify_task', {
      storyId: 'US-001',
      taskId: 'TASK-001-02',
    });
    await h.tool('evidence_complete_story', completionParameters);
    const waiting = (await loadState(h.root))!;
    expect(waiting.status).toBe('waiting_review');
    expect(waiting.pendingGate?.artifactPaths).toEqual(
      expect.arrayContaining([
        'artifacts/05-coding/US-001.json',
        'artifacts/03-architecture/test-procedures.md',
        'src/acceptance.spec.ts',
      ]),
    );
    expect(await readText(h.root, 'artifacts/05-coding/US-001.md')).toContain(
      'AC-001-02',
    );
    expect(
      h.api.exec.mock.calls.filter(
        (call) => call[1][1] === redParameters.command,
      ),
    ).toHaveLength(7);
    await writeTextAtomic(h.root, 'artifacts/05-coding/US-001.json', '{}');
    await h.command('evidence-check');
    expect((await loadState(h.root))?.pendingGate).toBeNull();
    expect((await loadState(h.root))?.status).not.toBe('waiting_review');
  });

  it('rejects changed inputs and test deletion instead of blessing stale evidence', async () => {
    const h = await codingHarness(roots);
    h.api.exec.mockResolvedValueOnce({
      code: 1,
      stdout: 'AssertionError: expected false to be true',
      stderr: '',
      killed: false,
    });
    await h.tool('evidence_tdd_red', redParameters);
    await rm(join(h.root, 'src/feature.spec.ts'));
    await expect(
      h.tool('evidence_tdd_green', {
        storyId: 'US-001',
        observation: '不应接受删除的测试文件。',
      }),
    ).rejects.toThrow('测试文件');
    await writeTextAtomic(
      h.root,
      'artifacts/03-architecture/test-strategy.md',
      '# 已改变的策略',
    );
    await expect(
      h.tool('evidence_tdd_green', {
        storyId: 'US-001',
        observation: '策略已改变，必须回退审核。',
      }),
    ).rejects.toThrow('测试契约');
  });

  it('rejects unknown task/check mappings and commands outside the approved plan', async () => {
    const h = await codingHarness(roots);
    await expect(
      h.tool('evidence_tdd_red', { ...redParameters, taskId: 'TASK-999-01' }),
    ).rejects.toThrow('TASK-999-01');
    await expect(
      h.tool('evidence_tdd_red', {
        ...redParameters,
        command: 'npm test -- other.spec.ts',
      }),
    ).rejects.toThrow('命令');
    expect(h.api.exec).not.toHaveBeenCalled();
  });

  it('serializes sibling Red calls so one cannot overwrite another checkpoint', async () => {
    const h = await codingHarness(roots);
    h.api.exec.mockResolvedValue({
      code: 1,
      stdout: 'AssertionError: expected false to be true',
      stderr: '',
      killed: false,
    });
    const results = await Promise.allSettled([
      h.tool('evidence_tdd_red', redParameters),
      h.tool('evidence_tdd_red', redParameters),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(h.api.exec).toHaveBeenCalledTimes(1);
  });
});

describe('planning traceability gate', () => {
  it.each([
    'missing',
    'unknown-scenario',
    'unknown-procedure',
    'missing-acceptance',
    'dependency-cycle',
    'unsafe-command',
  ])(
    'blocks %s instead of accepting a structurally complete backlog',
    async (problem) => {
      const h = await codingHarness(roots);
      const state = (await loadState(h.root))!;
      state.phase = 'planning';
      await saveState(h.root, state);
      const plan = structuredClone(testingPlan);
      const story = plan.stories[0]!;
      if (problem === 'unknown-scenario') story.scenarioIds.push('AC-999-01');
      if (problem === 'unknown-procedure')
        story.tasks[0]!.procedureId = 'TP-UNKNOWN';
      if (problem === 'missing-acceptance') story.tasks.splice(1, 1);
      if (problem === 'dependency-cycle')
        story.tasks[0]!.dependsOn.push('TASK-001-02');
      if (problem === 'unsafe-command')
        story.tasks[0]!.checks[0]!.command =
          'npm test -- feature.spec.ts; echo passed';
      const path = 'artifacts/04-planning/sprint-1-backlog.md';
      const before = await readText(h.root, path);
      const prose = before.slice(0, before.indexOf('```json'));
      await writeTextAtomic(
        h.root,
        path,
        prose + (problem === 'missing' ? '' : manifest(plan)),
      );
      const result = await runDocumentChecks(h.root, state);
      expect(result.report.passed).toBe(false);
      expect(result.report.items).toContainEqual(
        expect.objectContaining({ name: '测试计划追溯', status: 'fail' }),
      );
    },
  );

  it('rejects version 2 state without rewriting or inventing cycles', async () => {
    const h = await codingHarness(roots);
    const path = '.evidence/state.json';
    await writeJsonAtomic(h.root, path, {
      ...(await loadState(h.root)),
      version: 2,
    });
    const before = await readText(h.root, path);
    await expect(loadState(h.root)).rejects.toThrow('unsupported version 2');
    expect(await readText(h.root, path)).toBe(before);
  });
});
