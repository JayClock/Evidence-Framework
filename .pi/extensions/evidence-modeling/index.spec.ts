import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import evidenceModelingExtension from './index.js';
import { QuestionInputSchema, type QuestionInput } from './ui-contracts.js';

const directory = join(import.meta.dirname);

async function sourceFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(path, entry.name))
        : Promise.resolve(
            entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
              ? [join(path, entry.name)]
              : [],
          ),
    ),
  );
  return nested.flat();
}

describe('evidence-modeling UI adapter boundary', () => {
  it('registers the skill command and the question/context UI tools only', () => {
    const registerCommand = vi.fn();
    const registerTool = vi.fn();
    const on = vi.fn();

    evidenceModelingExtension({ registerCommand, registerTool, on } as never);

    expect(registerCommand).toHaveBeenCalledOnce();
    expect(registerCommand.mock.calls[0]?.[0]).toBe('evidence-model');
    expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([
      'evidence_ui_question',
      'evidence_ui_contexts',
    ]);
    expect(on).not.toHaveBeenCalled();
  });

  it('owns tool mapping without requiring skills to load adapter documentation', async () => {
    const registerTool = vi.fn();
    evidenceModelingExtension({
      registerCommand: vi.fn(),
      registerTool,
    } as never);
    const [question, contexts] = registerTool.mock.calls.map(([tool]) => tool);
    for (const tool of [question, contexts]) {
      expect(tool.description).toContain('evidence-discovery');
      expect(tool.description).toContain('unavailable');
      expect(tool.description).toContain('cancelled');
      expect(tool.description).toContain('普通对话');
    }
    for (const status of [
      'answered',
      'deferred',
      'stopped',
      'switch-context',
    ]) {
      expect(question.description).toContain(status);
    }
    expect(question.description).toContain('保存失败');
    expect(contexts.description).toContain('selected');
    expect(contexts.description).toContain('empty');
    const adapter = await readFile(join(directory, 'skill-adapter.md'), 'utf8');
    expect(adapter).toContain('Skill 不反向引用');
    expect(adapter).toContain('取消不是不可用');
  });

  it('returns unavailable through both registered tools without advancing or opening UI', async () => {
    const registerTool = vi.fn();
    const sendUserMessage = vi.fn();
    evidenceModelingExtension({
      registerCommand: vi.fn(),
      registerTool,
      sendUserMessage,
    } as never);
    const [question, contexts] = registerTool.mock.calls.map(([tool]) => tool);
    const ctx = { hasUI: false, ui: { select: vi.fn(), editor: vi.fn() } };
    const questionResult = await question.execute(
      'question',
      {
        questionId: 'Q-018',
        gapKey: 'delivery.request',
        position: { kind: 'unlocated' },
        story: '来源待定位。',
        prompt: '有哪些约定？',
      },
      undefined,
      undefined,
      ctx,
    );
    expect(questionResult.details).toEqual({
      status: 'unavailable',
      questionId: 'Q-018',
      gapKey: 'delivery.request',
    });
    const contextResult = await contexts.execute(
      'contexts',
      {
        contexts: [
          {
            agreementRef: 'A-1',
            name: '采购',
            parties: ['买方', '卖方'],
            operatingMainline: 'cash',
            operatingBasis:
              '买方与卖方签订采购协议，使买方取得商品、卖方取得价款（买方支出）。',
            boundary: '价款与交付责任',
            clarification: 'open',
            unresolved: [],
          },
        ],
      },
      undefined,
      undefined,
      ctx,
    );
    expect(contextResult.details).toEqual({ status: 'unavailable' });
    expect(ctx.ui.select).not.toHaveBeenCalled();
    expect(ctx.ui.editor).not.toHaveBeenCalled();
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it('uses the shared current-progress contract and returns the original answer', async () => {
    const registerTool = vi.fn();
    evidenceModelingExtension({
      registerCommand: vi.fn(),
      registerTool,
    } as never);
    const tool = registerTool.mock.calls[0]?.[0];
    const input: QuestionInput = {
      questionId: 'Q-018',
      gapKey: 'delivery.request',
      position: {
        kind: 'fulfillment',
        contract: '运输协议',
        fulfillment: '送达',
        point: 'request',
      },
      story: '承运方须按约送达，我们正在追溯送达期限的约定依据。',
      prompt: '送达期限依据什么约定？',
    };
    const ctx = {
      hasUI: true,
      ui: {
        select: vi.fn().mockResolvedValue('回答'),
        editor: vi.fn().mockResolvedValue('双方逐次约定\n保留原文  '),
      },
    };

    expect(tool.parameters).toBe(QuestionInputSchema);
    const result = await tool.execute(
      'tool-call',
      input,
      undefined,
      undefined,
      ctx,
    );
    expect(result.details).toEqual({
      status: 'answered',
      questionId: input.questionId,
      gapKey: input.gapKey,
      answer: '双方逐次约定\n保留原文  ',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(result.details);
    expect(ctx.ui.editor.mock.calls[0]?.[0]).toContain(
      '运输协议 → 送达 → 请求',
    );
  });

  it('returns the selected agreement reference through the registered context tool', async () => {
    const registerTool = vi.fn();
    evidenceModelingExtension({
      registerCommand: vi.fn(),
      registerTool,
    } as never);
    const tool = registerTool.mock.calls.find(
      ([tool]) => tool.name === 'evidence_ui_contexts',
    )?.[0];
    const result = await tool.execute(
      'select',
      {
        contexts: [
          {
            agreementRef: 'A-1',
            name: '采购',
            parties: ['买方', '卖方'],
            operatingMainline: 'cash',
            operatingBasis:
              '买方与卖方签订采购协议，使买方取得商品、卖方取得价款（买方支出）。',
            boundary: '价款与交付责任',
            clarification: 'open',
            unresolved: ['交付证明待明确'],
          },
        ],
      },
      undefined,
      undefined,
      {
        hasUI: true,
        ui: { select: vi.fn(async (_title, choices) => choices[0]) },
      },
    );
    expect(result.details).toEqual({ status: 'selected', agreementRef: 'A-1' });
    expect(JSON.parse(result.content[0].text)).toEqual(result.details);
  });

  it('contains no run state, publication tool, path interception, or auto-advance hook', async () => {
    const source = (
      await Promise.all(
        (await sourceFiles(directory)).map((path) => readFile(path, 'utf8')),
      )
    ).join('\n');

    expect(source).not.toMatch(/agent_settled|tool_call|ToolLease|StateStore/);
    expect(source).not.toContain('.evidence/evidence-modeling');
    expect(source).not.toMatch(
      /writeFile|appendEntry|\bapply_candidate\b|pi\.exec/,
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*\/evidence\//);
  });
});
