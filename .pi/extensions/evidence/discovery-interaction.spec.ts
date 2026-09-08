import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { qualityHarness } from './quality-test-support.ts';
import { discoveryContent, seedQuestions } from './discovery-test-support.ts';
import {
  assertDiscoveryReady,
  controlDiscoveryInteraction,
  loadDiscovery,
} from './discovery.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
  writeTextAtomic,
} from './storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const skip = '暂不确定／跳过此题';
const finish = '结束本轮问答，整理已有信息';

async function setup(blocking = true) {
  const h = await qualityHarness(roots);
  const state = createInitialState('test', '允许人工结束问答，不冒充业务确认');
  state.status = 'running';
  await saveState(h.root, state);
  await h.saveDiscovery({
    expectedRevision: 0,
    content: discoveryContent(),
  });
  await seedQuestions(
    h.root,
    (await loadState(h.root))!,
    ['Q-001', 'Q-002'].map((id) => ({
      id,
      focus: 'domain',
      target: null,
      prompt: `${id} 如何识别重复客户？`,
      impact: '决定身份规则',
      blocking,
      sourceRefs: ['INPUT'],
    })),
  );
  h.api.exec.mockResolvedValue({
    code: 0,
    killed: false,
    stdout: '{"login":"test-user"}',
    stderr: '',
  });
  return h;
}
async function current(h: Awaited<ReturnType<typeof setup>>) {
  const state = (await loadState(h.root))!;
  return { state, snapshot: await loadDiscovery(h.root, state) };
}

describe('manual discovery interaction controls', () => {
  it('skips without text, GitHub lookup or fabricated answers, and permits continued discovery', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue(skip);
    await h.command('evidence-answer', 'Q-001');
    expect(h.ui.editor).not.toHaveBeenCalled();
    expect(h.api.exec).not.toHaveBeenCalled();
    expect((await current(h)).snapshot.answers).toEqual([]);
    expect((await current(h)).state.status).toBe('running');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-answer', 'Q-002');
    expect((await current(h)).state).toMatchObject({
      status: 'running',
      round: 0,
    });
    await h.command('evidence-run');
    expect(h.api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('暂缓问题：Q-001、Q-002'),
    );
    await h.saveDiscovery({
      expectedRevision: (await current(h)).state.discovery.revision,
      content: discoveryContent(),
    });
    await expect(
      assertDiscoveryReady(h.root, (await current(h)).state),
    ).rejects.toThrow('阻塞问题未解决');
  });

  it.each(['evidence-answer', 'evidence-next'])(
    'offers only answer or finish for the current question in %s',
    async (command) => {
      const h = await setup();
      h.ui.select.mockResolvedValue(finish);
      await h.command(command);
      expect(h.ui.select).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('当前问题：Q-001'),
        ['回答', finish],
        { signal: expect.any(AbortSignal) },
      );
      expect(h.ui.editor).not.toHaveBeenCalled();
      expect(h.api.exec).not.toHaveBeenCalled();
      expect((await current(h)).snapshot.answers).toEqual([]);
      expect(h.api.sendUserMessage).toHaveBeenLastCalledWith(
        expect.stringContaining('人工已结束本轮问答'),
      );
    },
  );

  it('keeps finish out of single-question actions and lets the user return to scenario selection', async () => {
    const h = await setup();
    h.ui.select
      .mockResolvedValueOnce('返回场景选择')
      .mockResolvedValueOnce(finish);
    await h.command('evidence-answer', 'Q-001');
    expect(h.ui.select.mock.calls[0][1]).toEqual([
      '事实或决定',
      '未知，仍需澄清',
      '移出本次范围（回答中说明原因）',
      skip,
      '返回场景选择',
    ]);
    expect(h.ui.select.mock.calls[1][1]).toContain(finish);
    expect(h.ui.editor).not.toHaveBeenCalled();
    expect(h.api.exec).not.toHaveBeenCalled();
    expect((await current(h)).snapshot.interaction?.stopped).toBe(true);
  });

  it('can return and select another scenario without answering the previous question', async () => {
    const h = await setup();
    h.ui.select
      .mockResolvedValueOnce('返回场景选择')
      .mockResolvedValueOnce('Q-002 Q-002 如何识别重复客户？')
      .mockResolvedValueOnce('事实或决定');
    h.ui.editor.mockResolvedValue('按客户编号判断。');
    await h.command('evidence-answer', 'Q-001');
    expect((await current(h)).snapshot.answers).toEqual([
      expect.objectContaining({
        questionId: 'Q-002',
        text: '按客户编号判断。',
      }),
    ]);
    expect((await current(h)).state.status).toBe('running');
  });

  it('does not write anything when returning to scenario selection and cancelling', async () => {
    const h = await setup();
    const before = await readText(h.root, '.evidence/state.json');
    h.ui.select
      .mockResolvedValueOnce('返回场景选择')
      .mockResolvedValueOnce(undefined);
    await h.command('evidence-answer', 'Q-001');
    expect(h.ui.select).toHaveBeenCalledTimes(2);
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(h.api.exec).not.toHaveBeenCalled();
    expect(h.ui.editor).not.toHaveBeenCalled();
  });

  it('retains partial answers and history, stops automatic questions across save/reload and resumes explicitly', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue('事实或决定');
    h.ui.editor.mockResolvedValue('按客户编号判断。');
    await h.command('evidence-answer', 'Q-001');
    const before = await current(h);
    const original = await readText(h.root, before.state.discovery.path!);
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-discovery', 'finish');
    let saved = await current(h);
    expect(saved.snapshot.answers).toEqual(before.snapshot.answers);
    expect(saved.snapshot.questions).toEqual(before.snapshot.questions);
    expect(await readText(h.root, before.state.discovery.path!)).toBe(original);
    expect(saved.state).toMatchObject({
      status: 'running',
      round: 0,
      pendingGate: null,
      discovery: { stage: 'discovering' },
    });
    await expect(
      h.tool('evidence_ask_questions', {
        expectedRevision: saved.state.discovery.revision,
        questions: [{ ...saved.snapshot.questions[1], id: 'Q-003' }],
      }),
    ).rejects.toThrow('人工已结束本轮问答');
    const result = await h.saveDiscovery({
      expectedRevision: saved.state.discovery.revision,
      content: discoveryContent(),
    });
    expect(result).toMatchObject({
      terminate: true,
      content: [{ text: expect.stringContaining('Q-002') }],
    });
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.events.get('session_start')!({}, h.ctx);
    saved = await current(h);
    expect(saved.state.status).toBe('ready');
    expect(saved.snapshot.interaction?.stopped).toBe(true);
    expect(saved.snapshot.answers).toEqual(before.snapshot.answers);
    await h.command('evidence-run');
    expect(h.api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('人工已结束本轮问答'),
    );
    await expect(
      h.tool('evidence_finalize_discovery', {
        expectedRevision: saved.state.discovery.revision,
      }),
    ).rejects.toThrow('阻塞问题未解决：Q-002');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-discovery', 'resume');
    expect((await current(h)).state.status).toBe('waiting_answer');
    expect((await current(h)).snapshot.interaction?.stopped).toBe(false);
    expect(h.ui.setEditorText).toHaveBeenLastCalledWith('/evidence-answer');
  });

  it('allows nonblocking gaps at finalization without converting them into exclusions', async () => {
    const h = await setup(false);
    await h.command('evidence-discovery', 'finish');
    const saved = await current(h);
    const result = await h.saveDiscovery({
      expectedRevision: saved.state.discovery.revision,
      content: discoveryContent(),
    });
    expect(result).toMatchObject({ terminate: false });
    await h.tool('evidence_finalize_discovery', {
      expectedRevision: (await current(h)).state.discovery.revision,
    });
    expect((await current(h)).state.discovery.stage).toBe('finalizing');
    expect((await current(h)).snapshot.answers).toEqual([]);
    expect((await current(h)).snapshot.questions).toHaveLength(2);
  });

  it('can answer a deferred question later; only a real latest answer clears its blocker', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue(skip);
    await h.command('evidence-answer', 'Q-001');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-answer', 'Q-002');
    for (const id of ['Q-001', 'Q-002']) {
      await h.events.get('agent_settled')!({}, h.ctx);
      h.ui.select.mockResolvedValue('事实或决定');
      h.ui.editor.mockResolvedValue('客户编号唯一。');
      await h.command('evidence-answer', id);
    }
    expect(
      (await current(h)).snapshot.interaction?.deferredQuestionIds,
    ).toEqual([]);
    await h.saveDiscovery({
      expectedRevision: (await current(h)).state.discovery.revision,
      content: discoveryContent(),
    });
    await expect(
      assertDiscoveryReady(h.root, (await current(h)).state),
    ).resolves.toBeDefined();
  });

  it('requeues deferred questions on explicit resume', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue(skip);
    await h.command('evidence-answer', 'Q-001');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-answer', 'Q-002');
    await h.saveDiscovery({
      expectedRevision: (await current(h)).state.discovery.revision,
      content: discoveryContent(),
    });
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-discovery', 'resume');
    expect((await current(h)).state.status).toBe('waiting_answer');
    expect(
      (await current(h)).snapshot.interaction?.deferredQuestionIds,
    ).toEqual([]);
  });

  it('leaves state untouched on menu cancellation', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue(undefined);
    const before = await readText(h.root, '.evidence/state.json');
    await h.command('evidence-answer', 'Q-001');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(h.ui.editor).not.toHaveBeenCalled();
    expect(h.api.exec).not.toHaveBeenCalled();
  });

  it('rejects a stale menu action rather than overwriting a concurrent manual decision', async () => {
    const h = await setup();
    h.ui.select.mockImplementationOnce(async () => {
      const { state } = await current(h);
      await controlDiscoveryInteraction(h.root, state, 'finish');
      return skip;
    });
    await expect(h.command('evidence-answer', 'Q-001')).rejects.toThrow(
      '版本已改变',
    );
    expect((await current(h)).snapshot.interaction).toEqual({
      stopped: true,
      deferredQuestionIds: [],
      activeQuestionId: 'Q-001',
      needsConsolidation: false,
    });
    expect((await current(h)).state.discovery.revision).toBe(5);
  });

  it('does not allow skipping to erase an existing answer', async () => {
    const h = await setup();
    h.ui.select.mockResolvedValue('事实或决定');
    h.ui.editor.mockResolvedValue('按客户编号判断。');
    await h.command('evidence-answer', 'Q-001');
    await h.events.get('agent_settled')!({}, h.ctx);
    const before = await readText(h.root, '.evidence/state.json');
    h.ui.select.mockResolvedValue(skip);
    await expect(h.command('evidence-answer', 'Q-001')).rejects.toThrow(
      '只能暂缓尚未回答的问题',
    );
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect((await current(h)).snapshot.answers[0].text).toBe(
      '按客户编号判断。',
    );
  });

  it.each([undefined, '   '])(
    'still requires a real reason for exclusion (%j)',
    async (text) => {
      const h = await setup();
      h.ui.select.mockResolvedValue('移出本次范围（回答中说明原因）');
      h.ui.editor.mockResolvedValue(text);
      const before = await readText(h.root, '.evidence/state.json');
      await h.command('evidence-answer', 'Q-001');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect((await current(h)).snapshot.answers).toEqual([]);
    },
  );

  it.each(['sources', 'replay'])(
    'finish does not bypass %s checks',
    async (gap) => {
      const h = await setup(false);
      await h.command('evidence-discovery', 'finish');
      if (gap === 'sources')
        await writeTextAtomic(
          h.root,
          'artifacts/00-input/requirements.md',
          '# 已改变的业务输入',
        );
      else {
        const content = discoveryContent();
        content.cases.pop();
        await h.saveDiscovery({
          expectedRevision: (await current(h)).state.discovery.revision,
          content,
        });
      }
      await expect(
        h.tool('evidence_finalize_discovery', {
          expectedRevision: (await current(h)).state.discovery.revision,
        }),
      ).rejects.toThrow(gap === 'sources' ? '原始材料已变化' : 'exception');
      expect((await current(h)).state.discovery.stage).toBe('discovering');
    },
  );

  it('retains manual stop across workflow pause/resume and shows it in the next prompt', async () => {
    const h = await setup();
    await h.command('evidence-discovery', 'finish');
    await h.events.get('agent_settled')!({}, h.ctx);
    await h.command('evidence-pause');
    await h.command('evidence-resume');
    expect((await current(h)).snapshot.interaction?.stopped).toBe(true);
    await h.command('evidence-run');
    expect(h.api.sendUserMessage).toHaveBeenLastCalledWith(
      expect.stringContaining('人工已结束本轮问答'),
    );
  });

  it.each(['paused', 'running', 'downstream', 'finalizing'])(
    'rejects finish in %s without mutating discovery',
    async (mode) => {
      const h = await setup();
      const { state } = await current(h);
      if (mode === 'paused') state.paused = true;
      if (mode === 'running') state.status = 'running';
      if (mode === 'downstream') {
        state.phase = 'architecture';
        state.status = 'ready';
      }
      if (mode === 'finalizing') {
        state.discovery.stage = 'finalizing';
        state.status = 'ready';
      }
      await saveState(h.root, state);
      const before = await readText(h.root, '.evidence/state.json');
      await h.command('evidence-discovery', 'finish');
      expect(await readText(h.root, '.evidence/state.json')).toBe(before);
      expect(h.api.sendUserMessage).not.toHaveBeenCalled();
    },
  );
});
