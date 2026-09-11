import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import fmModelingExtension from './index.js';

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

describe('fm-modeling UI adapter boundary', () => {
  it('registers the skill command and question UI only', () => {
    const registerCommand = vi.fn();
    const registerTool = vi.fn();
    const on = vi.fn();

    fmModelingExtension({ registerCommand, registerTool, on } as never);

    expect(registerCommand).toHaveBeenCalledOnce();
    expect(registerCommand.mock.calls[0]?.[0]).toBe('fm-model');
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(registerTool.mock.calls.map((call) => call[0].name)).toEqual([
      'fm_ui_question',
      'fm_ui_review',
    ]);
    expect(on).not.toHaveBeenCalled();
  });

  it('contains no run state, publication tool, path interception, or auto-advance hook', async () => {
    const source = (
      await Promise.all(
        (await sourceFiles(directory)).map((path) => readFile(path, 'utf8')),
      )
    ).join('\n');

    expect(source).not.toMatch(/fm_model_(?:submit|ask)/);
    expect(source).not.toMatch(/agent_settled|tool_call|ToolLease|StateStore/);
    expect(source).not.toContain('.evidence/fm-modeling');
    expect(source).not.toMatch(
      /writeFile|appendEntry|\bapply_candidate\b|pi\.exec/,
    );
    expect(source).not.toMatch(/from\s+['"][^'"]*\/evidence\//);
  });
});
