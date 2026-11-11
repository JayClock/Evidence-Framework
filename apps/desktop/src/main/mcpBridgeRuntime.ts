import { randomUUID } from 'node:crypto';

import type { WebContents } from 'electron';

import {
  createEvidenceMcpBridgeServer,
  type EvidenceMcpBridgeServer,
  type EvidenceMcpAppRequest,
  type EvidenceMcpAppResult,
} from '@evidence-poc/evidence-mcp';

import {
  EVIDENCE_MCP_IPC_CHANNELS,
  type McpRendererRequest,
  type McpRendererResponse,
  type McpStatus,
} from '../shared/mcpIpc';

import type { McpRendererChannel } from './mcpRequestHandler';
import { imageToPng } from './mcpCapture';

export interface McpBridgeRuntimeOptions {
  endpoint: string;
  /** The editor whose `ModelSession` answers model questions. */
  getActiveContents: () => WebContents | null;
  /** Creates the request handler, kept injectable for tests. */
  createHandler: (deps: {
    renderer: McpRendererChannel;
    capture: (
      rect: { x: number; y: number; width: number; height: number },
    ) => Promise<{ data: string; width: number; height: number }>;
    onCall: () => void;
  }) => (request: EvidenceMcpAppRequest) => Promise<EvidenceMcpAppResult>;
  publishStatus: (status: McpStatus) => void;
  registeredClients?: readonly string[];
  timeoutMs?: number;
}

export interface McpBridgeRuntime {
  status: () => McpStatus;
  /** Answers one renderer-bound call; called by the MCP IPC registrar. */
  respond: (response: McpRendererResponse) => void;
  dispose: () => Promise<void>;
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Hosts the local socket and forwards renderer-bound calls over IPC.
 *
 * Each call is a correlated request/response pair: the renderer answers with the
 * same id, and a timeout keeps a closed editor window from hanging an agent.
 */
export const startMcpBridgeRuntime = async ({
  endpoint,
  getActiveContents,
  createHandler,
  publishStatus,
  registeredClients = [],
  timeoutMs = REQUEST_TIMEOUT_MS,
}: McpBridgeRuntimeOptions): Promise<McpBridgeRuntime> => {
  const pending = new Map<
    string,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let connections = 0;
  let calls = 0;
  let error: string | null = null;

  const status = (): McpStatus => ({
    listening: true,
    endpoint,
    connections,
    calls,
    registeredClients,
    error,
  });

  const renderer: McpRendererChannel = (method, payload) =>
    new Promise<unknown>((resolve, reject) => {
      const contents = getActiveContents();

      if (contents === null || contents.isDestroyed()) {
        reject(
          new Error('桌面端没有打开的模型窗口，无法读取或修改当前模型。'),
        );
        return;
      }

      const requestId = randomUUID();
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('模型窗口没有在时限内响应 MCP 请求。'));
      }, timeoutMs);

      pending.set(requestId, {
        resolve,
        reject: (cause) => reject(cause),
        timer,
      });
      contents.send(EVIDENCE_MCP_IPC_CHANNELS.request, {
        requestId,
        method,
        payload,
      } satisfies McpRendererRequest);
    });

  const capture = async (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
    const contents = getActiveContents();

    if (contents === null || contents.isDestroyed()) {
      throw new Error('桌面端没有打开的模型窗口，无法截取画布。');
    }

    // Hide selection rings and the zoom control, then put the chrome back.
    contents.send(EVIDENCE_MCP_IPC_CHANNELS.captureMode, true);

    try {
      const image = await contents.capturePage(rect);

      return imageToPng(image);
    } finally {
      contents.send(EVIDENCE_MCP_IPC_CHANNELS.captureMode, false);
    }
  };

  const respond = (response: McpRendererResponse): void => {
    const entry = pending.get(response.requestId);

    if (entry === undefined) {
      return;
    }

    clearTimeout(entry.timer);
    pending.delete(response.requestId);

    if (response.success) {
      entry.resolve(response.result);
      return;
    }

    entry.reject(new Error(response.error.message));
  };

  const handler = createHandler({
    renderer,
    capture,
    onCall: () => {
      calls += 1;
      publishStatus(status());
    },
  });

  const server: EvidenceMcpBridgeServer = await createEvidenceMcpBridgeServer({
    endpoint,
    handleRequest: async (request) => {
      try {
        return await handler(request);
      } catch (failure) {
        error = failure instanceof Error ? failure.message : '未知 MCP 错误。';
        publishStatus(status());
        throw failure;
      }
    },
    onConnectionChange: (count) => {
      connections = count;
      publishStatus(status());
    },
  });

  publishStatus(status());

  return {
    status,
    respond,
    dispose: async () => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('MCP bridge 已关闭。'));
      }

      pending.clear();
      await server.close();
    },
  };
};
