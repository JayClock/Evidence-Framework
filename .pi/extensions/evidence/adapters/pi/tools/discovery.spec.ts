import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashArtifacts } from '../../../gates.ts';
import { digestText } from '../../../modeling/digest.ts';
import { getPhaseDefinition } from '../../../phases.ts';
import {
  assertDiscoveryReady,
  loadDiscovery,
} from '../../../state/discovery/index.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeTextAtomic,
} from '../../../storage.ts';
import {
  discoveryContent,
  seedQuestions,
} from '../../../tests/support/discovery-test-support.ts';
import { domain } from '../../../tests/support/modeling-scope-test-support.ts';
import {
  executeProcess,
  prepareFmSkill,
} from '../../../tests/support/modeling-test-support.ts';
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
const question = {
  id: 'Q-001',
  gapKey: 'input.payment-deadline',
  focus: 'responsibilities',
  target: null,
  prompt: '平台向作者承诺何时支付？',
  impact: '影响付款期限及违约规则',
  blocking: true,
  sourceRefs: ['INPUT'],
};
async function fresh() {
  const h = await qualityHarness(roots);
  h.api.exec.mockResolvedValue({
    code: 0,
    killed: false,
    stdout: '{"login":"test-reviewer"}\n',
    stderr: '',
  });
  const state = createInitialState('test', '作者结算争议');
  state.status = 'running';
  await saveState(h.root, state);
  return { ...h, state };
}
async function revision(h: Awaited<ReturnType<typeof fresh>>) {
  return (await loadState(h.root))!.discovery.revision;
}
async function saveContent(h: Awaited<ReturnType<typeof fresh>>) {
  await h.saveDiscovery({
    expectedRevision: await revision(h),
    content: discoveryContent(),
  });
}
async function answer(
  h: Awaited<ReturnType<typeof fresh>>,
  text = '每月 10 日支付上月应付稿酬。',
  mode = '事实或决定',
) {
  h.ui.editor.mockResolvedValue(text);
  h.ui.select.mockResolvedValue(mode);
  await h.command('evidence-answer', 'Q-001');
  // Simulate the automatically started agent settling before the next manual command.
  await h.events.get('agent_settled')!({}, h.ctx);
}

describe('interactive discovery state and provenance', () => {
  it('rebuilds v4 read models with explicit contract view and interaction state', async () => {
    const h = await fresh();
    expect(await loadDiscovery(h.root, h.state)).toMatchObject({
      version: 4,
      content: null,
      interaction: {
        stopped: false,
        deferredQuestionIds: [],
        activeQuestionId: null,
        needsConsolidation: false,
      },
    });
    await saveContent(h);
    expect(
      await loadDiscovery(h.root, (await loadState(h.root))!),
    ).toMatchObject({
      version: 4,
      content: { contractView: { current: null, contracts: [] } },
      interaction: {
        stopped: false,
        deferredQuestionIds: [],
        activeQuestionId: null,
        needsConsolidation: false,
      },
    });
  });

  it.each([
    'v1',
    'v2',
    'v3',
    'missing-event',
    'missing-records',
    'missing-summary',
  ])(
    'rejects %s snapshots without migration or state changes',
    async (kind) => {
      const h = await fresh();
      await saveContent(h);
      const state = (await loadState(h.root))!;
      const snapshot = JSON.parse(
        await readText(h.root, state.discovery.path!),
      );
      if (kind === 'v1') snapshot.version = 1;
      if (kind === 'v2') snapshot.version = 2;
      if (kind === 'v3') snapshot.version = 3;
      if (kind === 'missing-event') delete snapshot.event;
      if (kind === 'missing-records') delete snapshot.event.submission.records;
      if (kind === 'missing-summary') delete snapshot.event.submission.summary;
      const raw = JSON.stringify(snapshot);
      await writeTextAtomic(h.root, state.discovery.path!, raw);
      state.discovery.digest = digestText(raw);
      await saveState(h.root, state);
      const before = await readText(h.root, '.evidence/state.json');
      await expect(loadDiscovery(h.root, state)).rejects.toThrow(
        kind.startsWith('v')
          ? '仅支持发现记录 v4'
          : '发现记录结构或运行版本不一致',
      );
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect(await readText(h.root, state.discovery.path!)).toBe(raw);
    },
  );

  it('requires contractView in new submissions and rejects the old position shape', async () => {
    const h = await fresh();
    const content: Record<string, unknown> = { ...discoveryContent() };
    delete content.contractView;
    content.position = null;
    await expect(
      h.tool('evidence_save_discovery', { expectedRevision: 0, content }),
    ).rejects.toThrow();
    expect(await revision(h)).toBe(0);
  });

  it('shows discovery as the current subject until formalization, not the future language artifact', async () => {
    const h = await fresh();
    await h.command('evidence-status');
    expect(h.api.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('当前对象：业务上下文识别与发现'),
      }),
    );
    expect(h.api.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('从业务叙述识别上下文'),
      }),
    );
    await saveContent(h);
    await h.tool('evidence_finalize_discovery', { expectedRevision: 1 });
    await h.command('evidence-status');
    expect(h.api.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          `当前对象：${getPhaseDefinition('modeling').artifacts[0].label}`,
        ),
      }),
    );
  });

  it('shows the business question without workflow metadata, preserving provenance in the snapshot', async () => {
    const h = await fresh();
    const result = await h.tool('evidence_ask_questions', {
      expectedRevision: 0,
      questions: [question],
    });
    const context = '当前问题：Q-001 平台向作者承诺何时支付？';
    expect(result).toMatchObject({
      terminate: true,
      content: [{ type: 'text', text: expect.stringContaining(context) }],
    });
    await answer(h);
    expect(h.ui.editor).toHaveBeenCalledWith(
      expect.stringContaining(context),
      '',
    );
    const saved = await loadDiscovery(h.root, (await loadState(h.root))!);
    expect(saved.questions[0]).toEqual(question);
    expect(h.ui.editor.mock.lastCall![0]).not.toContain('定稿阻塞');
  });

  it('rejects premature formal submission and stage checks cannot bypass discovery', async () => {
    const h = await fresh();
    await expect(
      h.tool('evidence_submit_artifact', {
        content: validDocument(getPhaseDefinition('modeling').artifacts[0]),
      }),
    ).rejects.toThrow('先完成交互发现');
    await h.command('evidence-check');
    expect(await loadState(h.root)).toMatchObject({
      currentArtifactIndex: 0,
      round: 0,
      pendingGate: null,
    });
  });

  it('persists questions across settled/reload and records partial human answers without a revision round', async () => {
    const h = await fresh();
    await seedQuestions(h.root, h.state, [
      question,
      { ...question, id: 'Q-002', prompt: '谁核对账单？' },
    ]);
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.events.get('session_start')!({}, h.ctx);
    await h.command('evidence-run');
    expect(await loadState(h.root)).toMatchObject({
      status: 'waiting_answer',
      round: 0,
    });
    expect(h.api.sendUserMessage).not.toHaveBeenCalled();
    await answer(h);
    let state = (await loadState(h.root))!;
    expect(state.status).toBe('ready');
    const snapshot = await loadDiscovery(h.root, state);
    expect(snapshot.answers[0]).toMatchObject({
      id: 'A-001',
      text: '每月 10 日支付上月应付稿酬。',
      respondent: 'github.com/test-reviewer',
      status: 'answered',
    });
    h.ui.editor.mockResolvedValue('财务与作者共同核对');
    await h.command('evidence-answer', 'Q-002');
    await h.events.get('agent_settled')!({}, h.ctx);
    state = (await loadState(h.root))!;
    expect(state).toMatchObject({
      status: 'ready',
      round: 0,
      discovery: { revision: 5 },
    });
    await h.command('evidence-run');
    expect(h.api.sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining(state.discovery.path!),
    );
  });

  it('cancellation does not fabricate an answer; unknown remains a business blocker', async () => {
    const h = await fresh();
    await h.tool('evidence_ask_questions', {
      expectedRevision: 0,
      questions: [question],
    });
    const before = await readText(h.root, '.evidence/state.json');
    h.ui.editor.mockResolvedValue(undefined);
    await h.command('evidence-answer', 'Q-001');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    await answer(h, '未确认期限，需要咨询业务方。', '未知，仍需澄清');
    await h.command('evidence-run');
    await saveContent(h);
    await expect(
      h.tool('evidence_finalize_discovery', {
        expectedRevision: await revision(h),
      }),
    ).rejects.toThrow('阻塞问题未解决');
    expect((await loadState(h.root))?.round).toBe(0);
  });

  it('rejects stale writes and source references instead of overwriting new answers', async () => {
    const h = await fresh();
    await h.tool('evidence_ask_questions', {
      expectedRevision: 0,
      questions: [question],
    });
    await answer(h);
    await h.command('evidence-run');
    await expect(
      h.saveDiscovery({
        expectedRevision: 1,
        content: discoveryContent(),
      }),
    ).rejects.toThrow('版本已改变');
    const content = discoveryContent();
    content.candidates[0].sourceRefs = ['A-999'];
    await expect(
      h.saveDiscovery({ expectedRevision: 2, content }),
    ).rejects.toThrow('来源不存在');
  });

  it('serializes concurrent discovery mutations and rejects the stale sibling', async () => {
    const h = await fresh();
    const results = await Promise.allSettled([
      h.saveDiscovery({
        expectedRevision: 0,
        content: discoveryContent(),
      }),
      h.saveDiscovery({
        expectedRevision: 0,
        content: discoveryContent(),
      }),
    ]);
    expect(results.map((value) => value.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(await revision(h)).toBe(1);
  });

  it('detects changed material and forbids generated artifacts as independent sources', async () => {
    const h = await fresh();
    const content = discoveryContent();
    content.sources = [
      { id: 'SRC-001', path: 'contract.md', locator: '第 2 条' },
    ];
    await writeTextAtomic(h.root, 'contract.md', '按确认账期结算');
    await h.saveDiscovery({ expectedRevision: 0, content });
    await writeTextAtomic(h.root, 'contract.md', '改成提前结算');
    await expect(
      h.tool('evidence_finalize_discovery', { expectedRevision: 1 }),
    ).rejects.toThrow('原始材料已变化');
    content.sources[0].path = 'artifacts/02-modeling/fm-model/status.md';
    await expect(
      h.saveDiscovery({ expectedRevision: 1, content }),
    ).rejects.toThrow('而非模型或报告');
  });

  it('detects tampering in historical snapshots, not only the current pointer', async () => {
    const h = await fresh();
    await saveContent(h);
    const original = (await loadState(h.root))!.discovery.path!;
    await saveContent(h);
    await writeTextAtomic(h.root, original, '{}');
    await expect(
      h.tool('evidence_finalize_discovery', { expectedRevision: 2 }),
    ).rejects.toThrow('摘要不一致');
  });

  it('cannot hide a generated source behind a symlink', async () => {
    const h = await fresh();
    await symlink(
      join(h.root, '.evidence/state.json'),
      join(h.root, 'source.md'),
    );
    const content = discoveryContent();
    content.sources = [{ id: 'SRC-001', path: 'source.md', locator: '引用' }];
    await expect(
      h.saveDiscovery({ expectedRevision: 0, content }),
    ).rejects.toThrow('受保护记录');
    expect(await revision(h)).toBe(0);
  });

  it('rejects oversized human text before persistence and keeps saved discovery a valid checkpoint', async () => {
    const h = await fresh();
    await h.tool('evidence_ask_questions', {
      expectedRevision: 0,
      questions: [question],
    });
    await expect(answer(h, '字'.repeat(4001))).rejects.toThrow(
      '超限或格式无效',
    );
    expect(await loadState(h.root)).toMatchObject({
      status: 'waiting_answer',
      discovery: { revision: 1 },
    });
    await answer(h);
    await h.command('evidence-run');
    await saveContent(h);
    await h.events.get('agent_settled')!({}, h.ctx);
    expect(await loadState(h.root)).toMatchObject({
      status: 'ready',
      lastError: null,
      round: 0,
    });
  });

  it('needs sourced cases for all three replay dimensions and never promotes inferred model facts', async () => {
    const h = await fresh();
    const content = discoveryContent();
    content.cases.pop();
    await h.saveDiscovery({ expectedRevision: 0, content });
    await expect(
      h.tool('evidence_finalize_discovery', { expectedRevision: 1 }),
    ).rejects.toThrow('exception');
    const inferred = discoveryContent();
    inferred.candidates[0].confidence = 'inferred';
    inferred.candidates[0].modelRefs = ['rule.pay'];
    await h.saveDiscovery({
      expectedRevision: 1,
      content: inferred,
    });
    await expect(
      h.tool('evidence_finalize_discovery', { expectedRevision: 2 }),
    ).rejects.toThrow('未确认候选');
  });

  it('correction preserves raw history, cancels a gate and makes referenced old answers unusable', async () => {
    const h = await fresh();
    await h.tool('evidence_ask_questions', {
      expectedRevision: 0,
      questions: [question],
    });
    await answer(h);
    await h.command('evidence-run');
    const content = discoveryContent();
    content.candidates[0].sourceRefs = ['A-001'];
    await h.saveDiscovery({ expectedRevision: 2, content });
    await h.tool('evidence_finalize_discovery', { expectedRevision: 3 });
    await h.command('evidence-run');
    for (const spec of getPhaseDefinition('modeling').artifacts) {
      await h.tool(
        spec.kind === 'fm-model'
          ? 'evidence_submit_fm_model'
          : 'evidence_submit_artifact',
        spec.kind === 'fm-model'
          ? {
              applicable: false,
              rationale:
                '仅合成测试的简单集成胶水，无独立领域对象、渠道或履约语义；这里只测试状态接线，不声称业务建模完成。',
              files: [],
            }
          : { content: validDocument(spec) },
      );
    }
    const waiting = (await loadState(h.root))!;
    expect(waiting.status).toBe('waiting_review');
    const original = await readText(h.root, waiting.discovery.path!);
    await answer(h, '更正：按双方确认后的账期支付。');
    const current = (await loadState(h.root))!;
    expect(current).toMatchObject({
      status: 'ready',
      currentArtifactIndex: 0,
      pendingGate: null,
      discovery: { stage: 'discovering' },
      modeling: { applicable: null },
    });
    expect(await readText(h.root, waiting.discovery.path!)).toBe(original);
    expect(await readText(h.root, waiting.pendingGate!.path)).toContain(
      'decision: cancelled',
    );
    expect((await loadDiscovery(h.root, current)).answers).toHaveLength(2);
    await expect(assertDiscoveryReady(h.root, current)).rejects.toThrow(
      '先保存消化结果',
    );
    await h.command('evidence-run');
    await expect(
      h.saveDiscovery({
        expectedRevision: current.discovery.revision,
        content,
      }),
    ).rejects.toThrow('回答已被更正');
  });

  it('checks real FM drafts in isolation and keeps formal bytes even on successful validation', async () => {
    const h = await fresh();
    await prepareFmSkill(h.root);
    h.api.exec.mockImplementation(executeProcess);
    await saveContent(h);
    const path = 'artifacts/02-modeling/fm-model/model.yaml';
    await writeTextAtomic(h.root, path, 'formal-model-must-not-change');
    const before = await hashArtifacts(h.root, [path]);
    const result = await h.tool('evidence_check_model_draft', {
      expectedRevision: 1,
      files: domain,
    });
    expect(result).toMatchObject({
      details: { passed: true, simulationPassed: null, revision: 2 },
    });
    expect(await hashArtifacts(h.root, [path])).toBe(before);
    expect(await loadState(h.root)).toMatchObject({
      pendingGate: null,
      modeling: { applicable: null, machineValidated: false },
    });
    await saveContent(h);
    expect(
      (await loadDiscovery(h.root, (await loadState(h.root))!)).draft,
    ).toBeNull();
  }, 180000);
});
