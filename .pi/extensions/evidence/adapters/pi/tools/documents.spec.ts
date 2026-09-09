import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getPhaseDefinition } from '../../../phases.ts';
import {
  createInitialState,
  loadState,
  projectEntryExists,
  readText,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from '../../../storage.ts';
import { seedDiscovery } from '../../../tests/support/discovery-test-support.ts';
import {
  qualityHarness,
  validDocument,
} from '../../../tests/support/quality-test-support.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function freshHarness(config = {}) {
  const harness = await qualityHarness(roots, config);
  const state = createInitialState('test', '交互发现后再定稿的范围');
  state.status = 'running';
  state.modeling.applicable = false;
  await seedDiscovery(harness.root, state);
  await saveState(harness.root, state);
  return { ...harness, state };
}
const notApplicable = {
  applicable: false,
  rationale:
    '当前仅提供简单工具胶水，没有独立对象身份、领域规则、协商过程或合同权责语义，因此不需要构造 FM 定义。',
  files: [],
};

async function submitModeling(h: Awaited<ReturnType<typeof freshHarness>>) {
  for (const spec of getPhaseDefinition('modeling').artifacts) {
    const state = (await loadState(h.root))!;
    state.status = 'running';
    await saveState(h.root, state);
    await h.tool(
      spec.kind === 'fm-model'
        ? 'evidence_submit_fm_model'
        : 'evidence_submit_artifact',
      spec.kind === 'fm-model'
        ? notApplicable
        : { content: validDocument(spec) },
    );
    if (spec.key === 'fulfillment-model') {
      expect(await loadState(h.root)).toMatchObject({
        phase: 'modeling',
        currentArtifactIndex: 0,
        discovery: { stage: 'discovering' },
        pendingGate: null,
      });
      await h.command('evidence-discovery', 'converge');
    }
  }
}

describe('discovery-driven formal artifact workflow', () => {
  it('submits language, FM and software requirements to a shared human gate', async () => {
    const h = await freshHarness();
    await submitModeling(h);
    const waiting = (await loadState(h.root))!;
    expect(waiting).toMatchObject({
      phase: 'modeling',
      status: 'waiting_review',
      currentArtifactIndex: 5,
    });
    expect(waiting.pendingGate?.artifactPaths).toEqual(
      expect.arrayContaining([
        waiting.discovery.path!,
        'artifacts/02-modeling/ubiquitous-language.md',
        'artifacts/02-modeling/fm-model/status.md',
        'artifacts/01-requirements/story-map.md',
      ]),
    );
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(4);
    await h.events.get('session_start')!({}, h.ctx);
    await h.command('evidence-run');
    expect((await loadState(h.root))?.status).toBe('waiting_review');
    h.ui.select.mockResolvedValue('批准并继续');
    await h.command('evidence-review');
    expect(await loadState(h.root)).toMatchObject({
      phase: 'architecture',
      status: 'ready',
    });
    expect(await readText(h.root, waiting.pendingGate!.path)).toContain(
      'decision: approved',
    );
  });

  it.each([
    { gate: 'auto', phase: 'architecture', status: 'ready' },
    { gate: 'review_if', phase: 'modeling', status: 'waiting_review' },
    { gate: 'review', phase: 'modeling', status: 'waiting_review' },
  ])(
    'applies $gate only after requirements convergence with auto-continuation off',
    async ({ gate, phase, status }) => {
      const h = await freshHarness({
        autoContinueArtifacts: false,
        gates: { modeling: gate },
      });
      await submitModeling(h);
      expect(await loadState(h.root)).toMatchObject({ phase, status });
      // Only the explicit converge command dispatches a task.
      expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects missing language at the final shared gate instead of accepting retained files', async () => {
    const h = await freshHarness();
    await submitModeling(h);
    const published = (await loadState(h.root))!;
    published.currentArtifactIndex = 4;
    published.status = 'running';
    published.pendingGate = null;
    await saveState(h.root, published);
    await rm(join(h.root, 'artifacts/02-modeling/ubiquitous-language.md'));
    const spec = getPhaseDefinition('modeling').artifacts[4];
    await expect(
      h.tool('evidence_submit_artifact', { content: validDocument(spec) }),
    ).rejects.toThrow('已发布模型文件已变化');
    expect((await loadState(h.root))?.pendingGate).toBeNull();
  });

  it('allows reset of unsupported state v5 but never reuses its discovery decisions', async () => {
    const h = await freshHarness();
    await writeJsonAtomic(h.root, '.evidence/state.json', {
      ...h.state,
      version: 5,
    });
    await expect(loadState(h.root)).rejects.toThrow('unsupported version 5');
    h.ui.select.mockResolvedValue('仅重置状态，保留所有工件');
    h.ui.confirm.mockResolvedValue(true);
    await h.command('evidence-reset');
    await h.command('evidence-init', '新范围');
    expect(await loadState(h.root)).toMatchObject({
      version: 6,
      phase: 'modeling',
      status: 'running',
      discovery: { stage: 'discovering', revision: 0 },
    });
    expect(h.api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('Evidence 交互式业务发现与建模'),
    );
  });

  it('revision and back reopen discovery and invalidate FM rather than regenerate personas first', async () => {
    const h = await freshHarness();
    await h.command('evidence-revise', '收窄范围');
    expect(await loadState(h.root)).toMatchObject({
      status: 'ready',
      discovery: { stage: 'discovering' },
      modeling: { applicable: false },
    });
    await h.command('evidence-run');
    expect(h.api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('交互式业务发现'),
    );
    const state = (await loadState(h.root))!;
    state.phase = 'architecture';
    state.status = 'ready';
    await saveState(h.root, state);
    h.ui.confirm.mockResolvedValue(true);
    await h.command('evidence-back');
    expect(await loadState(h.root)).toMatchObject({
      phase: 'modeling',
      status: 'ready',
      discovery: { stage: 'discovering' },
    });
  });

  it('keeps architecture test contracts and rejects missing contracts on recheck', async () => {
    const h = await freshHarness();
    const definition = getPhaseDefinition('architecture');
    h.state.phase = 'architecture';
    await saveState(h.root, h.state);
    await writeTextAtomic(
      h.root,
      definition.skillFile,
      await readText(process.cwd(), definition.skillFile),
    );
    const outputs = new Set(definition.artifacts.map((spec) => spec.output));
    for (const spec of definition.artifacts) {
      await writeTextAtomic(
        h.root,
        spec.promptFile,
        await readText(process.cwd(), spec.promptFile),
      );
      for (const input of spec.inputs) {
        if (outputs.has(input) || (await projectEntryExists(h.root, input)))
          continue;
        if (/\.(md|json)$/.test(input))
          await writeTextAtomic(h.root, input, '# 上游输入');
        else await mkdir(join(h.root, input), { recursive: true });
      }
    }
    for (const spec of definition.artifacts.slice(0, 6))
      await h.tool('evidence_submit_artifact', {
        content: validDocument(spec),
      });
    expect(await loadState(h.root)).toMatchObject({
      status: 'running',
      currentArtifactIndex: 6,
      pendingGate: null,
    });
    await expect(
      h.tool('evidence_submit_artifact', {
        content: '# 测试策略\n缺少测试边界和替身说明',
      }),
    ).rejects.toThrow('工件校验失败');
    for (const spec of definition.artifacts.slice(6))
      await h.tool('evidence_submit_artifact', {
        content: validDocument(spec),
      });
    expect((await loadState(h.root))?.pendingGate?.artifactPaths).toEqual(
      expect.arrayContaining([
        'artifacts/03-architecture/test-strategy.md',
        'artifacts/03-architecture/test-procedures.md',
      ]),
    );
    await rm(join(h.root, 'artifacts/03-architecture/test-procedures.md'));
    await h.command('evidence-check');
    expect(await loadState(h.root)).toMatchObject({
      phase: 'architecture',
      status: 'ready',
      pendingGate: null,
      round: 1,
    });
  });
});
