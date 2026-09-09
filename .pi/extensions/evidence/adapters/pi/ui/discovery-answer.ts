import {
  ExtensionEditorComponent,
  keyHint,
  type ExtensionContext,
  type KeybindingsManager,
  type Theme,
} from '@earendil-works/pi-coding-agent';
import {
  Container,
  SelectList,
  Text,
  matchesKey,
  truncateToWidth,
  type Component,
  type Focusable,
  type TUI,
} from '@earendil-works/pi-tui';
import type {
  DiscoveryQuestion,
  DiscoverySnapshot,
} from '../../../modeling/discovery/schema.ts';
import { businessViewLines } from '../../../modeling/discovery/view.ts';
import {
  discoveryAnswerView,
  type DiscoveryAnswerView,
} from './discovery-answer-view.ts';

type Body = Component & Partial<Focusable>;
type BodyFactory = (
  tui: TUI,
  theme: Theme,
  keys: KeybindingsManager,
  done: (value: string | undefined) => void,
) => Body;

function renderContext(
  view: DiscoveryAnswerView,
  theme: Theme,
  width: number,
  expanded: boolean,
) {
  const render = (text: string) => new Text(text, 0, 0).render(width);
  const heading = (title: string) =>
    render(theme.fg('accent', theme.bold(`── ${title} ──`)));
  const lines: string[] = [];
  let questionOffset = 0;
  for (const [index, section] of view.sections.entries()) {
    if (lines.length) lines.push('');
    if (index === view.sections.length - 1) questionOffset = lines.length;
    lines.push(...heading(section.title));
    for (const line of section.lines) {
      const color = /待明确|待重新核对|尚未/.test(line) ? 'warning' : 'text';
      lines.push(...render(theme.fg(color, line)));
    }
  }
  const detailsOffset = lines.length;
  if (expanded) {
    lines.push('', ...heading('详情 · 当前依据'));
    for (const line of view.details)
      lines.push(...render(theme.fg('muted', line)));
  }
  return { lines, questionOffset, detailsOffset };
}

interface PanelOptions {
  tui: TUI;
  theme: Theme;
  keys: KeybindingsManager;
  title: string;
  view: DiscoveryAnswerView;
  body: Body;
  cancel: () => void;
}

// Context scrolls independently; the native input/menu remains visible and focused.
class AnswerPanel implements Component, Focusable {
  private expanded = false;
  private offset = 0;
  private maxOffset = 0;
  private detailsOffset = 0;
  private positioned = false;

  constructor(private options: PanelOptions) {}

  get focused(): boolean {
    return this.options.body.focused ?? false;
  }
  set focused(value: boolean) {
    this.options.body.focused = value;
  }

  handleInput(data: string): void {
    const { keys, cancel, body, tui } = this.options;
    if (keys.matches(data, 'tui.select.cancel')) {
      cancel();
      return;
    }
    if (matchesKey(data, 'f2')) {
      this.expanded = !this.expanded;
      this.offset = this.expanded ? this.detailsOffset : 0;
    } else if (matchesKey(data, 'ctrl+up')) {
      this.offset = Math.max(0, this.offset - 1);
    } else if (matchesKey(data, 'ctrl+down')) {
      this.offset = Math.min(this.maxOffset, this.offset + 1);
    } else {
      body.handleInput?.(data);
    }
    tui.requestRender();
  }

  render(width: number): string[] {
    const { theme, tui, view, title } = this.options;
    const body = this.options.body.render(width);
    const context = renderContext(view, theme, width, this.expanded);
    this.detailsOffset = context.detailsOffset;
    const height = Math.max(1, tui.terminal.rows - body.length - 3);
    this.maxOffset = Math.max(0, context.lines.length - height);
    // On small screens start at the question, not at an off-screen question below context.
    this.offset = Math.min(
      this.positioned ? this.offset : context.questionOffset,
      this.maxOffset,
    );
    this.positioned = true;
    const position = this.maxOffset
      ? ` · ${this.offset + 1}–${Math.min(context.lines.length, this.offset + height)}/${context.lines.length}`
      : '';
    return [
      truncateToWidth(theme.fg('accent', theme.bold(title)), width),
      ...context.lines.slice(this.offset, this.offset + height),
      '',
      truncateToWidth(
        theme.fg(
          'dim',
          `F2 ${this.expanded ? '收起' : '详情'} · Ctrl+↑↓ 滚动上下文${position}`,
        ),
        width,
      ),
      ...body,
    ];
  }

  invalidate(): void {
    // Context colors are rebuilt on every render; no stale width/theme cache.
    this.options.body.invalidate();
  }
}

async function showPanel(
  ctx: ExtensionContext,
  snapshot: DiscoverySnapshot,
  options: { questionId?: string; title: string; signal: AbortSignal },
  createBody: BodyFactory,
): Promise<string | undefined> {
  const { questionId, title, signal } = options;
  if (signal.aborted) return;
  let detach = () => {};
  try {
    return await ctx.ui.custom<string | undefined>((tui, theme, keys, done) => {
      const cancel = () => done(undefined);
      const panel = new AnswerPanel({
        tui,
        theme,
        keys,
        title,
        cancel,
        view: discoveryAnswerView(snapshot, questionId),
        body: createBody(tui, theme, keys, done),
      });
      signal.addEventListener('abort', cancel, { once: true });
      detach = () => signal.removeEventListener('abort', cancel);
      if (signal.aborted) cancel();
      return Object.assign(panel, { dispose: () => detach() });
    });
  } finally {
    detach();
  }
}

export async function selectDiscoveryView(
  ctx: ExtensionContext,
  snapshot: DiscoverySnapshot,
  options: {
    questionId?: string;
    title: string;
    choices: string[];
    signal: AbortSignal;
  },
): Promise<string | undefined> {
  if (options.signal.aborted) return;
  if (ctx.mode !== 'tui') {
    return ctx.ui.select(
      `${options.title}\n${businessViewLines(snapshot, { questionId: options.questionId }).join('\n')}`,
      options.choices,
      { signal: options.signal },
    );
  }
  return showPanel(ctx, snapshot, options, (tui, theme, _keys, done) => {
    const body = new Container();
    const heading = new Text('', 0, 0);
    body.addChild(heading);
    const list = new SelectList(
      options.choices.map((value) => ({ value, label: value })),
      Math.max(
        1,
        Math.min(options.choices.length, Math.floor(tui.terminal.rows / 4)),
      ),
      {
        selectedPrefix: (s) => theme.fg('accent', s),
        selectedText: (s) => theme.fg('accent', s),
        description: (s) => theme.fg('muted', s),
        scrollInfo: (s) => theme.fg('dim', s),
        noMatch: (s) => theme.fg('warning', s),
      },
    );
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(undefined);
    body.addChild(list);
    const help = new Text('', 0, 0);
    body.addChild(help);
    return {
      render(width) {
        heading.setText(theme.fg('accent', '── 操作 ──'));
        help.setText(
          theme.fg(
            'dim',
            `${keyHint('tui.select.up', '上移')} ${keyHint('tui.select.down', '下移')} ${keyHint('tui.select.confirm', '选择')} ${keyHint('tui.select.cancel', '关闭')}`,
          ),
        );
        return body.render(width);
      },
      invalidate: () => body.invalidate(),
      handleInput: (data) => list.handleInput(data),
    };
  });
}

export async function editDiscoveryView(
  ctx: ExtensionContext,
  snapshot: DiscoverySnapshot,
  options: {
    question: DiscoveryQuestion;
    respondent: string;
    prefill: string;
    signal: AbortSignal;
  },
): Promise<string | undefined> {
  const { question, respondent, prefill, signal } = options;
  if (signal.aborted) return;
  if (ctx.mode !== 'tui') {
    return ctx.ui.editor(
      `${businessViewLines(snapshot, { questionId: question.id }).join('\n')}\n回答者：${respondent}（自动记录）`,
      prefill,
    );
  }
  return showPanel(
    ctx,
    snapshot,
    { questionId: question.id, title: '业务建模 · 回答', signal },
    (tui, _theme, keys, done) =>
      new ExtensionEditorComponent(
        tui,
        keys,
        `回答者：${respondent}（自动记录）`,
        prefill,
        done,
        () => done(undefined),
      ),
  );
}
