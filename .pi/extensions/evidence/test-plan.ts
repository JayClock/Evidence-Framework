import { createHash } from 'node:crypto';
import {
  discoveryEvidencePaths,
  loadDiscovery,
  requireFinalizing,
} from './discovery.ts';
import type { Static, TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { getPhaseDefinition } from './phases.ts';
import { readText, REQUIREMENTS_PATH } from './storage.ts';
import {
  validateFocusedTestCommand,
  validateTestFilePath,
} from './test-files.ts';
import {
  AcceptanceCatalogSchema,
  ProcedureCatalogSchema,
  TestPlanSchema,
  type AcceptanceCatalog,
  type ProcedureCatalog,
  type TestPlan,
  type TestStory,
  type TestTask,
} from './testing-schema.ts';
import type { EvidenceState } from './types.ts';

export const STORY_MAP_PATH = 'artifacts/01-requirements/story-map.md';
export const PROCEDURES_PATH = 'artifacts/03-architecture/test-procedures.md';
export const BACKLOG_PATH = 'artifacts/04-planning/sprint-1-backlog.md';
export const TEST_PLAN_INPUTS = [
  REQUIREMENTS_PATH,
  ...(['modeling', 'architecture', 'planning'] as const).flatMap((phase) =>
    getPhaseDefinition(phase)
      .artifacts.filter((artifact) => artifact.kind !== 'fm-model')
      .map((artifact) => artifact.output),
  ),
] as const;

export function readManifest<T extends TSchema>(
  markdown: string,
  kind: string,
  schema: T,
): Static<T> {
  if (markdown.length > 1_000_000) throw new Error(`${kind} 工件超过大小上限`);
  const matches: unknown[] = [];
  for (const match of markdown.matchAll(
    /^```json\s*\r?\n([\s\S]*?)^```\s*$/gm,
  )) {
    let value: unknown;
    try {
      value = JSON.parse(match[1]!);
    } catch {
      throw new Error(`${kind} 工件包含无效 JSON`);
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'kind' in value &&
      value.kind === kind
    )
      matches.push(value);
  }
  if (matches.length !== 1) throw new Error(`需要且只能有一个 ${kind} JSON 块`);
  const value = matches[0];
  if (!Value.Check(schema, value))
    throw new Error(
      `${kind} JSON 结构无效：${[...Value.Errors(schema, value)]
        .slice(0, 3)
        .map((error) => `${error.instancePath} ${error.message}`)
        .join('；')}`,
    );
  return value;
}
function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`${label} ID 重复`);
}
export function acceptanceFromMarkdown(markdown: string): AcceptanceCatalog {
  const catalog = readManifest(
    markdown,
    'acceptance-catalog',
    AcceptanceCatalogSchema,
  );
  unique(
    catalog.stories.map((story) => story.id),
    '故事',
  );
  unique(
    catalog.stories.flatMap((story) => story.scenarioIds),
    '验收场景',
  );
  for (const story of catalog.stories) {
    if (
      story.scenarioIds.some((id) => !id.startsWith(`AC-${story.id.slice(3)}-`))
    )
      throw new Error(`验收场景不属于 ${story.id}`);
  }
  return catalog;
}
export function proceduresFromMarkdown(markdown: string): ProcedureCatalog {
  const catalog = readManifest(
    markdown,
    'test-procedures',
    ProcedureCatalogSchema,
  );
  unique(
    catalog.procedures.map((procedure) => procedure.id),
    '工序',
  );
  return catalog;
}
export function planFromMarkdown(markdown: string): TestPlan {
  return readManifest(markdown, 'test-plan', TestPlanSchema);
}
function validateDependencies(story: TestStory): void {
  const tasks = new Map(story.tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`任务依赖成环：${id}`);
    if (visited.has(id)) return;
    const task = tasks.get(id);
    if (!task) throw new Error(`前置任务不存在或跨故事：${id}`);
    visiting.add(id);
    task.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  story.tasks.forEach((task) => visit(task.id));
}
function validateTask(
  task: TestTask,
  story: TestStory,
  procedures: ProcedureCatalog,
): void {
  const procedure = procedures.procedures.find(
    (item) => item.id === task.procedureId,
  );
  if (!procedure) throw new Error(`工序不存在：${task.procedureId}`);
  if (procedure.quadrant !== 'Q1' && procedure.quadrant !== 'Q2')
    throw new Error(
      `${task.id} 自动执行计划仅支持 Q1/Q2；Q3/Q4 人工评价仍按 DoD 审核`,
    );
  if (task.scenarioIds.some((id) => !story.scenarioIds.includes(id)))
    throw new Error(`${task.id} 引用了故事外的验收场景`);
  if (task.mode !== 'tdd' && !task.reason?.trim())
    throw new Error(`${task.id} 的复用/不适用理由缺失`);
  if ((task.mode === 'not-applicable') !== (task.checks.length === 0))
    throw new Error(`${task.id} 的检查项与适用性不一致`);
  for (const check of task.checks) {
    if (validateFocusedTestCommand(check.command) !== check.command)
      throw new Error(`${check.id} 命令含首尾空白`);
    check.testFiles.forEach(validateTestFilePath);
  }
}
export function validateTestPlan(
  plan: TestPlan,
  acceptance: AcceptanceCatalog,
  procedures: ProcedureCatalog,
): void {
  unique(
    plan.stories.map((story) => story.id),
    'Sprint 故事',
  );
  unique(
    plan.stories.flatMap((story) => story.tasks.map((task) => task.id)),
    '任务',
  );
  unique(
    plan.stories.flatMap((story) =>
      story.tasks.flatMap((task) => task.checks.map((check) => check.id)),
    ),
    '检查项',
  );
  for (const story of plan.stories) {
    const source = acceptance.stories.find((item) => item.id === story.id);
    if (
      !source ||
      [...source.scenarioIds].sort().join() !==
        [...story.scenarioIds].sort().join()
    )
      throw new Error(
        `${story.id} 的验收场景与需求目录不一致，不能漏验或增加未批准场景`,
      );
    story.tasks.forEach((task) => validateTask(task, story, procedures));
    validateDependencies(story);
    if (!story.tasks.some((task) => task.mode === 'tdd'))
      throw new Error(`${story.id} 至少需要一个真实 TDD 开发任务`);
    for (const scenarioId of story.scenarioIds) {
      const tasks = story.tasks.filter((task) =>
        task.scenarioIds.includes(scenarioId),
      );
      const quadrant = (task: TestTask) =>
        procedures.procedures.find((item) => item.id === task.procedureId)!
          .quadrant;
      if (
        !tasks.some(
          (task) => quadrant(task) === 'Q2' && task.mode !== 'not-applicable',
        )
      )
        throw new Error(`${scenarioId} 缺少可执行 Q2 验收任务`);
      if (!tasks.some((task) => quadrant(task) === 'Q1'))
        throw new Error(
          `${scenarioId} 缺少关联 Q1 任务或经计划声明的不适用理由`,
        );
    }
  }
}
export async function loadTestPlan(
  root: string,
  backlog?: string,
): Promise<TestPlan> {
  const acceptance = acceptanceFromMarkdown(
    await readText(root, STORY_MAP_PATH),
  );
  const procedures = proceduresFromMarkdown(
    await readText(root, PROCEDURES_PATH),
  );
  const plan = planFromMarkdown(
    backlog ?? (await readText(root, BACKLOG_PATH)),
  );
  validateTestPlan(plan, acceptance, procedures);
  return plan;
}
export function testingEvidencePaths(state: EvidenceState): string[] {
  return [
    ...new Set([
      ...TEST_PLAN_INPUTS,
      '.pi/evidence.json',
      'artifacts/02-modeling/fm-model/status.md',
      ...state.modeling.files,
      ...discoveryEvidencePaths(state),
    ]),
  ];
}
export async function testingInputDigest(
  root: string,
  state: EvidenceState,
): Promise<string> {
  const hash = createHash('sha256');
  const sourcePaths = state.discovery.path
    ? Object.keys((await loadDiscovery(root, state)).sourceHashes)
    : [];
  for (const path of [
    ...new Set([...testingEvidencePaths(state), ...sourcePaths]),
  ].sort()) {
    const content = await readText(root, path);
    if (!content && path !== '.pi/evidence.json')
      throw new Error(`测试契约输入缺失：${path}`);
    hash.update(path).update('\0').update(content).update('\0');
  }
  return hash.digest('hex');
}
export async function assertTestingInputs(
  root: string,
  state: EvidenceState,
): Promise<TestPlan> {
  await requireFinalizing(root, state);
  if (
    !state.coding.planDigest ||
    (await testingInputDigest(root, state)) !== state.coding.planDigest
  ) {
    throw new Error(
      '测试契约已变化或尚未绑定，请回退 Planning 修订并重新审核，不能复用旧证据。',
    );
  }
  const plan = await loadTestPlan(root);
  if (
    plan.stories.map((story) => story.id).join() !==
    state.coding.storyIds.join()
  )
    throw new Error('测试契约故事顺序与状态不一致');
  return plan;
}
export async function validateTestingArtifact(
  root: string,
  key: string,
  content: string,
): Promise<void> {
  if (key === 'story-map') acceptanceFromMarkdown(content);
  if (key === 'test-procedures') proceduresFromMarkdown(content);
  if (key === 'sprint-1-backlog') await loadTestPlan(root, content);
}
