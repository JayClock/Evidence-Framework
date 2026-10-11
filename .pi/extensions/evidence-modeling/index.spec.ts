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
  it('registers the skill command and question UI only', () => {
    const registerCommand = vi.fn();
    const registerTool = vi.fn();
    const on = vi.fn();

    evidenceModelingExtension({ registerCommand, registerTool, on } as never);

    expect(registerCommand).toHaveBeenCalledOnce();
    expect(registerCommand.mock.calls[0]?.[0]).toBe('evidence-model');
    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0]?.[0].name).toBe('evidence_ui_question');
    expect(on).not.toHaveBeenCalled();
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
      known: ['承运方须按约送达'],
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
