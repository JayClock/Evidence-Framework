import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReviewUI } from './review-ui.js';

const temporaryDirectories: string[] = [];

async function receipt(overrides: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'fm-review-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'receipt.json');
  await writeFile(
    path,
    JSON.stringify({
      preparationId: 'prepared-abc',
      receiptDigest: 'sha256:receipt',
      status: 'prepared',
      candidate: { digest: 'sha256:candidate' },
      target: { path: '/project/docs/business/fm', digest: 'absent' },
      difference: {
        added: ['model.yaml'],
        modified: [],
        deleted: ['obsolete.yaml'],
        patch: '完整差异\n'.repeat(5000),
      },
      validation: {
        valid: true,
        executedScenarioCount: 0,
        simulationPassed: null,
      },
      ...overrides,
    }),
  );
  return path;
}

function context(actions: Array<string | undefined>, hasUI = true) {
  return {
    cwd: '/',
    hasUI,
    ui: {
      select: vi.fn().mockImplementation(() => actions.shift()),
      editor: vi.fn().mockResolvedValue(undefined),
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ReviewUI', () => {
  it('binds save authorization to the displayed preparation receipt', async () => {
    const ctx = context(['保存此候选']);

    const result = await new ReviewUI().open(await receipt(), ctx as never);

    expect(result).toEqual({
      status: 'save',
      preparationId: 'prepared-abc',
      receiptDigest: 'sha256:receipt',
    });
    expect(ctx.ui.select.mock.calls[0]?.[0]).toContain(
      '/project/docs/business/fm',
    );
  });

  it('shows the complete long diff before returning for modification', async () => {
    const path = await receipt();
    const value = JSON.parse(
      await (await import('node:fs/promises')).readFile(path, 'utf8'),
    );
    const ctx = context(['查看完整差异', '返回修改']);

    const result = await new ReviewUI().open(path, ctx as never);

    expect(ctx.ui.editor).toHaveBeenCalledWith(
      expect.stringContaining('prepared-abc'),
      value.difference.patch,
    );
    expect(result.status).toBe('revise');
    expect(ctx.ui.select).toHaveBeenCalledTimes(2);
  });

  it('does not describe an empty scenario suite as simulation success', async () => {
    const ctx = context(['暂不保存']);

    const result = await new ReviewUI().open(await receipt(), ctx as never);

    expect(ctx.ui.select.mock.calls[0]?.[0]).toContain(
      '场景：未执行（不表示模拟通过）',
    );
    expect(result.status).toBe('deferred');
  });

  it('keeps cancellation distinct from save permission', async () => {
    const result = await new ReviewUI().open(
      await receipt(),
      context([undefined]) as never,
    );

    expect(result.status).toBe('cancelled');
  });

  it('returns unavailable without reading a receipt when no UI exists', async () => {
    const result = await new ReviewUI().open(
      '/missing/receipt.json',
      context([], false) as never,
    );

    expect(result).toEqual({ status: 'unavailable' });
  });
});
