import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { gateArtifactPaths } from './gates.ts';
import { getPhaseDefinition } from './phases.ts';
import { qualityHarness, validDocument } from './quality-test-support.ts';
import {
  createInitialState,
  loadState,
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

async function freshHarness() {
  const harness = await qualityHarness(roots);
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
      phase: 'domain',
      status: 'ready',
    });
    expect(await readText(root, waiting.pendingGate!.path)).toContain(
      'decision: approved',
    );
  });

  it('continues from bounded contexts directly into FM and accepts the explicit non-applicable branch', async () => {
    const { root, state, api, tool } = await freshHarness();
    state.phase = 'domain';
    state.currentArtifactIndex = 1;
    await saveState(root, state);
    const specs = getPhaseDefinition('domain').artifacts;
    await writeTextAtomic(root, specs[0]!.output, validDocument(specs[0]!));
    await writeTextAtomic(
      root,
      '.pi/skills/evidence-modeling/SKILL.md',
      '# FM 方法',
    );
    await tool('evidence_submit_artifact', {
      content: validDocument(specs[1]!),
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
        '当前是本地技术工具，不涉及合同、权责、支付、验收、异常补偿或履约凭证链，不适用 FM。',
      files: [],
    });
    expect(await loadState(root)).toMatchObject({
      phase: 'domain',
      status: 'running',
      currentArtifactIndex: 3,
      modeling: {
        applicable: false,
        machineValidated: false,
        simulationPassed: null,
      },
    });
    expect(api.exec).not.toHaveBeenCalled();
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
      version: 2,
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
      phase: 'domain',
      status: 'ready',
      modeling: { applicable: null },
    });
  });
});
