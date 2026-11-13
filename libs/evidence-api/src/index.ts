export {
  diagnosticToJson,
  errorDiagnostic,
  gapDiagnostic,
  hasErrors,
  hasGaps,
  normalizeDiagnostics,
  type Diagnostic,
  type DiagnosticCategory,
  type DiagnosticSeverity,
} from './diagnostics.js';

export { canonicalJson, sortedKeys } from './canonicalJson.js';

export {
  API_DESIGN_SECTIONS,
  DesignJsonError,
  loadDesign,
  parseStrictJson,
  validateProjection,
  type DesignDocument,
  type LoadDesignResult,
} from './loader/apiLoader.js';

export {
  checkReportProblem,
  digestBytes,
  loadFm,
  loadFmFromDocument,
  partyRolesPlayedByParticipants,
  type LoadFmDocumentOptions,
  type FmIndex,
  type FmSnapshot,
  type LoadFmResult,
} from './adapter/fmAdapter.js';

export {
  inspectSummary,
  type InspectEntry,
  type InspectSummary,
} from './inspect.js';

export {
  buildResources,
  type BuildResourcesResult,
  type ProjectedResource,
} from './projection/resources.js';

export {
  validateCardinality,
  type CardinalityMax,
} from './projection/cardinality.js';

export {
  projectCapabilities,
  type BuildCapabilitiesResult,
  type ProjectedCapability,
  type ProjectedOperation,
} from './projection/capabilities.js';

export {
  projectCoverage,
  type CoverageRow,
  type CoverageStep,
  type ProjectCoverageResult,
} from './projection/coverage.js';

export {
  projectModelCoverage,
  type ModelCoverageRow,
  type ProjectModelCoverageResult,
} from './projection/modelCoverage.js';

export {
  bindLink,
  buildRepresentations,
  encodeQuery,
  expand,
  matchesUri,
  parameters,
  renderLinks,
  type BuildRepresentationsResult,
} from './http/contractLinks.js';

export {
  exampleErrors,
  payloadOf,
  payloadSchema,
  schemaSupported,
  validatePayload,
  type Payload,
  type PayloadField,
} from './http/contractPayloads.js';

export { buildHttp, type HttpContract } from './http/contracts.js';

export {
  checkConsumption,
  navigationGraph,
  type CheckConsumptionResult,
  type ConsumptionRow,
  type ConsumptionStep,
  type NavigationEdge,
} from './http/consumerCoverage.js';

export {
  checkJourneys,
  type CheckJourneysResult,
  type JourneyRow,
  type JourneyStepResult,
  type JourneyStepRow,
} from './http/httpJourneys.js';

export { buildOpenApi, componentName } from './openapi/openapi.js';

export {
  TOOL_NAME,
  TOOL_VERSION,
  defaultOutputDirectory,
  renderOutputs,
  writeOutput,
} from './renderer/outputRenderer.js';

export {
  buildVectors,
  type TestVector,
  type TestVectorDocument,
} from './vectors/e2eVectors.js';

export {
  buildProjection,
  isComplete,
  type BuildProjectionInput,
  type BuildProjectionResult,
  type Projection,
} from './projector.js';

export {
  buildDeliveryRoutes,
  fieldFor,
  type DeliveryField,
  type DeliveryFieldReason,
  type DeliveryRoute,
  type DeliveryRouteMethod,
  type DeliveryRoutePurpose,
  type DeliveryRouteResponse,
} from './delivery/routes.js';

export { deliveryFilesOf, type DeliveryFile } from './delivery/files.js';

export {
  createSegmentAllocator,
  operationIdFor,
  rawSegmentOf,
  serviceIdOf,
} from './delivery/segments.js';

export {
  buildDeliveryTopology,
  type DeliveryLink,
  type DeliveryLinkMode,
  type DeliveryService,
  type DeliveryServiceKind,
  type DeliveryTopology,
} from './delivery/topology.js';

export {
  buildDelivery,
  buildDeliveryContract,
  buildDeliveryDeployment,
  type DeliveryBundle,
  type DeliveryContract,
  type DeliveryDeployment,
} from './delivery/delivery.js';

export {
  runCli,
  validatePaths,
  type CliOptions,
  type CliResult,
  type Command,
} from './cli.js';

export { compareText, sortedText } from './order.js';
export type { JsonObject } from './types.js';

export { API_SCHEMA, API_SCHEMA_TEXT } from './schemas/apiSchema.js';
export {
  API_PROJECTION_SCHEMA,
  API_PROJECTION_SCHEMA_TEXT,
} from './schemas/apiProjectionSchema.js';
