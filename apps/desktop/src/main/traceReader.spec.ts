import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readInterviewTrace } from './traceReader';

const withTrace = async (
  content: string,
  run: (rootPath: string) => Promise<void>,
): Promise<void> => {
  const rootPath = await mkdtemp(path.join(tmpdir(), 'evidence-trace-'));

  try {
    await writeFile(
      path.join(rootPath, '.evidence', 'traces', 'interview-trace.json'),
      content,
      'utf8',
    ).catch(async () => {
      const { mkdir } = await import('node:fs/promises');

      await mkdir(path.join(rootPath, '.evidence', 'traces'), {
        recursive: true,
      });
      await writeFile(
        path.join(rootPath, '.evidence', 'traces', 'interview-trace.json'),
        content,
        'utf8',
      );
    });

    await run(rootPath);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
};

describe('readInterviewTrace', () => {
  it('returns null when the project never ran an interview', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'evidence-trace-'));

    try {
      await expect(readInterviewTrace(rootPath)).resolves.toEqual({
        success: true,
        trace: null,
      });
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it('reads a trace document as the interview appends it', async () => {
    const document = {
      schemaVersion: '5.0',
      modelId: 'product-procurement',
      traces: [{ traceId: 't1' }],
    };

    await withTrace(JSON.stringify(document), async (rootPath) => {
      await expect(readInterviewTrace(rootPath)).resolves.toEqual({
        success: true,
        trace: document,
      });
    });
  });

  it('refuses JSON that is not a trace instead of reporting an empty frontier', async () => {
    await withTrace('{"modelId":"x"}', async (rootPath) => {
      await expect(readInterviewTrace(rootPath)).resolves.toEqual({
        success: false,
        error: '追溯日志缺少 traces 数组，无法推导依赖前沿。',
      });
    });
  });

  it('reports broken JSON with the parse failure', async () => {
    await withTrace('{oops', async (rootPath) => {
      const result = await readInterviewTrace(rootPath);

      expect(result.success).toBe(false);
      expect(result.success === false && result.error).toMatch(
        /追溯日志不是合法 JSON/,
      );
    });
  });
});
