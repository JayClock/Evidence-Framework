import { describe, expect, it, vi } from 'vitest';

import { registerModelingCommand } from './commands.js';

function setup(commands: unknown[] = []) {
  const registerCommand = vi.fn();
  const sendUserMessage = vi.fn();
  const pi = {
    getCommands: vi.fn(() => commands),
    registerCommand,
    sendUserMessage,
  };
  registerModelingCommand(pi as never);
  const handler = registerCommand.mock.calls[0]?.[1].handler as (
    args: string,
    context: unknown,
  ) => Promise<void>;
  return { handler, sendUserMessage };
}

const skill = {
  name: 'skill:fm-modeling',
  source: 'skill',
  sourceInfo: {},
};

function context(overrides: Record<string, unknown> = {}) {
  return {
    hasUI: true,
    ui: {
      select: vi.fn(),
      editor: vi.fn(),
      notify: vi.fn(),
    },
    ...overrides,
  };
}

describe('/evidence-model', () => {
  it('forwards arguments through native skill expansion', async () => {
    const { handler, sendUserMessage } = setup([skill]);

    await handler('梳理付款确认', context());

    expect(sendUserMessage).toHaveBeenCalledWith(
      '/skill:fm-modeling 梳理付款确认',
      { expandPromptTemplates: true },
    );
  });

  it('maps the no-argument menu to a single modeling intent', async () => {
    const ctx = context();
    ctx.ui.select.mockResolvedValue('只校验模型');
    const { handler, sendUserMessage } = setup([skill]);

    await handler('', ctx);

    expect(sendUserMessage).toHaveBeenCalledWith(
      '/skill:fm-modeling 只校验现有 FM 模型，不修改源文件',
      { expandPromptTemplates: true },
    );
  });

  it('returns without sending when the panel is closed', async () => {
    const ctx = context();
    ctx.ui.select.mockResolvedValue(undefined);
    const { handler, sendUserMessage } = setup([skill]);

    await handler('', ctx);

    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it('reports a missing skill as a resource problem', async () => {
    const ctx = context();
    const { handler, sendUserMessage } = setup([]);

    await handler('开始', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('缺少 fm-modeling Skill'),
      'error',
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});
