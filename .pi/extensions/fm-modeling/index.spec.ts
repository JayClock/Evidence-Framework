import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import fmModelingExtension, { boundaries } from './index.js';

const directory = join(import.meta.dirname);

async function sourceFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(path, entry.name))
        : Promise.resolve(entry.name.endsWith('.ts') ? [join(path, entry.name)] : []),
    ),
  );
  return nested.flat();
}

describe('fm-modeling extension boundary', () => {
  it('registers one independent command', async () => {
    const registerCommand = vi.fn();
    fmModelingExtension({ registerCommand, on: vi.fn() } as never);

    expect(registerCommand).toHaveBeenCalledOnce();
    expect(registerCommand).toHaveBeenCalledWith(
      'evidence-model',
      expect.objectContaining({ description: expect.any(String), handler: expect.any(Function) }),
    );
    expect(boundaries.storage).toBe('.evidence/fm-modeling');
  });

  it('does not import the legacy Evidence extension', async () => {
    for (const path of await sourceFiles(directory)) {
      const source = await readFile(path, 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*\/evidence\//);
      expect(source).not.toContain(["import('", '.pi/extensions/evidence'].join(''));
    }
  });
});
