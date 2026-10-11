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
  name: 'skill:evidence-modeling',
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
      '/skill:evidence-modeling 梳理付款确认',
      { expandPromptTemplates: true },
    );
  });

  it('maps the no-argument menu to read-only FM and API validation', async () => {
    const ctx = context();
    ctx.ui.select.mockResolvedValue('只校验模型与 API');
    const { handler, sendUserMessage } = setup([skill]);

    await handler('', ctx);

    expect(sendUserMessage).toHaveBeenCalledWith(
      '/skill:evidence-modeling 只校验现有 FM 与 API，不修改任何项目文件，不生成审核页',
      { expandPromptTemplates: true },
    );
  });

  it.each([
    [
      '访谈并沉淀领域语言',
      '访谈并沉淀领域语言：付款证明，保存发现记录并当轮更新已明确术语的统一词汇表，不修改模型 JSON、关系、规则、验证场景、API 或实现',
    ],
    [
      '生成或修改模型与 API',
      '生成或修改模型与 API：付款证明，先核对追责结束依据，编辑并校验当前 FM，再设计并校验整体 API，生成联合审核页；不自动批准或进入实施',
    ],
  ])('routes %s with an explicit editing boundary', async (action, intent) => {
    const ctx = context();
    ctx.ui.select.mockResolvedValue(action);
    ctx.ui.editor.mockResolvedValue('付款证明');
    const { handler, sendUserMessage } = setup([skill]);

    await handler('', ctx);

    expect(ctx.ui.select).toHaveBeenCalledWith('Evidence Modeling', [
      '访谈并沉淀领域语言',
      '生成或修改模型与 API',
      '只校验模型与 API',
      '生成联合审核页',
      '返回',
    ]);
    expect(sendUserMessage).toHaveBeenCalledWith(
      `/skill:evidence-modeling ${intent}`,
      { expandPromptTemplates: true },
    );
  });

  it.each(['访谈并沉淀领域语言', '生成或修改模型与 API'])(
    'does not authorize %s after a blank goal',
    async (action) => {
      const ctx = context();
      ctx.ui.select.mockResolvedValue(action);
      ctx.ui.editor.mockResolvedValue('  \n');
      const { handler, sendUserMessage } = setup([skill]);
      await handler('', ctx);
      expect(sendUserMessage).not.toHaveBeenCalled();
    },
  );

  it('requests a joint review without authorizing source edits', async () => {
    const ctx = context();
    ctx.ui.select.mockResolvedValue('生成联合审核页');
    const { handler, sendUserMessage } = setup([skill]);

    await handler('', ctx);

    expect(ctx.ui.editor).not.toHaveBeenCalled();
    expect(sendUserMessage).toHaveBeenCalledWith(
      '/skill:evidence-modeling 生成现有 FM 与 API 的联合审核页，不修改模型或 API 设计源',
      { expandPromptTemplates: true },
    );
  });

  it('preserves an explicit FM-only restriction in arguments', async () => {
    const { handler, sendUserMessage } = setup([skill]);

    await handler('只修改 FM，不设计 API，不生成审核页', context());

    expect(sendUserMessage).toHaveBeenCalledWith(
      '/skill:evidence-modeling 只修改 FM，不设计 API，不生成审核页',
      { expandPromptTemplates: true },
    );
  });

  it('does not send a default editing request without UI', async () => {
    const { handler, sendUserMessage } = setup([skill]);
    const ctx = context({ hasUI: false });

    await handler('', ctx);

    expect(ctx.ui.select).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
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
      expect.stringContaining('缺少 evidence-modeling Skill'),
      'error',
    );
    expect(sendUserMessage).not.toHaveBeenCalled();
  });
});
