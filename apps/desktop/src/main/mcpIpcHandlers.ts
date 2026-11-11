import { ipcMain } from 'electron';

import {
  EVIDENCE_MCP_IPC_CHANNELS,
  type McpRendererResponse,
} from '../shared/mcpIpc';

import type { McpBridgeRuntime } from './mcpBridgeRuntime';

/**
 * Wires the renderer side of the bridge.
 *
 * Only the renderer that answers `get_capture_rect` may also answer model calls,
 * so a screenshot cannot silently come from a different window than the model the
 * agent just read.
 *
 * `status` is both pushed (when a client connects) and pulled: a window that
 * opens later would otherwise show "未启动" until some other event fired.
 */
export const registerMcpIpc = ({
  runtime,
}: {
  runtime: McpBridgeRuntime;
}): { dispose: () => void } => {
  const listener = (
    _event: Electron.IpcMainEvent,
    response: McpRendererResponse,
  ): void => {
    runtime.respond(response);
  };

  ipcMain.on(EVIDENCE_MCP_IPC_CHANNELS.response, listener);
  ipcMain.handle(EVIDENCE_MCP_IPC_CHANNELS.status, () => runtime.status());

  return {
    dispose: () => {
      ipcMain.removeListener(EVIDENCE_MCP_IPC_CHANNELS.response, listener);
      ipcMain.removeHandler(EVIDENCE_MCP_IPC_CHANNELS.status);
    },
  };
};
