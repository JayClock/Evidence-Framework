import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gateArtifactPaths } from './gates.ts';
import { getPhaseDefinition, PHASE_ORDER } from './phases.ts';
import { buildCurrentPrompt, buildPhaseGuard } from './prompts.ts';
import { writeTestingInputs } from './testing-test-support.ts';
import { testingInputDigest } from './test-plan.ts';
import {
  createInitialState,
  DEFAULT_CONFIG,
  readText,
  REQUIREMENTS_PATH,
  writeTextAtomic,
} from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const tasks = PHASE_ORDER.flatMap((phase) => {
  const artifacts = getPhaseDefinition(phase).artifacts;
  return (artifacts.length ? artifacts.map((_, index) => index) : [0]).map(
    (index) => ({ phase, index }),
  );
});

async function preparePromptRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evidence-prompt-'));
  roots.push(root);
  // Use real instructions and placeholder upstream files, never an interview snapshot.
  const inputs = new Set([REQUIREMENTS_PATH, 'README.md']);
  for (const phase of PHASE_ORDER) {
    const definition = getPhaseDefinition(phase);
    await writeTextAtomic(
      root,
      definition.skillFile,
      await readText(process.cwd(), definition.skillFile),
    );
    for (const artifact of definition.artifacts) {
      await writeTextAtomic(
        root,
        artifact.promptFile,
        await readText(process.cwd(), artifact.promptFile),
      );
      if (artifact.skillFile) {
        await writeTextAtomic(
          root,
          artifact.skillFile,
          await readText(process.cwd(), artifact.skillFile),
        );
      }
      for (const input of artifact.inputs) inputs.add(input);
    }
  }
  for (const input of inputs) {
    if (input.endsWith('.json')) {
      await writeTextAtomic(root, input, '{}');
    } else if (input.endsWith('.md')) {
      await writeTextAtomic(root, input, '# 已有输入');
    } else {
      await mkdir(join(root, input), { recursive: true });
    }
  }
  await writeTestingInputs(root);
  return root;
}

const testingTemplates = [
  {
    key: 'story-map',
    fragments: [
      '验收场景 ID',
      'AC-001-01',
      '示例数据',
      '质量约束',
      '"kind": "acceptance-catalog"',
    ],
  },
  {
    key: 'test-strategy',
    fragments: [
      'Q1：',
      'Q2：',
      'Q3：',
      'Q4：',
      '测试替身',
      '不保证 Q1 同时失败',
    ],
  },
  {
    key: 'test-procedures',
    fragments: [
      'TP-*',
      '操作步骤',
      '场景实例化规则',
      'evidence_complete_tdd_cycle',
      '"kind": "test-procedures"',
    ],
  },
  {
    key: 'sprint-1-backlog',
    fragments: [
      '验收场景 ID',
      '工序 ID',
      '测试映射',
      'Q2',
      'Q1',
      '"kind": "test-plan"',
      'not-applicable',
    ],
  },
  {
    key: 'definition-of-done',
    fragments: ['Q3/Q4', '故事级', '对应测试/实现及验证结果'],
  },
  {
    key: 'final-review',
    fragments: ['验收场景 ID', 'Q3/Q4 评价', '待人工执行', '故事级'],
  },
];

describe('artifact prompt inputs', () => {
  it.each(testingTemplates)(
    '$key includes testing handoff instructions',
    async ({ key, fragments }) => {
      const spec = PHASE_ORDER.flatMap(
        (phase) => getPhaseDefinition(phase).artifacts,
      ).find((artifact) => artifact.key === key);
      expect(spec).toBeDefined();
      const template = await readText(process.cwd(), spec!.promptFile);
      for (const fragment of fragments) expect(template).toContain(fragment);
    },
  );

  it.each(tasks)(
    '$phase artifact $index uses actual methods and artifacts without interview dependencies',
    async ({ phase, index }) => {
      const root = await preparePromptRoot();
      const state = createInitialState('test', '从原始需求生成工件');
      state.phase = phase;
      state.status = 'running';
      state.currentArtifactIndex = index;
      state.coding.storyIds = ['US-001'];
      state.coding.planDigest = await testingInputDigest(root, state);
      const prompt = await buildCurrentPrompt(root, state, DEFAULT_CONFIG);
      expect(prompt).toContain(REQUIREMENTS_PATH);
      expect(prompt).not.toMatch(
        /evidence_interview|evidence-answer|interview\.md|waiting_input/,
      );
      expect(buildPhaseGuard(state)).not.toMatch(/interview|confirmation/);
      expect(gateArtifactPaths(state)).not.toContain(
        'artifacts/00-input/interview.md',
      );
      const kind = getPhaseDefinition(phase).artifacts[index]?.kind;
      expect(prompt).toContain(
        phase === 'coding'
          ? 'evidence_complete_story'
          : kind === 'fm-model'
            ? 'evidence_submit_fm_model'
            : 'evidence_submit_artifact',
      );
      if (['planning', 'coding', 'review'].includes(phase)) {
        for (const path of [
          'artifacts/03-architecture/test-strategy.md',
          'artifacts/03-architecture/test-procedures.md',
        ]) {
          expect(prompt).toContain(`- \`${path}\``);
          const content = await readText(root, path);
          await rm(join(root, path));
          await expect(
            buildCurrentPrompt(root, state, DEFAULT_CONFIG),
          ).rejects.toThrow(`当前任务缺少输入：${path}`);
          await writeTextAtomic(root, path, content);
        }
      }
      if (phase === 'coding') {
        expect(prompt).toContain('验收场景 ID');
        expect(prompt).toContain('工序 ID');
        expect(prompt).toContain('故事级');
        expect(prompt).toContain('evidence_complete_tdd_cycle');
        expect(prompt).toContain('evidence_verify_task');
        expect(prompt).toContain('TASK-001-01 / TP-DOMAIN / tdd');
        expect(prompt).toContain('CHECK-001-01: npm test -- feature.spec.ts');
        expect(prompt).toContain('不证明断言语义');
      }
      await rm(join(root, REQUIREMENTS_PATH));
      await expect(
        buildCurrentPrompt(root, state, DEFAULT_CONFIG),
      ).rejects.toThrow('当前任务缺少输入');
    },
  );
});
