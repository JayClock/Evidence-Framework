/**
 * IPC channels for the MCP bridge.
 *
 * The main process owns the local socket and the screenshot, the renderer owns
 * the live `ModelSession`, so every tool call is one round trip between the two.
 */
export const EVIDENCE_MCP_IPC_CHANNELS = {
  request: 'evidence:mcp:request',
  response: 'evidence:mcp:response',
  captureMode: 'evidence:mcp:capture-mode',
  status: 'evidence:mcp:status',
} as const;

export type EvidenceMcpIpcChannel =
  (typeof EVIDENCE_MCP_IPC_CHANNELS)[keyof typeof EVIDENCE_MCP_IPC_CHANNELS];

/** Methods only the renderer can answer, because they read the live session. */
export type McpRendererMethod =
  | 'get_app_state'
  | 'get_domain_model'
  | 'get_selected_entity'
  | 'apply_model_patch'
  /** Geometry of the region to capture, computed by the renderer's layout. */
  | 'get_capture_rect';

export interface McpRendererRequest {
  requestId: string;
  method: McpRendererMethod;
  payload: unknown;
}

export type McpRendererResponse =
  | { requestId: string; success: true; result: unknown }
  | {
      requestId: string;
      success: false;
      error: { code: string; message: string };
    };

/** What the header shows about the bridge. */
export interface McpStatus {
  listening: boolean;
  endpoint: string | null;
  connections: number;
  calls: number;
  /** Client config files the app keeps in sync, e.g. `Cursor`. */
  registeredClients: readonly string[];
  /** Last failure, kept so the header can explain a dead bridge. */
  error: string | null;
}

/** Tool surface the renderer may reach. */
export interface EvidenceMcpApi {
  getStatus: () => Promise<McpStatus>;
  onStatus: (listener: (status: McpStatus) => void) => () => void;
  onRequest: (listener: (request: McpRendererRequest) => void) => () => void;
  respond: (response: McpRendererResponse) => void;
  /** Main asks the renderer to hide editor chrome before a screenshot. */
  onCaptureMode: (listener: (active: boolean) => void) => () => void;
}
