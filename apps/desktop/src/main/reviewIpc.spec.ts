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
    { id: 'context.product-procurement', category: 'context', kind: 'contract' },
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
