import path from 'node:path';
import { projectWorkbenchData } from '@evidence-poc/evidence-visualization';
import { createEmptyDomainModel } from '@evidence-poc/evidence-schema';
import { describe, expect, it, vi } from 'vitest';

// `electron` is stubbed because this handler only needs the two calls it makes.
const handlers = new Map<string, (...args: never[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showSaveDialog: async () => ({ canceled: true }) },
  app: { isPackaged: false, getAppPath: () => '/repo/apps/desktop' },
}));

const { registerReviewIpc, reviewScopeRefs, suggestedReviewFileName } =
  await import('./reviewIpc');

const document = (): {
  manifest: { entryContextRefs: string[] };
  entities: unknown[];
} => ({
  manifest: {
    entryContextRefs: [
      'context.product-procurement',
      'context.product-catalog',
      'context.product-sourcing',
    ],
  },
  entities: [
    {
      id: 'context.product-procurement',
      category: 'context',
      kind: 'contract',
    },
    { id: 'context.product-catalog', category: 'context', kind: 'domain' },
    {
      id: 'context.product-sourcing',
      category: 'context',
      kind: 'pre_contract',
      parentContextRef: 'context.product-procurement',
    },
  ],
});

const invoke = async (
  rootPath: string,
  options: Parameters<typeof registerReviewIpc>[0] = {},
): Promise<unknown> => {
  handlers.clear();
  registerReviewIpc({
    resolveAssets: () => '/install/assets',
    ...options,
  });

  const handler = handlers.get('evidence:project:export-review');

  if (handler === undefined) {
    throw new Error('export handler was not registered');
  }

  return handler({ sender: {} } as never, rootPath as never);
};

describe('suggestedReviewFileName', () => {
  it('puts the page beside the project rather than in a dot directory', () => {
    expect(suggestedReviewFileName('/models/procurement')).toBe(
      '/models/procurement/review.html',
    );
  });
});

describe('reviewScopeRefs', () => {
  it('keeps the entry Contexts that are nobody else s child', () => {
    expect(reviewScopeRefs(document() as never)).toEqual([
      'context.product-procurement',
      'context.product-catalog',
    ]);
  });
});

describe('registerReviewIpc', () => {
  it('previews through installed assets without a save dialog and reports failures', async () => {
    const data = projectWorkbenchData({
      model: {
        schemaVersion: '5.0',
        model: { name: '预览' },
        entities: [],
        relationships: [],
        rules: [],
      },
      check: {},
      checked: false,
    });
    const saveDialog = vi.fn();
    const input = {
      rootPath: '/model',
      revision: 2,
      document: createEmptyDomainModel(),
    };
    const preview = vi.fn(async () => ({
      success: true as const,
      revision: 2,
      data,
      issues: [],
      notice: '编辑快照',
    }));
    registerReviewIpc({
      preview,
      showSaveDialog: saveDialog,
      resolveAssets: () =>
        path.resolve(
          import.meta.dirname,
          '../../../../libs/evidence-visualization/assets',
        ),
    });
    const handle = handlers.get('evidence:project:preview-review')!;
    const response = (await handle(
      { sender: {} } as never,
      input as never,
    )) as { html: string; success: boolean };
    expect(response, JSON.stringify(response)).toHaveProperty('success', true);
    expect(response.html).toContain('Content-Security-Policy');
    expect(preview).toHaveBeenCalledWith(input);
    expect(saveDialog).not.toHaveBeenCalled();
    registerReviewIpc({
      preview: async () => {
        throw new Error('输入变化');
      },
    });
    expect(
      await handlers.get('evidence:project:preview-review')!(
        {} as never,
        input as never,
      ),
    ).toEqual({ success: false, error: '输入变化' });
  });
  it('reports a cancelled dialog without generating anything', async () => {
    const generate = vi.fn();

    expect(
      await invoke('/models/procurement', {
        showSaveDialog: async () => ({ canceled: true }),
        generate: generate as never,
      }),
    ).toEqual({ status: 'cancelled' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('chooses a baseline before exporting and passes a portable current source unchanged', async () => {
    const baseline = createEmptyDomainModel();
    const generate = vi.fn(async (input) => ({
      output: input.output,
      data: { counts: {} },
    }));
    const save = vi.fn(async () => ({
      canceled: false,
      filePath: '/tmp/diff.html',
    }));
    registerReviewIpc({
      resolveAssets: () => '/assets',
      showBaselineDialog: async () => ({
        canceled: false,
        filePaths: ['/baseline.evidence.json'],
      }),
      readDocument: async () => baseline,
      showSaveDialog: save,
      generate: generate as never,
    });
    const response = await handlers.get('evidence:project:export-diff-review')!(
      { sender: {} } as never,
      '/models/current.evidence.json' as never,
    );
    expect(response).toHaveProperty('status', 'saved');
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        baselineDocument: baseline,
        modelRoot: '/models/current.evidence.json',
      }),
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: '/models/diff-review.html' }),
    );
    generate.mockClear();
    save.mockClear();
    registerReviewIpc({
      resolveAssets: () => '/assets',
      showBaselineDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: save,
      generate: generate as never,
    });
    expect(
      await handlers.get('evidence:project:export-diff-review')!(
        { sender: {} } as never,
        '/models/current.evidence.json' as never,
      ),
    ).toEqual({ status: 'cancelled' });
    expect(generate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('generates the page the user chose and reports what it holds', async () => {
    const generate = vi.fn(async ({ output }: { output: string }) => ({
      output,
      data: {
        counts: {
          contracts: 2,
          entities: 28,
          rules: 8,
          scenarios: 1,
          capabilities: 13,
        },
      },
      collected: {},
    }));

    const result = await invoke('/models/procurement', {
      showSaveDialog: async () => ({
        canceled: false,
        filePath: '/tmp/review.html',
      }),
      generate: generate as never,
      readDocument: async () => document() as never,
    });

    expect(result).toEqual({
      status: 'saved',
      path: '/tmp/review.html',
      counts: {
        contracts: 2,
        entities: 28,
        rules: 8,
        scenarios: 1,
        capabilities: 13,
      },
    });
    expect(generate.mock.calls[0]?.[0]).toMatchObject({
      projectRoot: '/models/procurement',
      output: '/tmp/review.html',
    });
  });

  it('reports a failed generation instead of throwing at the renderer', async () => {
    const result = await invoke('/models/procurement', {
      showSaveDialog: async () => ({
        canceled: false,
        filePath: '/tmp/review.html',
      }),
      generate: (async () => {
        throw new Error('FM 未通过，不生成视图');
      }) as never,
    });

    expect(result).toEqual({
      status: 'failed',
      error: 'FM 未通过，不生成视图',
    });
  });
});
