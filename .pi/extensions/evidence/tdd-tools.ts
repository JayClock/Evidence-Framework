import {
  withFileMutationQueue,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { runCommand } from './checks.ts';
import {
  appendHistory,
  loadConfig,
  loadState,
  projectPath,
  saveState,
} from './storage.ts';
import { assertTestingInputs } from './test-plan.ts';
import { testFileHashes } from './test-files.ts';
import { isPassingEvidence, isRedEvidence } from './testing-integrity.ts';
import { requireDependencies } from './testing-evidence.ts';
import type { TestCheck, TestStory, TestTask } from './testing-schema.ts';
import type { EvidenceState, TddCommandEvidence } from './types.ts';
import { currentCodingStory } from './workflow.ts';

// Serialize the entire load/execute/save window. A separate queue key avoids nesting saveState's file queue.
export function withCodingLock<T>(
  root: string,
  action: () => Promise<T>,
): Promise<T> {
  return withFileMutationQueue(
    projectPath(root, '.evidence/coding-operations'),
    action,
  );
}
interface CodingContext {
  state: EvidenceState;
  story: TestStory;
}
async function codingContext(
  ctx: ExtensionContext,
  storyId: string,
): Promise<CodingContext> {
  const state = await loadState(ctx.cwd);
  if (
    !state ||
    state.phase !== 'coding' ||
    state.status !== 'running' ||
    state.paused
  )
    throw new Error('A running coding story is required.');
  if (currentCodingStory(state) !== storyId)
    throw new Error(
      `Expected story ${currentCodingStory(state)}, received ${storyId}.`,
    );
  if (!state.coding.baseline)
    throw new Error('Coding 基线缺失，请运行 /evidence-run');
  const plan = await assertTestingInputs(ctx.cwd, state);
  return { state, story: plan.stories.find((story) => story.id === storyId)! };
}
function taskIn(story: TestStory, id: string): TestTask {
  const task = story.tasks.find((task) => task.id === id);
  if (!task) throw new Error(`未知任务：${id}`);
  return task;
}
function checkIn(task: TestTask, id: string): TestCheck {
  const check = task.checks.find((check) => check.id === id);
  if (!check) throw new Error(`任务 ${task.id} 没有检查项 ${id}`);
  return check;
}
function equalHashes(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([path, hash]) => right[path] === hash)
  );
}
async function executeCheck(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: EvidenceState,
  check: TestCheck,
  observation: string,
  signal?: AbortSignal,
  expectedHashes?: Record<string, string>,
): Promise<{ evidence: TddCommandEvidence; hashes: Record<string, string> }> {
  if (!observation.trim()) throw new Error('检查点说明不能为空白。');
  const hashes = await testFileHashes(ctx.cwd, check.testFiles);
  if (expectedHashes && !equalHashes(hashes, expectedHashes))
    throw new Error(
      'Red 后测试文件已改变；不能通过删除或削弱失败测试取得 Green。',
    );
  const config = await loadConfig(ctx.cwd);
  const result = await runCommand({
    pi,
    root: ctx.cwd,
    command: check.command,
    timeoutMs: config.commandTimeoutMs,
    signal,
  });
  await assertTestingInputs(ctx.cwd, state);
  if (!equalHashes(hashes, await testFileHashes(ctx.cwd, check.testFiles)))
    throw new Error('命令执行期间测试文件改变，证据不予记录。');
  return {
    evidence: {
      ...result,
      observation: observation.trim(),
      recordedAt: new Date().toISOString(),
    },
    hashes,
  };
}
export function registerTddTools(
  pi: ExtensionAPI,
  updateUi: (ctx: ExtensionContext, state: EvidenceState) => void,
): void {
  const storyParameters = { storyId: Type.String({ pattern: '^US-\\d{3}$' }) };
  const finish = async (
    ctx: ExtensionContext,
    state: EvidenceState,
    text: string,
  ) => {
    await saveState(ctx.cwd, state);
    updateUi(ctx, state);
    return {
      content: [{ type: 'text' as const, text }],
      details: {
        storyId: currentCodingStory(state),
        cycles: state.coding.cycles.length,
        stage: state.coding.tdd.stage,
      },
    };
  };
  pi.registerTool({
    name: 'evidence_tdd_red',
    label: 'Record TDD Red',
    description:
      'Run a planned task/check and record a real failing Red checkpoint. Requires storyId, taskId, checkId and the exact approved command.',
    promptSnippet: 'Record Red for the current planned task/check',
    promptGuidelines: [
      'Call evidence_tdd_red after adding a behavior test and before implementing it; use the approved task/check IDs and command.',
    ],
    parameters: Type.Object({
      ...storyParameters,
      taskId: Type.String(),
      checkId: Type.String(),
      command: Type.String({ minLength: 3 }),
      expectedFailure: Type.String({ minLength: 20, maxLength: 2000 }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      return withCodingLock(ctx.cwd, async () => {
        const { state, story } = await codingContext(ctx, params.storyId);
        if (state.coding.tdd.stage !== 'red')
          throw new Error(
            `TDD checkpoint is ${state.coding.tdd.stage}; Red has already been recorded.`,
          );
        if (state.coding.cycles.length >= 1000)
          throw new Error('TDD 循环数量超过上限');
        const task = taskIn(story, params.taskId);
        if (task.mode !== 'tdd')
          throw new Error(`${task.id} 不是 TDD 任务，不能人为制造 Red`);
        requireDependencies(story, task, state.coding);
        const check = checkIn(task, params.checkId);
        if (params.command !== check.command)
          throw new Error('Red 命令必须与已批准检查项命令完全一致。');
        const { evidence, hashes } = await executeCheck(
          pi,
          ctx,
          state,
          check,
          params.expectedFailure,
          signal,
        );
        if (!isRedEvidence(evidence))
          throw new Error(
            `Red 不是有效行为失败（退出码 ${evidence.exitCode}）：\n${evidence.output}`,
          );
        state.coding.tdd = {
          stage: 'green',
          binding: {
            taskId: task.id,
            checkId: check.id,
            testFileHashes: hashes,
          },
          red: evidence,
          green: null,
        };
        delete state.coding.records[params.storyId];
        appendHistory(
          state,
          'tdd_red_recorded',
          `${task.id}/${check.id}: ${evidence.command}`,
        );
        return finish(
          ctx,
          state,
          `已记录 Red。核对实际失败原因，再写最小实现并调用 evidence_tdd_green。\n${evidence.output}`,
        );
      });
    },
  });
  pi.registerTool({
    name: 'evidence_tdd_green',
    label: 'Record TDD Green',
    description:
      'Re-run exactly the active Red command with unchanged test files and record Green.',
    promptSnippet: 'Re-run the active Red command and record Green',
    promptGuidelines: [
      'Call evidence_tdd_green after the minimal implementation, without deleting or weakening Red test files.',
    ],
    parameters: Type.Object({
      ...storyParameters,
      observation: Type.String({ minLength: 10, maxLength: 2000 }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      return withCodingLock(ctx.cwd, async () => {
        const { state, story } = await codingContext(ctx, params.storyId);
        const { red, binding, stage } = state.coding.tdd;
        if (stage !== 'green' || !red || !binding)
          throw new Error('A valid Red checkpoint is required before Green.');
        const check = checkIn(taskIn(story, binding.taskId), binding.checkId);
        if (check.command !== red.command)
          throw new Error('Red 检查命令与计划不一致');
        const { evidence } = await executeCheck(
          pi,
          ctx,
          state,
          check,
          params.observation,
          signal,
          binding.testFileHashes,
        );
        if (!isPassingEvidence(evidence))
          throw new Error(`Green 尚未通过：\n${evidence.output}`);
        state.coding.tdd.green = evidence;
        state.coding.tdd.stage = 'refactor';
        appendHistory(
          state,
          'tdd_green_recorded',
          `${binding.taskId}/${binding.checkId}`,
        );
        return finish(
          ctx,
          state,
          '已记录 Green。完成行为不变的 Refactor 后调用 evidence_complete_tdd_cycle，不要提前完成故事。',
        );
      });
    },
  });
  pi.registerTool({
    name: 'evidence_complete_tdd_cycle',
    label: 'Complete TDD Cycle',
    description:
      'Re-run the active focused test after refactoring, append a completed cycle, then allow another Red in the same story without changing rounds or baseline.',
    promptSnippet:
      'Verify Refactor and finish one TDD cycle without completing the story',
    promptGuidelines: [
      'Call evidence_complete_tdd_cycle after Green and Refactor; then continue the next planned behavior or task.',
    ],
    parameters: Type.Object({
      ...storyParameters,
      refactorSummary: Type.String({ minLength: 20, maxLength: 2000 }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      return withCodingLock(ctx.cwd, async () => {
        const { state, story } = await codingContext(ctx, params.storyId);
        const { red, green, binding, stage } = state.coding.tdd;
        if (stage !== 'refactor' || !red || !green || !binding)
          throw new Error('完整 Red and Green 检查点是完成循环的前提');
        const task = taskIn(story, binding.taskId);
        const check = checkIn(task, binding.checkId);
        const { evidence } = await executeCheck(
          pi,
          ctx,
          state,
          check,
          params.refactorSummary,
          signal,
        );
        if (!isPassingEvidence(evidence))
          throw new Error(
            `Refactor 聚焦测试失败，循环未完成：\n${evidence.output}`,
          );
        state.coding.cycles.push({
          id: state.coding.cycles.length + 1,
          ...binding,
          procedureId: task.procedureId,
          scenarioIds: task.scenarioIds,
          red,
          green,
          refactor: evidence,
        });
        state.coding.tdd = {
          stage: 'red',
          binding: null,
          red: null,
          green: null,
        };
        appendHistory(state, 'tdd_cycle_completed', `${task.id}/${check.id}`);
        return finish(
          ctx,
          state,
          '当前循环已追加保存。继续下一行为/工序，或调用 evidence_verify_task 验证复用与业务验收任务；所有适用任务完成后再提交故事。',
        );
      });
    },
  });
  pi.registerTool({
    name: 'evidence_verify_task',
    label: 'Verify Planned Task',
    description:
      'Execute all approved checks of a verify-mode task (reused tests or Q2 acceptance) without fabricating Red. Requires completed dependencies.',
    promptSnippet:
      'Run planned reuse or acceptance checks and record real results',
    promptGuidelines: [
      'Use evidence_verify_task for approved verify-mode tasks; only the approved plan may declare not-applicable tasks with reasons.',
    ],
    parameters: Type.Object({ ...storyParameters, taskId: Type.String() }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      return withCodingLock(ctx.cwd, async () => {
        const { state, story } = await codingContext(ctx, params.storyId);
        if (state.coding.tdd.stage !== 'red')
          throw new Error('先完成当前 TDD 循环再验证其他工序');
        if (state.coding.verifications.length >= 1000)
          throw new Error('验证记录数量超过上限');
        const task = taskIn(story, params.taskId);
        if (task.mode !== 'verify')
          throw new Error(`${task.id} 不是 verify 任务`);
        requireDependencies(story, task, state.coding);
        const checks = [];
        for (const check of task.checks) {
          const { evidence } = await executeCheck(
            pi,
            ctx,
            state,
            check,
            task.reason!,
            signal,
          );
          if (!isPassingEvidence(evidence))
            throw new Error(
              `${check.id} 验证失败，任务未完成：\n${evidence.output}`,
            );
          checks.push({ checkId: check.id, evidence });
        }
        state.coding.verifications.push({
          taskId: task.id,
          procedureId: task.procedureId,
          scenarioIds: task.scenarioIds,
          checks,
        });
        delete state.coding.records[params.storyId];
        appendHistory(state, 'testing_task_verified', task.id);
        return finish(
          ctx,
          state,
          `${task.id} 的 ${checks.length} 个计划检查已通过并记录。`,
        );
      });
    },
  });
}
