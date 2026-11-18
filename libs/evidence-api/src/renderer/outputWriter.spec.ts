import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { writeOutput } from './outputRenderer.js';

it('publishes nested files and rejects traversal without replacing the previous tree', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evidence-output-'));
  const out = path.join(root, 'out');
  try {
    const nested = path.join(out, 'flows/first/request.bru');
    writeOutput(out, { 'flows/first/request.bru': 'original' });
    for (const bad of [
      '../escaped',
      'sub/../escape',
      'sub/.. /escape',
      '/absolute',
      'a\\b',
      'C:/absolute',
    ]) {
      expect(() =>
        writeOutput(out, { 'replacement.json': '{}', [bad]: 'x' }),
      ).toThrow('OUTPUT_NAME_INVALID');
      expect(readFileSync(nested, 'utf8')).toBe('original');
      expect(existsSync(path.join(out, 'replacement.json'))).toBe(false);
      expect(existsSync(path.join(root, 'escaped'))).toBe(false);
    }
    writeOutput(out, { 'next/request.bru': 'replacement' });
    expect(readFileSync(path.join(out, 'next/request.bru'), 'utf8')).toBe(
      'replacement',
    );
    expect(existsSync(nested)).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
