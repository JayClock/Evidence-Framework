import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gateArtifactPaths } from './gates.ts';
import { getPhaseDefinition } from './phases.ts';
import { qualityHarness, validDocument } from './quality-test-support.ts';
import {
  createInitialState,
  loadState,
  projectEntryExists,
  readText,
  saveState,
  writeTextAtomic,
  writeJsonAtomic,
} from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function freshHarness(config = {}) {
  const harness = await qualityHarness(roots, config);
  const state = createInitialState('test', '直接生成可审核的需求草稿');
  state.status = 'running';
  await saveState(harness.root, state);
  return { ...harness, state };
}

describe('artifact-driven workflow without interviews', () => {
  it('submits all requirements directly, then waits for an explicit human gate decision', async () => {
    const { root, api, ctx, events, ui, tool, command } = await freshHarness();
    for (const spec of getPhaseDefinition('requirements').artifacts) {
      await tool('evidence_submit_artifact', { content: validDocument(spec) });
    }
    const waiting = (await loadState(root))!;
    expect(waiting).toMatchObject({
      phase: 'requirements',
      status: 'waiting_review',
    });
    expect(waiting.pendingGate).not.toBeNull();
    expect(gateArtifactPaths(waiting)).not.toContain(
      'artifacts/00-input/interview.md',
    );
    expect(api.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(api.sendUserMessage.mock.calls.flat().join(' ')).not.toMatch(
      /evidence_interview|interview\.md/,
    );

    await events.get('session_start')!({}, ctx);
    await command('evidence-run');
    expect((await loadState(root))?.status).toBe('waiting_review');
    expect(api.sendUserMessage).toHaveBeenCalledTimes(2);
    ui.select.mockResolvedValue('批准并继续');
    await command('evidence-review');
    expect(await loadState(root)).toMatchObject({
      phase: 'modeling',
      status: 'ready',
    });
    expect(await readText(root, waiting.pendingGate!.path)).toContain(
      'decision: approved',
    );
  });

  it('submits testing contracts before the architecture gate and rejects missing contracts on recheck', async () => {
    const { root, state, api, tool, command } = await freshHarness();
    const definition = getPhaseDefinition('architecture');
    expect(definition.artifacts).toHaveLength(8);
    state.phase = 'architecture';
    await saveState(root, state);
    await writeTextAtomic(
      root,
      definition.skillFile,
      await readText(process.cwd(), definition.skillFile),
    );
    const outputs = new Set(definition.artifacts.map((spec) => spec.output));
    for (const spec of definition.artifacts) {
      await writeTextAtomic(
        root,
        spec.promptFile,
        await readText(process.cwd(), spec.promptFile),
      );
      for (const input of spec.inputs) {
        if (outputs.has(input) || (await projectEntryExists(root, input)))
          continue;
        if (/\.(md|json)$/.test(input)) {
          await writeTextAtomic(root, input, '# 已有上游输入');
        } else {
          await mkdir(join(root, input), { recursive: true });
        }
      }
    }
    for (const spec of definition.artifacts.slice(0, 6)) {
      await tool('evidence_submit_artifact', { content: validDocument(spec) });
    }
    expect(await loadState(root)).toMatchObject({
      status: 'running',
      currentArtifactIndex: 6,
      pendingGate: null,
    });
    expect(api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('artifacts/03-architecture/test-strategy.md'),
      { deliverAs: 'followUp' },
    );
    await expect(
      tool('evidence_submit_artifact', {
        content: '# 测试策略\n缺少测试边界和替身说明',
      }),
    ).rejects.toThrow('工件校验失败');
    for (const spec of definition.artifacts.slice(6)) {
      await tool('evidence_submit_artifact', { content: validDocument(spec) });
    }
    const waiting = (await loadState(root))!;
    expect(waiting.status).toBe('waiting_review');
    expect(waiting.pendingGate?.artifactPaths).toEqual(
      expect.arrayContaining([
        'artifacts/03-architecture/test-strategy.md',
        'artifacts/03-architecture/test-procedures.md',
      ]),
    );
    await rm(join(root, 'artifacts/03-architecture/test-procedures.md'));
    await command('evidence-check');
    expect(await loadState(root)).toMatchObject({
      phase: 'architecture',
      status: 'ready',
      pendingGate: null,
      round: 1,
    });
  });

  it('continues from language into FM and finishes at the modeling gate for glue-only scope', async () => {
    const { root, state, api, tool, command, ui } = await freshHarness();
    state.phase = 'modeling';
    state.currentArtifactIndex = 0;
    await saveState(root, state);
    const specs = getPhaseDefinition('modeling').artifacts;
    await writeTextAtomic(root, specs[0]!.output, validDocument(specs[0]!));
    await writeTextAtomic(
      root,
      '.pi/skills/evidence-modeling/SKILL.md',
      '# FM 方法',
    );
    await tool('evidence_submit_artifact', {
      content: validDocument(specs[0]!),
    });
    expect(api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('evidence_submit_fm_model'),
      { deliverAs: 'followUp' },
    );
    expect(api.setActiveTools).toHaveBeenLastCalledWith([
      'read',
      'bash',
      'evidence_submit_fm_model',
    ]);
    await tool('evidence_submit_fm_model', {
      applicable: false,
      rationale:
        '当前只是简单工具胶水，无独立对象身份、领域规则、关系、签约前协商或履约语义，不需 FM 建模。',
      files: [],
    });
    expect(await loadState(root)).toMatchObject({
      phase: 'modeling',
      status: 'waiting_review',
      currentArtifactIndex: 2,
      modeling: {
        applicable: false,
        machineValidated: false,
        simulationPassed: null,
      },
    });
    expect(api.exec).not.toHaveBeenCalled();
    expect(api.sendUserMessage).toHaveBeenCalledTimes(1);
    const waiting = (await loadState(root))!;
    expect(waiting.pendingGate?.artifactPaths).toEqual(
      expect.arrayContaining([
        'artifacts/02-modeling/ubiquitous-language.md',
        'artifacts/02-modeling/fm-model/status.md',
      ]),
    );
    // No retired DDD files exist; approval must still allow architecture to start.
    const architecture = getPhaseDefinition('architecture');
    for (const path of [
      architecture.skillFile,
      architecture.artifacts[0].promptFile,
    ]) {
      await writeTextAtomic(root, path, await readText(process.cwd(), path));
    }
    ui.select.mockResolvedValue('批准并继续');
    await command('evidence-review');
    expect(await loadState(root)).toMatchObject({
      phase: 'architecture',
      status: 'ready',
    });
    await command('evidence-run');
    expect(await loadState(root)).toMatchObject({
      phase: 'architecture',
      status: 'running',
    });
    expect(api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('artifacts/03-architecture/context-map.md'),
    );
  });

  it.each([
    { gate: 'auto', phase: 'architecture', status: 'ready' },
    { gate: 'review_if', phase: 'modeling', status: 'waiting_review' },
    { gate: 'review', phase: 'modeling', status: 'waiting_review' },
  ])(
    'completes FM with $gate policy even when auto-continuation is off',
    async ({ gate, phase, status }) => {
      const { root, state, api, tool } = await freshHarness({
        autoContinueArtifacts: false,
        gates: { modeling: gate },
      });
      state.phase = 'modeling';
      state.currentArtifactIndex = 1;
      const spec = getPhaseDefinition('modeling').artifacts[0];
      await writeTextAtomic(root, spec.output, validDocument(spec));
      await saveState(root, state);
      const result = await tool('evidence_submit_fm_model', {
        applicable: false,
        rationale:
          '仅本地工具胶水，没有独立对象身份、领域规则、渠道协商或履约语义；不适用决策仍需审核。',
        files: [],
      });
      expect(result).toMatchObject({
        terminate: true,
        details: { passed: true },
      });
      expect(await loadState(root)).toMatchObject({ phase, status });
      expect(api.sendUserMessage).not.toHaveBeenCalled();
    },
  );

  it('does not gate a final FM submission when the language artifact is missing', async () => {
    const { root, state, tool } = await freshHarness();
    state.phase = 'modeling';
    state.currentArtifactIndex = 1;
    await saveState(root, state);
    await tool('evidence_submit_fm_model', {
      applicable: false,
      rationale:
        '仅本地工具胶水，没有独立对象身份、领域规则、渠道协商或履约语义；仍不得跳过统一语言工件。',
      files: [],
    });
    expect(await loadState(root)).toMatchObject({
      phase: 'modeling',
      status: 'ready',
      round: 1,
      currentArtifactIndex: 0,
      pendingGate: null,
    });
  });

  it('retains structural failures and prevents check or review from skipping missing artifacts', async () => {
    const { root, tool, command } = await freshHarness();
    await expect(
      tool('evidence_submit_artifact', { content: '# 空草稿' }),
    ).rejects.toThrow('工件校验失败');
    await rm(`${root}/artifacts/01-requirements/story-map.md`);
    await command('evidence-check');
    expect(await loadState(root)).toMatchObject({
      phase: 'requirements',
      status: 'ready',
      round: 1,
      pendingGate: null,
    });
    await command('evidence-review');
    expect((await loadState(root))?.phase).toBe('requirements');
  });

  it('allows an explicit reset of unsupported state followed by a fresh artifact run', async () => {
    const { root, state, command, ui, api } = await freshHarness();
    await writeJsonAtomic(root, '.evidence/state.json', {
      ...state,
      version: 1,
    });
    await expect(loadState(root)).rejects.toThrow('unsupported version 1');
    const input = await readText(root, 'artifacts/00-input/requirements.md');
    ui.select.mockResolvedValue('仅重置状态，保留所有工件');
    ui.confirm.mockResolvedValue(true);
    await command('evidence-reset');
    expect(await loadState(root)).toBeNull();
    expect(await readText(root, 'artifacts/00-input/requirements.md')).toBe(
      input,
    );
    await command('evidence-init', '新工作流');
    expect(await loadState(root)).toMatchObject({
      version: 5,
      phase: 'requirements',
      status: 'running',
    });
    expect(api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('personas.md'),
    );
  });

  it('revision and back preserve feedback but invalidate stale FM decisions without starting an interview', async () => {
    const { root, state, command, ui, api } = await freshHarness();
    state.modeling = {
      applicable: true,
      rationale: '旧范围',
      machineValidated: true,
      simulationPassed: true,
      files: [],
    };
    await saveState(root, state);
    await command('evidence-revise', '收窄范围为本地目录');
    expect(await loadState(root)).toMatchObject({
      status: 'ready',
      feedback: '收窄范围为本地目录',
      modeling: { applicable: null, machineValidated: false },
    });
    await command('evidence-run');
    expect(api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('personas.md'),
    );
    const current = (await loadState(root))!;
    current.phase = 'architecture';
    current.status = 'ready';
    current.modeling.applicable = true;
    await saveState(root, current);
    ui.confirm.mockResolvedValue(true);
    await command('evidence-back');
    expect(await loadState(root)).toMatchObject({
      phase: 'modeling',
      status: 'ready',
      modeling: { applicable: null },
    });
  });
});
