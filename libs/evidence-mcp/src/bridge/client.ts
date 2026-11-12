import { randomUUID } from 'node:crypto';
import net from 'node:net';

import {
  type EvidenceMcpAppClient,
  type EvidenceMcpAppRequest,
  type EvidenceMcpAppResult,
  EvidenceMcpError,
  type EvidenceMcpErrorCode,
  type McpAppState,
} from '../types.js';

const DEFAULT_TIMEOUT_MS = 10_000;
export const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

interface BridgeRequest {
  id: string;
  request: EvidenceMcpAppRequest;
}

type BridgeResponse =
  | { id: string; success: true; result: EvidenceMcpAppResult }
  | {
      id: string;
      success: false;
      error: { code: EvidenceMcpErrorCode; message: string };
    };

const toMcpError = (error: unknown): EvidenceMcpError =>
  error instanceof EvidenceMcpError
    ? error
    : new EvidenceMcpError(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Unknown MCP bridge error.',
      );

const offlineAppState = (): McpAppState => ({
  isRunning: false,
  activeProject: null,
  selection: null,
  sensorsSummary: null,
  mcp: { connections: 0, calls: 0 },
});

/**
 * Sends one newline-delimited JSON request and resolves the matching answer.
 *
 * The bridge is request/response only: no streaming, no retries, and the socket
 * closes as soon as the answer arrives so a hung client cannot pin a descriptor.
 */
const requestBridge = ({
  endpoint,
  request,
  timeoutMs,
}: {
  endpoint: string;
  request: BridgeRequest;
  timeoutMs: number;
}): Promise<EvidenceMcpAppResult> =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let settled = false;
    let buffer = '';
    const fail = (error: EvidenceMcpError): void => {
      settle(() => reject(error));
    };

    function settle(callback: () => void): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.destroy();
      callback();
    }

    const timer = setTimeout(() => {
      fail(
        new EvidenceMcpError(
          'RENDERER_UNAVAILABLE',
          'Timed out waiting for the Evidence desktop app.',
        ),
      );
    }, timeoutMs);

    socket.setEncoding('utf8');
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;

      if (buffer.length > MAX_MESSAGE_BYTES) {
        fail(
          new EvidenceMcpError(
            'INTERNAL_ERROR',
            'MCP bridge response exceeded the size limit.',
          ),
        );
        return;
      }

      const newline = buffer.indexOf('\n');

      if (newline < 0) {
        return;
      }

      try {
        const response = JSON.parse(buffer.slice(0, newline)) as BridgeResponse;

        if (response.id !== request.id) {
          fail(
            new EvidenceMcpError(
              'INTERNAL_ERROR',
              'MCP bridge returned an unexpected response identifier.',
            ),
          );
          return;
        }

        if (response.success) {
          settle(() => resolve(response.result));
          return;
        }

        fail(new EvidenceMcpError(response.error.code, response.error.message));
      } catch (error) {
        fail(toMcpError(error));
      }
    });
    socket.once('error', (error) => {
      fail(
        new EvidenceMcpError(
          'APP_NOT_RUNNING',
          `Evidence desktop app is not available: ${error.message}`,
        ),
      );
    });
    socket.once('end', () => {
      fail(
        new EvidenceMcpError(
          'RENDERER_UNAVAILABLE',
          'Evidence desktop app closed the bridge connection.',
        ),
      );
    });
  });

/**
 * The `--mcp-stdio` side of the bridge.
 *
 * `get_app_state` answers honestly when the desktop app is not running instead of
 * pretending the project is empty; every other call surfaces the error.
 */
export const createEvidenceMcpBridgeClient = ({
  endpoint,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  createId = randomUUID,
}: {
  endpoint: string;
  timeoutMs?: number;
  createId?: () => string;
}): EvidenceMcpAppClient => {
  const call = async <TResult extends EvidenceMcpAppResult>(
    request: EvidenceMcpAppRequest,
  ): Promise<TResult> => {
    try {
      return (await requestBridge({
        endpoint,
        request: { id: createId(), request },
        timeoutMs,
      })) as TResult;
    } catch (error) {
      if (
        request.method === 'get_app_state' &&
        error instanceof EvidenceMcpError &&
        error.code === 'APP_NOT_RUNNING'
      ) {
        return offlineAppState() as TResult;
      }

      throw error;
    }
  };

  return {
    getAppState: () => call({ method: 'get_app_state' }),
    getDomainModel: (input) =>
      call({
        method: 'get_domain_model',
        ...(input.contextRef === undefined
          ? {}
          : { contextRef: input.contextRef }),
        ...(input.includeRules === undefined
          ? {}
          : { includeRules: input.includeRules }),
      }),
    getSelectedEntity: () => call({ method: 'get_selected_entity' }),
    getKeyDataAudit: () => call({ method: 'get_key_data_audit' }),
    getScreenshot: (input) =>
      call({
        method: 'get_canvas_screenshot',
        ...(input.targetNodeId === undefined
          ? {}
          : { targetNodeId: input.targetNodeId }),
      }),
    applyModelPatch: (patch) =>
      call({ method: 'apply_model_patch', patch }),
    runStageGate: (input) => call({ method: 'run_stage_gate', ...input }),
    getDeliveryTopology: () => call({ method: 'get_delivery_topology' }),
    exportOpenApiContract: () => call({ method: 'export_openapi_contract' }),
  };
};
