import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import type { Component, Focusable, TUI } from '@earendil-works/pi-tui';
import { visibleWidth } from '@earendil-works/pi-tui';
import { rm } from 'node:fs/promises';
import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverySnapshot } from '../../../modeling/discovery/schema.ts';
import {
  businessViewLines,
  questionLabel,
} from '../../../modeling/discovery/view.ts';
import { loadDiscovery } from '../../../state/discovery/index.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from '../../../storage.ts';
import {
  contractContent,
  discoveryContent,
  subscriptionContent,
} from '../../../tests/support/discovery-test-support.ts';
import { qualityHarness } from '../../../tests/support/quality-test-support.ts';
import { discoveryAnswerView } from './discovery-answer-view.ts';
import { editDiscoveryView, selectDiscoveryView } from './discovery-answer.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function snapshot(): DiscoverySnapshot {
  return {
    version: 6,
    runId: 'test',
    revision: 1,
    previousDigest: null,
    content: contractContent(),
    sourceHashes: {},
    recordHeads: {},
    withdrawnRecordKeys: [],
    staleRecordKeys: [],
    answers: [],
    questionResolutions: [],
    modelUpdateRequested: false,
    formalization: null,
    appliedModel: null,
    draft: null,
    recordedAt: '2026-01-01',
    interaction: {
      stopped: false,
      activeQuestionId: 'Q-001',
      needsConsolidation: false,
      deferredQuestionIds: [],
    },
    questions: [
      {
        id: 'Q-001',
        gapKey: 'c-005.payment-proof',
        target: {
          kind: 'contract',
          contextRef: 'C-001',
          fulfillmentRef: 'C-005',
        },
        focus: 'evidence',
        prompt: '什么凭证证明分成已支付？',
        impact: '确定完成依据',
        blocking: true,
        sourceRefs: ['INPUT'],
      },
    ],
  };
}

function uiHarness(rows = 40) {
  initTheme('dark', false);
  let component: Component & Partial<Focusable> & { dispose?(): void };
  const tui = { terminal: { rows, columns: 80 }, requestRender: vi.fn() };
  const theme = {
    fg: (_: string, text: string) => text,
    bold: (text: string) => text,
  };
  const keybindings = {
    matches: (data: string, key: string) =>
      key === 'tui.select.cancel' && data === '\u001b',
  };
  const custom: ExtensionContext['ui']['custom'] = (factory) =>
    new Promise((resolve) => {
      component = factory(
        tui as unknown as TUI,
        theme as Theme,
        keybindings as Parameters<typeof factory>[2],
        resolve,
      ) as typeof component;
    });
  const ctx = {
    mode: 'tui',
    ui: { custom: vi.fn(custom), select: vi.fn(), editor: vi.fn() },
  };
  return {
    ctx: ctx as unknown as ExtensionContext,
    ui: ctx.ui,
    tui,
    component: () => component,
    render: (width = 80) =>
      component.render(width).map(stripVTControlCharacters),
    input: (key: string) => component.handleInput!(key),
  };
}

function select(
  h: ReturnType<typeof uiHarness>,
  value = snapshot(),
  signal = new AbortController().signal,
) {
  return selectDiscoveryView(h.ctx, value, {
    title: '业务建模',
    choices: ['回答', '结束本轮'],
    signal,
  });
}

describe('structured discovery answer view', () => {
  it('separates current context, fulfillment, question and on-demand details without changing evidence', () => {
    const value = snapshot(),
      before = structuredClone(value);
    const view = discoveryAnswerView(value);
    const summary = JSON.stringify(view.sections);
    expect(summary).toContain('作者合作协议');
    expect(summary).toContain('权责：作者 → 平台（权利方 → 义务方）');
    expect(summary).toContain('要求：合作协议、结算单');
    expect(summary).toContain('请求时间：start_at=待明确；expired_at=待明确');
    expect(summary).toContain('履约确认凭证：待明确');
    expect(summary).toContain('当前问题 · Q-001');
    expect(summary).not.toContain('逾期补偿');
    expect(view.details.join('\n')).not.toMatch(/逾期补偿|交付稿件|履约请求：/);
    expect(view.details.join('\n')).toContain('来源引用：INPUT');
    expect(view.details.join('\n')).toContain('完整业务结构：/evidence-status');
    expect(value).toEqual(before);
  });

  it.each([
    null,
    '银行流水；提供方待明确',
    '支付服务商提供支付回执，证明分成到账',
    '编辑依据约定验收标准形成稿件验收单',
  ])(
    'shares request and confirmation semantics with the text view (%j)',
    (confirmation) => {
      const value = snapshot();
      value.content!.businessView.contexts[0].fulfillments[1].confirmationEvidence.proves =
        confirmation;
      const before = structuredClone(value);
      const lines = discoveryAnswerView(value).sections[1].lines;
      const text = businessViewLines(value).join('\n');
      for (const line of lines) expect(text).toContain(line);
      expect(lines).toContain(`证明：${confirmation ?? '待明确'}`);
      expect(lines.join('\n')).not.toMatch(/确认人：|审批人：/);
      expect(value).toEqual(before);
    },
  );

  it('shows sourced representatives and uncertain candidates without deriving the confirmation provider', () => {
    const value = snapshot();
    const item = value.content!.businessView.contexts[0].fulfillments[0];
    value.questions[0].target = {
      kind: 'contract',
      contextRef: 'C-001',
      fulfillmentRef: item.candidateRef,
    };
    value.content!.candidates[3].confidence = 'inferred';
    item.requestEvidence.requirement = '平台由编辑代表向作者提出按约交稿要求';
    item.confirmationEvidence.proves = null;
    const lines = discoveryAnswerView(value).sections[1].lines;
    expect(lines).toContain('交付稿件（候选）');
    expect(lines).toContain(`要求：${item.requestEvidence.requirement}`);
    expect(lines).toContain('履约确认凭证：待明确');
    expect(lines.join('\n')).not.toContain('编辑验收');
    expect(lines.join('\n')).not.toContain('确认人');
  });

  it('keeps only the selected exception predecessor and sources in details', () => {
    const value = snapshot();
    value.questions[0].target = {
      kind: 'contract',
      contextRef: 'C-001',
      fulfillmentRef: 'C-006',
    };
    const before = structuredClone(value);
    const view = discoveryAnswerView(value);
    expect(view.sections[1].lines[0]).toBe('逾期补偿（候选）');
    expect(view.details).toContain('前序／触发：支付分成 · 逾期未支付');
    expect(view.details.join('\n')).toContain('来源引用：INPUT');
    expect(view.details.join('\n')).not.toContain('交付稿件');
    expect(value).toEqual(before);
  });

  it('uses historical question targets, including null, rather than the saved cursor', () => {
    const value = snapshot();
    value.questions.push({
      ...value.questions[0],
      id: 'Q-002',
      target: {
        kind: 'contract',
        contextRef: 'C-001',
        fulfillmentRef: 'C-004',
      },
    });
    expect(
      JSON.stringify(discoveryAnswerView(value, 'Q-002').sections),
    ).toContain('交付稿件');
    value.questions[1].target = null;
    const text = JSON.stringify(discoveryAnswerView(value, 'Q-002').sections);
    expect(text).toContain('当前建模位置');
    expect(text).not.toContain('作者合作协议');
    expect(text).not.toContain('双方角色：待明确');
  });

  it('shows business scope for domain discovery and suppresses stale contract claims', () => {
    const value = snapshot();
    value.questions[0].target = null;
    value.content = discoveryContent();
    expect(JSON.stringify(discoveryAnswerView(value).sections)).toContain(
      value.content.scope,
    );
    value.content = contractContent();
    value.questions[0].target = {
      kind: 'contract',
      contextRef: 'C-001',
      fulfillmentRef: 'C-005',
    };
    value.content.candidates[1].sourceRefs = ['A-999'];
    const view = JSON.stringify(discoveryAnswerView(value));
    expect(view).toContain('待重新核对');
    expect(view).not.toContain('作者合作协议');
  });

  it('shows the selected domain object instead of a fake fulfillment slice', () => {
    const value = snapshot();
    value.content = discoveryContent();
    value.content.candidates.push({
      id: 'C-002',
      archetype: 'thing',
      evidenceKind: null,
      label: '专栏',
      description: '当前讨论的领域标的物。',
      confidence: 'explicit',
      sourceRefs: ['INPUT'],
      modelRefs: [],
    });
    value.content.businessView.contexts[0].thingRefs = ['C-002'];
    value.questions[0].target = {
      kind: 'domain',
      contextRef: 'C-001',
      objectRef: 'C-002',
    };
    const view = discoveryAnswerView(value);
    expect(view.sections[0].lines[0]).toBe('领域上下文 › 测试对象规则 › 专栏');
    expect(view.sections[1]).toEqual({
      title: '当前对象切片',
      lines: ['专栏'],
    });
    expect(JSON.stringify(view.sections)).not.toContain('履约');
  });

  it('uses short subscription names instead of repeating long analyses on cards and arrows', () => {
    const value = snapshot();
    value.content = subscriptionContent();
    value.questions[0].target = value.content.businessView.current;
    value.questions[0].prompt = '一笔专栏订阅的支付截止时间按什么规则确定？';
    const before = structuredClone(value);
    const view = discoveryAnswerView(value);
    expect(view.sections[0].lines).toEqual([
      '合同上下文 › 专栏订阅合同 › 支付订阅费（候选）',
      '角色：读者 ↔ 平台',
      '参与人／组织：待明确',
      '标的物：待明确',
      '相关凭证：待明确',
    ]);
    expect(view.sections[1].lines).toEqual([
      '支付订阅费（候选）',
      '权责：平台 → 读者（权利方 → 义务方）',
      '履约请求凭证：待明确',
      '发起／接收：平台 → 读者',
      '要求：按订阅约定支付对应专栏费用（业务背景、核心需求4）',
      '请求时间：start_at=以本次付款请求的 start_at 为准；形成依据待明确；expired_at=以本次付款请求的 expired_at 为准；确定依据待明确',
      '履约确认凭证：待明确',
      '提供方：待明确',
      '证明：外部付款确认，具体凭证及提供方待明确',
      '确认时间：confirmed_at=以付款确认的 confirmed_at 判断是否按时履约',
      '支撑凭证：待明确',
      '参与人／组织：待明确',
      '标的物：待明确',
    ]);
    const summary = JSON.stringify(view.sections);
    for (const candidate of value.content.candidates)
      expect(summary).not.toContain(candidate.description);
    expect(view.details.join('\n')).toContain(
      value.content.candidates[3].description,
    );
    const status = businessViewLines(value, { detailed: true }).join('\n');
    for (const candidate of value.content.candidates)
      expect(status).toContain(candidate.description);
    expect(questionLabel(value, 'Q-001')).toBe(
      'Q-001 专栏订阅合同 › 支付订阅费（候选） · 一笔专栏订阅的支付截止时间按什么规则确定？',
    );
    expect(value).toEqual(before);
  });

  it('bounds long request details explicitly while keeping original text in the detailed view', () => {
    const value = snapshot();
    const item = value.content!.businessView.contexts[0].fulfillments[1];
    item.requestEvidence.requirement = `作者向平台请求分成；${'完整业务依据。'.repeat(40)}请求末尾`;
    item.confirmationEvidence.proves = `外部支付回执；${'提供方尚待核实。'.repeat(40)}确认末尾`;
    const before = structuredClone(value);
    const lines = discoveryAnswerView(value).sections[1].lines;
    expect(lines).toContain('说明已截短，完整原文见 /evidence-status');
    expect(lines.join('\n')).not.toMatch(/请求末尾|确认末尾/);
    expect(lines.every((line) => Array.from(line).length < 120)).toBe(true);
    const detailed = businessViewLines(value, { detailed: true }).join('\n');
    expect(detailed).toContain(item.requestEvidence.requirement);
    expect(detailed).toContain(item.confirmationEvidence.proves);
    expect(value).toEqual(before);
  });

  it('keeps the complete question and sanitizes terminal controls without altering source text', () => {
    const value = snapshot();
    const prompt = `${'长问题'.repeat(120)}\n最后一句？\u001b[31m`;
    value.questions[0].prompt = prompt;
    const view = JSON.stringify(discoveryAnswerView(value).sections);
    expect(view).toContain('最后一句？');
    expect(view).not.toContain('…');
    expect(view).not.toContain('\\u001b');
    expect(value.questions[0].prompt).toBe(prompt);
  });
});

describe('discovery answer TUI', () => {
  it('routes the actual answer command through cards, preserving cancellation, persistence and automatic continuation', async () => {
    const h = await qualityHarness(roots),
      tui = uiHarness();
    h.ctx.mode = 'tui';
    Object.assign(h.ui, { custom: tui.ui.custom });
    const state = createInitialState('test', '合成问答界面回归');
    state.status = 'running';
    await saveState(h.root, state);
    await h.saveDiscovery({
      expectedRevision: 0,
      content: contractContent(),
    });
    const result = await h.tool('evidence_ask_questions', {
      expectedRevision: 1,
      questions: snapshot().questions,
    });
    expect(result).toMatchObject({
      terminate: true,
      details: { revision: 2 },
      content: [{ text: expect.stringContaining('问题 Q-001 已保存') }],
    });
    const message = JSON.stringify(result.content);
    expect(message).toContain('/evidence-answer');
    expect(message).toContain('/evidence-status');
    expect(message).not.toMatch(/作者合作协议|履约请求：|履约确认凭证：/);
    expect(message).not.toContain(snapshot().questions[0].prompt);
    expect(tui.ui.custom).not.toHaveBeenCalled();
    expect(h.api.sendMessage).not.toHaveBeenCalled();
    const current = (await loadState(h.root))!;
    expect(current.status).toBe('waiting_answer');
    const before = await readText(h.root, '.evidence/state.json');
    const original = await readText(h.root, current.discovery.path!);
    const cancelled = h.events.get('agent_settled')!({}, h.ctx);
    await vi.waitFor(() => expect(tui.ui.custom).toHaveBeenCalledTimes(1));
    const card = tui.render().join('\n');
    expect(card).toContain('权责：作者 → 平台');
    expect(card).toContain('履约确认凭证：待明确');
    expect(card).toContain(snapshot().questions[0].prompt);
    tui.input('\u001b');
    await cancelled;
    await h.events.get('agent_settled')!({}, h.ctx);
    expect(tui.ui.custom).toHaveBeenCalledTimes(1);
    expect(h.api.exec).not.toHaveBeenCalled();
    await h.command('evidence-status');
    const status = h.api.sendMessage.mock.lastCall![0].content;
    expect(status).toContain('作者合作协议');
    expect(status).toContain('交付稿件');
    expect(status).toContain('支付分成');
    expect(status).toContain('逾期补偿');
    expect(status).toContain('来源引用：INPUT');
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(await readText(h.root, current.discovery.path!)).toBe(original);
    h.api.exec.mockResolvedValue({
      code: 0,
      killed: false,
      stdout: '{"login":"tester"}',
      stderr: '',
    });
    const answering = h.command('evidence-answer');
    await vi.waitFor(() => expect(tui.ui.custom).toHaveBeenCalledTimes(2));
    tui.render();
    tui.input('\r');
    await vi.waitFor(() => expect(tui.ui.custom).toHaveBeenCalledTimes(3));
    tui.render();
    tui.input('凭证：银行流水');
    tui.input('\r');
    await answering;
    const saved = await loadDiscovery(h.root, (await loadState(h.root))!);
    expect(saved.answers).toHaveLength(1);
    expect(saved.answers[0]).toMatchObject({
      questionId: 'Q-001',
      text: '凭证：银行流水',
      respondent: 'github.com/tester',
      status: 'answered',
    });
    expect(h.api.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(h.ui.select).not.toHaveBeenCalled();
    expect(h.ui.editor).not.toHaveBeenCalled();
    tui.component().dispose?.();
  });

  it('renders sections and actions separately, expands details and selects existing actions', async () => {
    const h = uiHarness();
    const result = select(h);
    let text = h.render().join('\n');
    expect(text).toContain('当前履约切片');
    expect(text).toContain('当前问题 · Q-001');
    expect(text).toContain('操作');
    expect(text).not.toContain('逾期补偿');
    h.input('\u001bOQ'); // F2
    h.input('\u001b[1;5B'); // Ctrl+Down: scroll context
    text = h.render().join('\n');
    expect(text).toContain('详情 · 当前依据');
    expect(text).not.toMatch(/逾期补偿|交付稿件/);
    expect(text).toContain('来源引用：INPUT');
    expect(text).toContain('完整业务结构：/evidence-status');
    h.input('\u001b[B');
    h.input('\r');
    expect(await result).toBe('结束本轮');
    h.component().dispose?.();
  });

  it('renders the subscription regression as short names in the actual TUI', async () => {
    const h = uiHarness(40),
      value = snapshot();
    value.content = subscriptionContent();
    value.questions[0].target = value.content.businessView.current;
    value.questions[0].prompt = '一笔专栏订阅的支付截止时间按什么规则确定？';
    const result = select(h, value);
    const text = h.render(80).join('\n');
    expect(text).toContain('角色：读者 ↔ 平台');
    expect(text).toContain('权责：平台 → 读者');
    expect(text).toContain(value.questions[0].prompt);
    expect(text).not.toContain('外部系统或执行能力不等同于合同一方');
    expect(text).not.toContain('合同形成依据、签署时刻待明确');
    h.input('\u001b');
    expect(await result).toBeUndefined();
    h.component().dispose?.();
  });

  it('wraps Chinese and long text within resized terminals while keeping actions visible and content scrollable', async () => {
    const h = uiHarness(24),
      value = snapshot();
    value.questions[0].prompt = `${'长问题'.repeat(100)}结尾标记`;
    const result = select(h, value);
    for (const width of [80, 32, 16, 80]) {
      const lines = h.render(width);
      expect(lines.length).toBeLessThanOrEqual(24);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
      expect(lines.join('\n')).toContain('回答');
    }
    for (let i = 0; i < 400; i++) h.input('\u001b[1;5B');
    expect(h.render().join('\n')).toContain('结尾标记');
    h.input('\u001b');
    expect(await result).toBeUndefined();
    h.component().dispose?.();
  });

  it('preserves native editor focus, prefill, multiline submission and separate business context', async () => {
    const h = uiHarness(),
      value = snapshot();
    const result = editDiscoveryView(h.ctx, value, {
      question: value.questions[0],
      respondent: 'github.com/tester',
      prefill: '原回答\n第二行',
      signal: new AbortController().signal,
    });
    h.component().focused = true;
    const text = h.render().join('\n');
    expect(text).toContain('当前问题 · Q-001');
    expect(text).toContain('github.com/tester');
    expect(text).toContain('第二行');
    expect(h.component().focused).toBe(true);
    h.input('\r');
    expect(await result).toBe('原回答\n第二行');
    h.component().dispose?.();
  });

  it('keeps the current question visible when the native editor leaves little vertical space', async () => {
    const h = uiHarness(24),
      value = snapshot();
    const result = editDiscoveryView(h.ctx, value, {
      question: value.questions[0],
      respondent: 'github.com/tester',
      prefill: '',
      signal: new AbortController().signal,
    });
    const lines = h.render();
    expect(lines.length).toBeLessThanOrEqual(24);
    expect(lines.join('\n')).toContain('当前问题 · Q-001');
    expect(lines.join('\n')).toContain(value.questions[0].prompt);
    h.input('\u001b');
    expect(await result).toBeUndefined();
    h.component().dispose?.();
  });

  it('closes menus and editors on session abort and removes listeners on disposal', async () => {
    const h = uiHarness(),
      controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = select(h, snapshot(), controller.signal);
    controller.abort();
    expect(await result).toBeUndefined();
    h.component().dispose?.();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    const value = snapshot(),
      second = new AbortController();
    const editing = editDiscoveryView(h.ctx, value, {
      question: value.questions[0],
      respondent: 'github.com/tester',
      prefill: '',
      signal: second.signal,
    });
    second.abort();
    expect(await editing).toBeUndefined();
    h.component().dispose?.();
  });

  it('does not open an aborted prompt and retains plain dialogs in RPC mode', async () => {
    const h = uiHarness(),
      controller = new AbortController();
    controller.abort();
    expect(await select(h, snapshot(), controller.signal)).toBeUndefined();
    expect(h.ui.custom).not.toHaveBeenCalled();
    h.ctx.mode = 'rpc';
    h.ui.select.mockResolvedValue('回答');
    expect(await select(h)).toBe('回答');
    expect(h.ui.select.mock.lastCall![0]).toContain(
      '当前建模位置：合同上下文 › 作者合作协议 › 支付分成',
    );
    expect(h.ui.select.mock.lastCall![0]).toContain('权责：作者 → 平台');
    expect(h.ui.select.mock.lastCall![0]).toContain('履约确认凭证：待明确');
    const value = snapshot();
    h.ui.editor.mockResolvedValue('答复');
    expect(
      await editDiscoveryView(h.ctx, value, {
        question: value.questions[0],
        respondent: 'github.com/tester',
        prefill: '',
        signal: new AbortController().signal,
      }),
    ).toBe('答复');
    expect(h.ui.editor.mock.lastCall![0]).toContain('github.com/tester');
    expect(h.ui.custom).not.toHaveBeenCalled();
  });
});
