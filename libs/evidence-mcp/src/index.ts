export {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  EvidenceMcpError,
  type EvidenceMcpAppClient,
  type EvidenceMcpAppRequest,
  type EvidenceMcpAppResult,
  type EvidenceMcpErrorCode,
  type McpAppState,
  type McpDeliveryTopology,
  type McpDriftAudit,
  type McpDriftFinding,
  type McpScenarioReplay,
  type McpReplayFrame,
  type McpDomainModel,
  type McpOpenApiContract,
  type McpKeyDataAudit,
  type McpPatchInput,
  type McpPatchResult,
  type McpScreenshot,
  type McpSelectedEntity,
  type McpSensorIssue,
  type McpStageGateResult,
} from './types.js';

export {
  MCP_SOCKET_PREFIX,
  getEvidenceMcpBridgeEndpoint,
  isNamedPipe,
} from './bridge/endpoint.js';

export {
  MAX_MESSAGE_BYTES,
  createEvidenceMcpBridgeClient,
} from './bridge/client.js';

export {
  createEvidenceMcpBridgeServer,
  type EvidenceMcpBridgeServer,
} from './bridge/server.js';

export {
  SERVER_INSTRUCTIONS,
  TOOL_NAMES,
  createEvidenceTools,
  evidenceToolNames,
  type EvidenceTool,
  type EvidenceToolResult,
} from './server/toolset.js';

export {
  createEvidenceMcpServer,
  startEvidenceMcpStdioServer,
} from './server/mcpServer.js';

export { MCP_ENDPOINT_ENV, runEvidenceMcpStdio } from './cli.js';
