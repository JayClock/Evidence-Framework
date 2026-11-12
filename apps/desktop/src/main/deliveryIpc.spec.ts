import { describe, expect, it, vi } from 'vitest';

import type { DeliveryBundle } from '@evidence-poc/evidence-api';

// `electron` is stubbed because these handlers only need the two calls they make.
const handlers = new Map<string, (...args: never[]) => unknown>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
}));

const { registerDeliveryIpc } = await import('./deliveryIpc');
const { suggestedDeliveryDirectory, deliveryFilesOf, previewOf } = await import(
  './deliveryProjection'
);

const bundle = (): DeliveryBundle =>
  ({
    schemaVersion: '1.0',
    modelId: 'procurement',
    modelName: '商品采购',
    modelVersion: '1.1.0',
    routes: [
      {
        id: 'route.sign.contract.procurement',
        operationId: 'signContractProcurement',
        method: 'POST',
        path: '/procurement/procurement',
        purpose: 'sign',
        serviceId: 'service.procurement',
        contextRef: 'context.procurement',
        entityRef: 'contract.procurement',
        contractRef: 'contract.procurement',
        requestRef: null,
        confirmationRef: null,
        summary: '签署采购协议',
        fields: [],
        derived: [],
        stamped: [],
        responses: [],
      },
    ],
    services: [
      {
        id: 'service.procurement',
        name: '采购',
        kind: 'fulfillment',
        contextRef: 'context.procurement',
        lane: 'procurement',
        rootRefs: ['contract.procurement'],
        evidenceRefs: ['contract.procurement'],
        supplies: [],
        consumes: [],
        notes: '合同上下文。',
      },
    ],
    links: [],
    openapi: {
      openapi: '3.1.0',
      info: { title: '商品采购', version: '1.1.0', description: '' },
      'x-evidence-model': 'procurement',
      paths: {},
      components: { schemas: {} },
      'x-evidence-services': [],
    },
    deployment: { version: '3', services: {} },
    limitations: ['request.delivery 没有履约确认，未生成确认回调接口。'],
  }) as unknown as DeliveryBundle;

const invoke = async (
  channel: string,
  rootPath: string,
  options: Parameters<typeof registerDeliveryIpc>[0] = {},
): Promise<unknown> => {
  handlers.clear();
  registerDeliveryIpc({ build: async () => bundle(), ...options });

  const handler = handlers.get(channel);

  if (handler === undefined) {
    throw new Error(`${channel} was not registered`);
  }

  return handler({ sender: {} } as never, rootPath as never);
};

describe('deliveryProjection', () => {
  it('writes the contract, the topology, the routes and the sketch', () => {
    const files = deliveryFilesOf(bundle());

    expect(files.map((file) => file.path)).toEqual([
      'openapi.json',
      'topology.json',
      'routes.json',
      'deployment.compose.json',
      'limitations.md',
    ]);
    expect(JSON.parse(files[0]?.content ?? '{}')).toMatchObject({
      openapi: '3.1.0',
    });
  });

  it('counts the routes each service answers for the preview', () => {
    expect(previewOf(bundle()).services[0]?.routeCount).toBe(1);
    expect(previewOf(bundle()).limitations).toHaveLength(1);
  });

  it('suggests a delivery folder beside the project', () => {
    expect(suggestedDeliveryDirectory('/models/procurement')).toBe(
      '/models/procurement/delivery',
    );
  });
});

describe('registerDeliveryIpc', () => {
  it('previews the delivery without asking where to write it', async () => {
    const result = (await invoke(
      'evidence:project:delivery-preview',
      '/models/procurement',
    )) as { success: boolean; preview: { services: unknown[] } };

    expect(result.success).toBe(true);
    expect(result.preview.services).toHaveLength(1);
  });

  it('reports a read failure instead of throwing at the renderer', async () => {
    const result = (await invoke(
      'evidence:project:delivery-preview',
      '/models/procurement',
      {
        build: async () => {
          throw new Error('FM 未通过');
        },
      },
    )) as { success: boolean; error: string };

    expect(result).toEqual({ success: false, error: 'FM 未通过' });
  });

  it('writes every file into the chosen directory', async () => {
    const written: { directory: string; files: string[] }[] = [];
    const result = (await invoke(
      'evidence:project:export-delivery',
      '/models/procurement',
      {
        showDirectoryDialog: async () => ({
          canceled: false,
          directory: '/exports/procurement',
        }),
        write: async (directory, files) => {
          written.push({ directory, files: files.map((file) => file.path) });
        },
      },
    )) as { status: string; routeCount: number };

    expect(result).toMatchObject({ status: 'saved', routeCount: 1 });
    expect(written).toEqual([
      {
        directory: '/exports/procurement',
        files: [
          'openapi.json',
          'topology.json',
          'routes.json',
          'deployment.compose.json',
          'limitations.md',
        ],
      },
    ]);
  });

  it('writes nothing when the picker is dismissed', async () => {
    const write = vi.fn();
    const result = (await invoke(
      'evidence:project:export-delivery',
      '/models/procurement',
      {
        showDirectoryDialog: async () => ({ canceled: true }),
        write,
      },
    )) as { status: string };

    expect(result).toEqual({ status: 'cancelled' });
    expect(write).not.toHaveBeenCalled();
  });
});
