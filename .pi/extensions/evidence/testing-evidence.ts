import { createHash } from 'node:crypto';
import { Value } from 'typebox/value';
import {
  projectEntryExists,
  readText,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import { assertTestingInputs } from './test-plan.ts';
import {
  decodeCompletedCycles,
  decodeVerifications,
} from './testing-integrity.ts';
import {
  StoryRecordSchema,
  type CompletedTddCycle,
  type StoryRecord,
  type TaskVerification,
  type TestStory,
  type TestTask,
} from './testing-schema.ts';
import type { EvidenceState } from './types.ts';

export function taskComplete(
  task: TestTask,
  cycles: CompletedTddCycle[],
  verifications: TaskVerification[],
): boolean {
  if (task.mode === 'not-applicable') return true;
  if (task.mode === 'tdd')
    return task.checks.every((check) =>
      cycles.some(
        (cycle) => cycle.taskId === task.id && cycle.checkId === check.id,
      ),
    );
  return verifications.some(
    (verification) =>
      verification.taskId === task.id &&
      task.checks.every((check) =>
        verification.checks.some((item) => item.checkId === check.id),
      ),
  );
}
export function requireDependencies(
  story: TestStory,
  task: TestTask,
  state: Pick<EvidenceState['coding'], 'cycles' | 'verifications'>,
): void {
  for (const id of task.dependsOn) {
    const dependency = story.tasks.find((item) => item.id === id);
    if (
      !dependency ||
      !taskComplete(dependency, state.cycles, state.verifications)
    )
      throw new Error(`前置任务未完成：${id}`);
  }
}
function sameIds(left: string[], right: string[]): boolean {
  return [...left].sort().join() === [...right].sort().join();
}
export function validateStoryEvidence(
  story: TestStory,
  cycles: CompletedTddCycle[],
  verifications: TaskVerification[],
  revisionStart: number,
): void {
  decodeCompletedCycles(cycles);
  decodeVerifications(verifications);
  for (const cycle of cycles) {
    const task = story.tasks.find((item) => item.id === cycle.taskId);
    const check = task?.checks.find((item) => item.id === cycle.checkId);
    if (
      !task ||
      task.mode !== 'tdd' ||
      !check ||
      task.procedureId !== cycle.procedureId ||
      !sameIds(task.scenarioIds, cycle.scenarioIds) ||
      !sameIds(Object.keys(cycle.testFileHashes), check.testFiles) ||
      check.command !== cycle.red.command
    )
      throw new Error(`TDD 循环与已批准任务不一致：${cycle.id}`);
  }
  for (const verification of verifications) {
    const task = story.tasks.find((item) => item.id === verification.taskId);
    if (
      !task ||
      task.mode !== 'verify' ||
      task.procedureId !== verification.procedureId ||
      !sameIds(task.scenarioIds, verification.scenarioIds) ||
      !sameIds(
        task.checks.map((check) => check.id),
        verification.checks.map((check) => check.checkId),
      ) ||
      verification.checks.some(
        (check) =>
          check.evidence.command !==
          task.checks.find((item) => item.id === check.checkId)?.command,
      )
    )
      throw new Error(`验证证据与已批准任务不一致：${verification.taskId}`);
  }
  if (cycles.length <= revisionStart)
    throw new Error('缺少当前修订的完整 Red and Green/Refactor 循环');
  const missing = story.tasks.filter(
    (task) => !taskComplete(task, cycles, verifications),
  );
  if (missing.length)
    throw new Error(
      `适用任务/验收未完成：${missing.map((task) => task.id).join(', ')}`,
    );
}
export async function requireCompleteStory(
  root: string,
  state: EvidenceState,
  storyId: string,
): Promise<TestStory> {
  const plan = await assertTestingInputs(root, state);
  const story = plan.stories.find((item) => item.id === storyId);
  if (!story) throw new Error(`故事不在计划中：${storyId}`);
  if (state.coding.tdd.stage !== 'red' || state.coding.tdd.binding !== null)
    throw new Error(
      '当前 Red/Green/Refactor 循环尚未完成，请调用 evidence_complete_tdd_cycle',
    );
  validateStoryEvidence(
    story,
    state.coding.cycles,
    state.coding.verifications,
    state.coding.revisionStart,
  );
  return story;
}
export function storyRecordPath(storyId: string): string {
  if (!/^US-\d{3}$/.test(storyId)) throw new Error(`无效故事 ID：${storyId}`);
  return `artifacts/05-coding/${storyId}.json`;
}
function contentDigest(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
async function reportDigest(root: string, path: string): Promise<string> {
  if (!/^reports\/coding-[^/]+\.md$/.test(path))
    throw new Error('编码质量报告路径无效');
  const markdown = await readText(root, path);
  const json = await readText(root, path.replace(/\.md$/, '.json'));
  if (!markdown.trim() || !json.trim()) throw new Error('编码质量报告缺失');
  return contentDigest(`${markdown}\0${json}`);
}
function commandSection(
  label: string,
  evidence: CompletedTddCycle['red'],
): string {
  return `### ${label}\n\n- 命令：\`${evidence.command}\`\n- 退出码：${evidence.exitCode}\n- 时间：${evidence.recordedAt}\n- 观察：${evidence.observation}\n\n${evidence.output
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}\n`;
}
export async function saveStoryRecord(
  root: string,
  state: EvidenceState,
  story: TestStory,
  record: StoryRecord,
): Promise<void> {
  if (!Value.Check(StoryRecordSchema, record))
    throw new Error('invalid story record');
  const path = storyRecordPath(record.storyId);
  const qualityDigest = await reportDigest(root, record.reportPath);
  await writeJsonAtomic(root, path, record);
  const markdown = [
    `# ${record.storyId} TDD 执行记录`,
    `\n## 实现摘要\n\n${record.summary}`,
    `\n## 测试契约\n\n- 摘要：${record.planDigest}\n- 场景：${story.scenarioIds.join(', ')}\n- 结果：${record.passed ? '通过' : '失败'}`,
    `\n## 变更文件\n\n${record.changedFiles.map((file) => `- \`${file}\``).join('\n')}`,
    '\n## TDD 循环',
    ...record.cycles.map(
      (cycle) =>
        `\n### 循环 ${cycle.id}：${cycle.taskId} / ${cycle.checkId}\n\n- 工序：${cycle.procedureId}\n- 场景：${cycle.scenarioIds.join(', ')}\n\n${commandSection('Red', cycle.red)}\n${commandSection('Green', cycle.green)}\n${commandSection('Refactor', cycle.refactor)}`,
    ),
    '\n## 复用与验收验证',
    ...record.verifications.map(
      (verification) =>
        `\n### ${verification.taskId} / ${verification.procedureId}\n\n- 场景：${verification.scenarioIds.join(', ')}\n${verification.checks.map((check) => commandSection(check.checkId, check.evidence)).join('\n')}`,
    ),
    ...story.tasks
      .filter((task) => task.mode === 'not-applicable')
      .map(
        (task) => `\n- ${task.id} / ${task.procedureId} 不适用：${task.reason}`,
      ),
    `\n## 故事重构\n\n${record.refactorSummary}`,
    `\n## 最终质量报告\n\n- [报告](../../${record.reportPath})\n- [结构化证据](${record.storyId}.json)\n`,
  ].join('\n');
  await writeTextAtomic(root, path.replace(/\.json$/, '.md'), markdown);
  state.coding.records[record.storyId] = {
    digest: contentDigest(await readText(root, path)),
    markdownDigest: contentDigest(markdown),
    reportDigest: qualityDigest,
    reportPath: record.reportPath,
    files: [
      ...new Set([
        ...record.changedFiles,
        ...story.tasks.flatMap((task) =>
          task.checks.flatMap((check) => check.testFiles),
        ),
      ]),
    ],
  };
}
export async function loadStoryRecord(
  root: string,
  state: EvidenceState,
  storyId: string,
): Promise<StoryRecord> {
  const reference = state.coding.records[storyId];
  const content = await readText(root, storyRecordPath(storyId));
  if (!reference || !content || reference.digest !== contentDigest(content))
    throw new Error(`${storyId} 的结构化编码记录缺失或摘要不符`);
  let record: unknown;
  try {
    record = JSON.parse(content);
  } catch {
    throw new Error(`${storyId} 编码记录 JSON 无效`);
  }
  if (
    !Value.Check(StoryRecordSchema, record) ||
    record.storyId !== storyId ||
    record.runId !== state.runId ||
    record.planDigest !== state.coding.planDigest ||
    record.reportPath !== reference.reportPath
  )
    throw new Error(`${storyId} 编码记录不属于当前运行/测试契约`);
  const markdown = await readText(
    root,
    storyRecordPath(storyId).replace(/\.json$/, '.md'),
  );
  if (
    !markdown ||
    reference.markdownDigest !== contentDigest(markdown) ||
    reference.reportDigest !== (await reportDigest(root, reference.reportPath))
  )
    throw new Error(`${storyId} 编码 Markdown/质量报告摘要不符`);
  for (const path of record.changedFiles) {
    if (!(await projectEntryExists(root, path)))
      throw new Error(`${storyId} 编码文件缺失：${path}`);
  }
  return record;
}
