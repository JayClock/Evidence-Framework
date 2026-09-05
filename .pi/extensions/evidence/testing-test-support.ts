import { getPhaseDefinition } from './phases.ts';
import { qualityHarness, validDocument } from './quality-test-support.ts';
import {
  createInitialState,
  readText,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import { testingInputDigest } from './test-plan.ts';
import { testingPlan } from './testing-fixtures.ts';
import { saveStoryRecord } from './testing-evidence.ts';
import type { EvidenceState } from './types.ts';
export {
  acceptanceCatalog,
  procedureCatalog,
  testingPlan,
  manifest,
} from './testing-fixtures.ts';

export async function writeTestingInputs(root: string): Promise<void> {
  if (!(await readText(root, 'artifacts/00-input/requirements.md')))
    await writeTextAtomic(
      root,
      'artifacts/00-input/requirements.md',
      '# 测试原始需求',
    );
  for (const phase of [
    'requirements',
    'domain',
    'architecture',
    'planning',
  ] as const) {
    for (const spec of getPhaseDefinition(phase).artifacts) {
      if (spec.kind === 'fm-model') continue;
      await writeTextAtomic(root, spec.output, validDocument(spec));
    }
  }
  await writeTextAtomic(
    root,
    'artifacts/02-domain/fm-model/status.md',
    '# FM 不适用',
  );
  await writeTextAtomic(
    root,
    'src/feature.spec.ts',
    'test("feature", () => expect(feature()).toBe(true));',
  );
  await writeTextAtomic(
    root,
    'src/acceptance.spec.ts',
    'test("acceptance", () => expect(response.status).toBe(200));',
  );
  await writeTextAtomic(root, 'README.md', '# 测试项目');
  await writeTextAtomic(
    root,
    '.pi/skills/evidence-tdd/SKILL.md',
    await readText(process.cwd(), '.pi/skills/evidence-tdd/SKILL.md'),
  );
}
export async function codingHarness(roots: string[]) {
  const harness = await qualityHarness(roots);
  await writeTestingInputs(harness.root);
  const state = createInitialState('test', '多工序故事');
  state.phase = 'coding';
  state.status = 'ready';
  state.modeling.applicable = false;
  state.modeling.rationale = '技术测试不涉及履约模型。';
  // Simulate the digest and ordered story IDs bound by a passed Planning Gate.
  state.coding.storyIds = ['US-001'];
  state.coding.planDigest = await testingInputDigest(harness.root, state);
  await saveState(harness.root, state);
  harness.api.exec.mockResolvedValue({
    code: 1,
    stdout: '',
    stderr: 'not a git repository',
    killed: false,
  });
  await harness.command('evidence-run');
  harness.api.exec.mockClear();
  harness.api.exec.mockResolvedValue({
    code: 0,
    stdout: '2 tests passed',
    stderr: '',
    killed: false,
  });
  return harness;
}
// Isolated runner tests use explicit synthetic evidence; end-to-end tests use only registered tools.
export async function seedCompletedStory(
  root: string,
  state: EvidenceState,
): Promise<void> {
  await writeTestingInputs(root);
  state.coding.storyIds = ['US-001'];
  state.coding.planDigest = await testingInputDigest(root, state);
  const story = testingPlan.stories[0];
  const [domain, acceptance] = story.tasks;
  const evidence = (command: string, exitCode = 0) => ({
    command,
    exitCode,
    killed: false,
    output: exitCode ? 'expected false to be true' : '2 tests passed',
    observation: '测试夹具',
    recordedAt: '2026-01-01T00:00:00.000Z',
  });
  state.coding.cycles = [
    {
      id: 1,
      taskId: domain.id,
      checkId: domain.checks[0].id,
      procedureId: domain.procedureId,
      scenarioIds: domain.scenarioIds,
      testFileHashes: { 'src/feature.spec.ts': 'a'.repeat(64) },
      red: evidence(domain.checks[0].command, 1),
      green: evidence(domain.checks[0].command),
      refactor: evidence(domain.checks[0].command),
    },
  ];
  state.coding.verifications = [
    {
      taskId: acceptance.id,
      procedureId: acceptance.procedureId,
      scenarioIds: acceptance.scenarioIds,
      checks: [
        {
          checkId: acceptance.checks[0].id,
          evidence: evidence(acceptance.checks[0].command),
        },
      ],
    },
  ];
  await writeTextAtomic(
    root,
    'src/feature.ts',
    'export function feature() { return true; }',
  );
  await writeTextAtomic(
    root,
    'reports/coding-fixture.md',
    '# Synthetic unit-test fixture report',
  );
  await writeJsonAtomic(root, 'reports/coding-fixture.json', {
    fixture: true,
    passed: true,
  });
  await saveStoryRecord(root, state, story, {
    version: 1,
    runId: state.runId,
    storyId: story.id,
    planDigest: state.coding.planDigest,
    cycles: state.coding.cycles,
    verifications: state.coding.verifications,
    revisionStart: 0,
    changedFiles: ['src/feature.ts', 'src/feature.spec.ts'],
    summary: '测试夹具中的已完成故事',
    refactorSummary: '保持外部行为不变',
    reportPath: 'reports/coding-fixture.md',
    passed: true,
  });
}
export const redParameters = {
  storyId: 'US-001',
  taskId: 'TASK-001-01',
  checkId: 'CHECK-001-01',
  command: 'npm test -- feature.spec.ts',
  expectedFailure:
    '功能返回 false，断言应因期望 true 而失败，证明当前行为缺失。',
};
export async function completeMockCycle(
  h: Awaited<ReturnType<typeof codingHarness>>,
  params = redParameters,
): Promise<void> {
  h.api.exec.mockResolvedValueOnce({
    code: 1,
    stdout: 'AssertionError: expected false to be true',
    stderr: '',
    killed: false,
  });
  await h.tool('evidence_tdd_red', params);
  await writeTextAtomic(
    h.root,
    'src/feature.ts',
    'export function feature() { return true; }',
  );
  await h.tool('evidence_tdd_green', {
    storyId: params.storyId,
    observation: '最小实现使当前行为通过。',
  });
  await h.tool('evidence_complete_tdd_cycle', {
    storyId: params.storyId,
    refactorSummary: '整理当前行为的实现命名，保持聚焦测试通过。',
  });
}
export const completionParameters = {
  storyId: 'US-001',
  summary:
    '实现当前故事的正常和异常场景，并以领域测试和真实路径的业务验收测试核对行为，不使用文档声明替代实际执行。',
  changedFiles: ['src/feature.ts', 'src/feature.spec.ts'],
  refactorSummary: '整理边界和命名，保持所有场景及工序验证的外部行为不变。',
};
