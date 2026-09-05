import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { runDocumentChecks } from './checks.ts';
import { createGate } from './gates.ts';
import {
  loadState,
  readText,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import {
  codingHarness,
  completionParameters,
  manifest,
  redParameters,
  testingPlan,
} from './testing-test-support.ts';
import { advanceAfterApproval } from './workflow.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const execute = promisify(execFile);

it('executes two real npm/Node test cycles and acceptance in an isolated fixture, without mocked command results', async () => {
  const h = await codingHarness(roots);
  const plan = structuredClone(testingPlan);
  for (const task of plan.stories[0].tasks) {
    const file =
      task.mode === 'tdd' ? 'src/feature.test.js' : 'src/acceptance.test.js';
    task.checks[0].testFiles = [file];
    task.checks[0].command = `npm test -- ${file}`;
  }
  const backlog = 'artifacts/04-planning/sprint-1-backlog.md';
  const content = await readText(h.root, backlog);
  await writeTextAtomic(
    h.root,
    backlog,
    content.slice(0, content.indexOf('```json')) + manifest(plan),
  );
  // The fixture uses Node's built-in runner behind npm; the repository still uses Vitest/JUnit.
  await writeJsonAtomic(h.root, 'package.json', {
    private: true,
    type: 'module',
    scripts: {
      test: 'node --test',
      lint: 'node --check src/feature.js',
      build: 'node --check src/feature.js',
    },
  });
  const header =
    'import test from "node:test"; import assert from "node:assert/strict"; import { feature } from "./feature.js";\n';
  const firstTest =
    header +
    'test("AC-001-01 default value", () => assert.equal(feature(), true));\n';
  await writeTextAtomic(
    h.root,
    'src/feature.js',
    'export function feature() { return false; }',
  );
  await writeTextAtomic(h.root, 'src/feature.test.js', firstTest);
  await writeTextAtomic(
    h.root,
    'src/acceptance.test.js',
    header +
      'test("AC-001-01 / AC-001-02", () => { assert.equal(feature(), true); assert.equal(feature(false), false); });\n',
  );
  const state = (await loadState(h.root))!;
  state.phase = 'planning';
  const checked = await runDocumentChecks(h.root, state);
  expect(checked.report.passed).toBe(true);
  state.pendingGate = await createGate(
    h.root,
    state,
    checked.report,
    checked.markdownPath,
  );
  expect(state.coding.planDigest).toMatch(/^[a-f0-9]{64}$/);
  advanceAfterApproval(state); // Unit harness simulates the human approval decision.
  await saveState(h.root, state);
  h.api.exec.mockImplementation(
    async (
      command: string,
      args: string[],
      options: { cwd?: string; timeout?: number; signal?: AbortSignal } = {},
    ) => {
      try {
        const result = await execute(command, args, {
          ...options,
          maxBuffer: 1_000_000,
        });
        return { code: 0, killed: false, ...result };
      } catch (error) {
        const result = error as Error & {
          code?: number | string;
          killed?: boolean;
          stdout?: string;
          stderr?: string;
        };
        return {
          code: typeof result.code === 'number' ? result.code : 127,
          killed: result.killed === true,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? result.message,
        };
      }
    },
  );
  await h.command('evidence-run');
  const baseline = (await loadState(h.root))!.coding.baseline;
  const red = { ...redParameters, command: 'npm test -- src/feature.test.js' };
  const green = {
    storyId: 'US-001',
    observation: '真实 Node 断言在最小实现之后通过。',
  };
  const refactor = {
    storyId: 'US-001',
    refactorSummary: completionParameters.refactorSummary,
  };
  await h.tool('evidence_tdd_red', red);
  await writeTextAtomic(
    h.root,
    'src/feature.js',
    'export function feature() { return true; }',
  );
  await h.tool('evidence_tdd_green', green);
  await h.tool('evidence_complete_tdd_cycle', refactor);
  await writeTextAtomic(
    h.root,
    'src/feature.test.js',
    firstTest +
      'test("AC-001-02 false value", () => assert.equal(feature(false), false));\n',
  );
  await h.tool('evidence_tdd_red', red);
  await writeTextAtomic(
    h.root,
    'src/feature.js',
    'export function feature(value = true) { return value; }',
  );
  await h.tool('evidence_tdd_green', green);
  await h.tool('evidence_complete_tdd_cycle', refactor);
  await h.tool('evidence_verify_task', {
    storyId: 'US-001',
    taskId: 'TASK-001-02',
  });
  await h.tool('evidence_complete_story', {
    ...completionParameters,
    changedFiles: [
      'src/feature.js',
      'src/feature.test.js',
      'src/acceptance.test.js',
      'package.json',
    ],
  });
  const final = (await loadState(h.root))!;
  expect(final).toMatchObject({
    status: 'waiting_review',
    round: 0,
    coding: {
      baseline,
      cycles: [
        expect.objectContaining({ id: 1 }),
        expect.objectContaining({ id: 2 }),
      ],
    },
  });
  expect(
    final.coding.cycles.every(
      (cycle) =>
        cycle.red.exitCode !== 0 &&
        cycle.red.output.includes('ERR_ASSERTION') &&
        cycle.green.exitCode === 0 &&
        cycle.refactor.exitCode === 0,
    ),
  ).toBe(true);
}, 30_000);
