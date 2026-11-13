import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { readModelRoot } from '@evidence-poc/evidence-model-core';
import type { LiveDeliveryInput } from '../shared/delivery';
import { EVIDENCE_IPC_CHANNELS } from '../shared/ipc';

const handlers = new Map<string, (...args: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
}));
const { registerDeliveryIpc } = await import('./deliveryIpc');
const { livePreviewOf } = await import('./deliveryProjection');
const input = async (): Promise<LiveDeliveryInput> => {
  const document = (
    await readModelRoot(
      path.resolve(
        import.meta.dirname,
        '../../../../libs/evidence-api/tests/fixtures/full-lifecycle/fm',
      ),
    )
  ).bundle;
  return {
    rootPath: '/not-on-disk',
    revision: 7,
    document,
    baseDocument: structuredClone(document),
  };
};
const invoke = (channel: string, value: unknown) =>
  handlers.get(channel)!({ sender: {} }, value);

describe('live delivery IPC', () => {
  it('projects unsaved edits without calling the disk builder', async () => {
    const build = vi.fn(async () => {
      throw new Error('must not read disk');
    });
    registerDeliveryIpc({ build });
    const value = await input();
    value.document.entities.find(
      (entity) => entity.id === 'contract.product-procurement',
    )!.label = '新合同';
    const result = await invoke(
      EVIDENCE_IPC_CHANNELS.deliveryLivePreview,
      value,
    );
    expect(result).toMatchObject({
      success: true,
      analysis: { revision: 7, canExportDraft: true },
    });
    expect(build).not.toHaveBeenCalled();
    expect(livePreviewOf(value).diff.summary.routesModified).toBeGreaterThan(0);
  });

  it('reports invalid input and refuses stale or invalid exports before writing', async () => {
    const write = vi.fn(async () => undefined);
    const showDirectoryDialog = vi.fn(async () => ({
      canceled: false,
      directory: '/export',
    }));
    registerDeliveryIpc({ write, showDirectoryDialog });
    expect(
      await invoke(EVIDENCE_IPC_CHANNELS.deliveryLivePreview, null),
    ).toMatchObject({ success: false });
    const value = await input();
    expect(
      await invoke(EVIDENCE_IPC_CHANNELS.exportLiveDelivery, {
        ...value,
        expectedModelDigest: 'old',
      }),
    ).toMatchObject({ status: 'failed' });
    value.document.entities.push(structuredClone(value.document.entities[0]!));
    expect(
      await invoke(EVIDENCE_IPC_CHANNELS.exportLiveDelivery, {
        ...value,
        expectedModelDigest: 'old',
      }),
    ).toMatchObject({ status: 'failed' });
    expect(write).not.toHaveBeenCalled();
    expect(showDirectoryDialog).not.toHaveBeenCalled();
  });

  it('freezes the previewed document across the directory dialog and exports draft diagnostics', async () => {
    const value = await input();
    const analysis = livePreviewOf(value);
    const write = vi.fn(
      async (_directory: string, _files: { path: string; content: string }[]) =>
        undefined,
    );
    registerDeliveryIpc({
      write,
      showDirectoryDialog: async () => {
        value.document.entities.length = 0;
        return { canceled: false, directory: '/export' };
      },
    });
    const result = await invoke(EVIDENCE_IPC_CHANNELS.exportLiveDelivery, {
      ...value,
      expectedModelDigest: analysis.modelDigest,
    });
    expect(result).toMatchObject({ status: 'saved' });
    const files = write.mock.calls[0]![1];
    expect(
      JSON.parse(
        files.find((file) => file.path === 'draft-status.json')!.content,
      ),
    ).toMatchObject({
      releaseAuthorized: false,
      modelDigest: analysis.modelDigest,
    });
    const snapshot = JSON.parse(
      files.find((file) => file.path === 'projection.json')!.content,
    );
    expect(snapshot.routes.length).toBeGreaterThan(0);
    expect(snapshot.digests.model).toBe(analysis.modelDigest);
  });
});
