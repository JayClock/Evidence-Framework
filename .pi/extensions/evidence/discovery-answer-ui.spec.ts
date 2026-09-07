import { stripVTControlCharacters } from 'node:util';
import { rm } from 'node:fs/promises';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import type { Component, Focusable, TUI } from '@earendil-works/pi-tui';
import { visibleWidth } from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { qualityHarness } from './quality-test-support.ts';
import {
  createInitialState,
  loadState,
  readText,
  saveState,
} from './storage.ts';
import { loadDiscovery } from './discovery.ts';
import { contractContent, discoveryContent } from './discovery-test-support.ts';
import type { DiscoverySnapshot } from './discovery-schema.ts';
import { discoveryAnswerView } from './discovery-answer-view.ts';
import {
  editDiscoveryView,
  selectDiscoveryView,
} from './discovery-answer-ui.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function snapshot(): DiscoverySnapshot {
  return {
    version: 3,
    runId: 'test',
    revision: 1,
    previousDigest: null,
    content: contractContent(),
    sourceHashes: {},
    answers: [],
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
        target: { contractRef: 'C-001', fulfillmentRef: 'C-005' },
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
    expect(summary).toContain('权利方：作者');
    expect(summary).toContain('义务方：平台');
    expect(summary).toContain('履约期限：待明确');
    expect(summary).toContain('当前问题 · Q-001');
    expect(summary).not.toContain('逾期补偿');
    expect(view.details.join('\n')).toContain('逾期补偿');
    expect(view.details.join('\n')).toContain('来源引用：INPUT');
    expect(value).toEqual(before);
  });

  it('uses historical question targets, including null, rather than the saved cursor', () => {
    const value = snapshot();
    value.questions.push({
      ...value.questions[0],
      id: 'Q-002',
      target: { contractRef: 'C-001', fulfillmentRef: 'C-004' },
    });
    expect(
      JSON.stringify(discoveryAnswerView(value, 'Q-002').sections),
    ).toContain('交付稿件');
    value.questions[1].target = null;
    const text = JSON.stringify(discoveryAnswerView(value, 'Q-002').sections);
    expect(text).toContain('业务上下文');
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
      contractRef: 'C-001',
      fulfillmentRef: 'C-005',
    };
    value.content.candidates[1].sourceRefs = ['A-999'];
    const view = JSON.stringify(discoveryAnswerView(value));
    expect(view).toContain('待重新核对');
    expect(view).not.toContain('作者合作协议');
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
    await h.tool('evidence_save_discovery', {
      expectedRevision: 0,
      content: contractContent(),
    });
    await h.tool('evidence_ask_questions', {
      expectedRevision: 1,
      questions: snapshot().questions,
    });
    const before = await readText(h.root, '.evidence/state.json');
    const cancelled = h.command('evidence-answer');
    await vi.waitFor(() => expect(tui.ui.custom).toHaveBeenCalledTimes(1));
    tui.render();
    tui.input('\u001b');
    await cancelled;
    expect(await readText(h.root, '.evidence/state.json')).toBe(before);
    expect(h.api.exec).not.toHaveBeenCalled();
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
    expect(text).toContain('当前履约项');
    expect(text).toContain('当前问题 · Q-001');
    expect(text).toContain('操作');
    expect(text).not.toContain('逾期补偿');
    h.input('\u001bOQ'); // F2
    h.input('\u001b[1;5B'); // Ctrl+Down: scroll context
    text = h.render().join('\n');
    expect(text).toContain('详情');
    expect(text).toContain('逾期补偿');
    expect(text).toContain('来源引用：INPUT');
    h.input('\u001b[B');
    h.input('\r');
    expect(await result).toBe('结束本轮');
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
    expect(h.ui.select.mock.lastCall![0]).toContain('合同上下文：作者合作协议');
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
