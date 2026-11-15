import { describe, expect, it, vi } from 'vitest';

import type { DriftService } from './mcpDriftService';

const service = (): DriftService & {
  driftCalls: unknown[];
} => {
  const driftCalls: unknown[] = [];

  return {
    driftCalls,
    auditDrift: async (input) => {
      driftCalls.push(input);

      return {
        modelId: 'procurement',
        spanCount: 1,
        commitCount: 0,
        counts: {},
        findings: [],
        passed: true,
        errors: [],
      };
    },
  };
};

const TRACE = JSON.stringify({ resourceSpans: [] });

/** Registers the IPC handlers against a fake electron, returning the channels. */
const register = async (
  options: {
    readFile?: () => Promise<string>;
    showOpenDialog?: () => Promise<{ canceled: boolean; filePath?: string }>;
  } = {},
) => {
  vi.resetModules();

  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  vi.doMock('electron', () => ({
    dialog: { showOpenDialog: vi.fn() },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => handlers.delete(channel),
    },
  }));

  const { registerDriftIpc } = await import('./driftIpc');
  const stub = service();

  const registered = registerDriftIpc({
    service: stub,
    readFile: options.readFile ?? (async () => TRACE),
    ...(options.showOpenDialog === undefined
      ? {}
      : { showOpenDialog: options.showOpenDialog }),
  });

  return { handlers, stub, registered };
};

describe('registerDriftIpc', () => {
  it('reads the trace file and audits the parsed document', async () => {
    const { handlers, stub } = await register();
    const drift = handlers.get('evidence:drift:drift');

    const result = await drift?.(
      {},
      { rootPath: '/models/procurement', tracePath: '/traces/checkout.json' },
    );

    expect(stub.driftCalls).toEqual([
      { rootPath: '/models/procurement', document: { resourceSpans: [] } },
    ]);
    expect(result).toMatchObject({ passed: true });
  });

  it('names the file when the trace is not JSON, instead of reporting a drift', async () => {
    const { handlers, stub } = await register({
      readFile: async () => 'not json',
    });
    const drift = handlers.get('evidence:drift:drift');

    await expect(
      drift?.({}, { rootPath: '/models/procurement', tracePath: '/t.json' }),
    ).rejects.toThrow(/不是 JSON/);
    expect(stub.driftCalls).toEqual([]);
  });

  it('reports a cancelled picker as cancelled, not as an empty path', async () => {
    const { registered } = await register({
      showOpenDialog: async () => ({ canceled: true }),
    });

    expect(await registered.pickTrace()).toEqual({ canceled: true });
  });

  it('resolves the picked file to an absolute path', async () => {
    const { registered } = await register({
      showOpenDialog: async () => ({
        canceled: false,
        filePath: 'traces/a.json',
      }),
    });

    const picked = await registered.pickTrace();

    expect(picked).toEqual({
      canceled: false,
      path: expect.stringContaining('/traces/a.json'),
    });
  });

  it('removes every channel it registered on dispose', async () => {
    const { handlers, registered } = await register();

    expect(handlers.size).toBe(2);

    registered.dispose();

    expect(handlers.size).toBe(0);
  });
});
