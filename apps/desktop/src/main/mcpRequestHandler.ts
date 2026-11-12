import type {
  EvidenceMcpAppRequest,
  EvidenceMcpAppResult,
  McpAppState,
  McpKeyDataAudit,
  McpScreenshot,
  McpStageGateResult,
} from '@evidence-poc/evidence-mcp';

import type { McpRendererMethod } from '../shared/mcpIpc';

import type { McpDeliveryService } from './mcpDeliveryService';
import type { SimulationService } from './mcpSimulationService';

/** Thrown by a dependency to surface a stable MCP error code. */
export class McpRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'McpRequestError';
    this.code = code;
  }
}

/** Round trip to the renderer that owns the live model. */
export type McpRendererChannel = (
  method: McpRendererMethod,
  payload: unknown,
) => Promise<unknown>;

/** Sensor and gate work the main process runs for MCP clients. */
export interface McpSensorService {
  readKeyDataAudit: (rootPath: string) => Promise<McpKeyDataAudit>;
  checkStageGate: (input: {
    rootPath: string;
    target: 'api' | 'visualization';
  }) => Promise<McpStageGateResult>;
}

export type McpCaptureService = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => Promise<{ data: string; width: number; height: number }>;

export interface McpRequestHandlerDeps {
  renderer: McpRendererChannel;
  sensors: McpSensorService;
  delivery: McpDeliveryService;
  simulation: SimulationService;
  capture: McpCaptureService;
  /** Notified for every served call, so the header can show activity. */
  onCall?: (method: EvidenceMcpAppRequest['method']) => void;
}

const activeRoot = async (
  renderer: McpRendererChannel,
): Promise<string> => {
  const state = (await renderer('get_app_state', null)) as McpAppState;

  if (state.activeProject === null) {
    throw new McpRequestError(
      'NO_ACTIVE_PROJECT',
      '桌面端还没有打开任何 .evidence/fm 项目。',
    );
  }

  return state.activeProject.rootPath;
};

/**
 * Answers one MCP request.
 *
 * Read/write calls that need the live `ModelSession` travel to the renderer;
 * only the pinned sensors and the screenshot stay in the main process. That split
 * is what keeps agent edits inside the same undo history as human edits.
 */
export const createMcpRequestHandler = ({
  renderer,
  sensors,
  delivery,
  simulation,
  capture,
  onCall,
}: McpRequestHandlerDeps) => {
  return async (
    request: EvidenceMcpAppRequest,
  ): Promise<EvidenceMcpAppResult> => {
    onCall?.(request.method);

    switch (request.method) {
      case 'get_app_state':
      case 'get_domain_model':
      case 'get_selected_entity':
        return (await renderer(request.method, request)) as EvidenceMcpAppResult;
      case 'apply_model_patch':
        return (await renderer(request.method, request.patch)) as EvidenceMcpAppResult;
      case 'get_key_data_audit':
        return sensors.readKeyDataAudit(await activeRoot(renderer));
      case 'run_stage_gate':
        return sensors.checkStageGate({
          rootPath: await activeRoot(renderer),
          target: request.target,
        });
      case 'get_delivery_topology':
        return (await delivery.topology(await activeRoot(renderer))) as EvidenceMcpAppResult;
      case 'export_openapi_contract':
        return (await delivery.openapi(await activeRoot(renderer))) as EvidenceMcpAppResult;
      case 'run_scenario_replay':
        return simulation.replay({
          rootPath: await activeRoot(renderer),
          ...(request.scenarioId === undefined
            ? {}
            : { scenarioId: request.scenarioId }),
        });
      case 'audit_production_drift':
        return simulation.auditDrift({
          rootPath: await activeRoot(renderer),
          document: request.document,
        });
      case 'get_canvas_screenshot':
        return captureCanvas({ renderer, capture, targetNodeId: request.targetNodeId });
    }
  };
};

const captureCanvas = async ({
  renderer,
  capture,
  targetNodeId,
}: {
  renderer: McpRendererChannel;
  capture: McpCaptureService;
  targetNodeId?: string;
}): Promise<McpScreenshot> => {
  const rect = (await renderer('get_capture_rect', {
    ...(targetNodeId === undefined ? {} : { targetNodeId }),
  })) as { x: number; y: number; width: number; height: number } | null;

  if (rect === null) {
    throw new McpRequestError(
      'SCREENSHOT_FAILED',
      '画布暂无可截取的区域；请先在桌面端打开一个模型窗口。',
    );
  }

  const image = await capture(rect);

  return {
    nodeId: targetNodeId ?? null,
    width: image.width,
    height: image.height,
    mimeType: 'image/png',
    data: image.data,
  };
};
