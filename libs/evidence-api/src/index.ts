export {
  diffApiSnapshots,
  diffModelToApi,
  type ApiChangeType,
  type BreakingChangeKind,
  type ApiBreakingChange,
  type FieldDiff,
  type RouteDiff,
  type HypermediaLinkDiff,
  type ApiModelDiffResult,
} from './diff/apiDiff.js';
export { renderApiDiff } from './diff/renderApiDiff.js';
export { patchDeliveryRoutes } from './diff/patchDeliveryRoutes.js';

export {
  weaveHypermedia,
  halLinksFor,
  deriveJourneys,
  type HypermediaLink,
} from './http/hateoasWeaver.js';

export type { EvidenceApiSnapshot, ApiJourneyStep } from './types.js';

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
  normalizeDesignDocument,
  type RouteOverlay,
  type JourneyOverlay,
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

export { componentName } from './delivery/schemaName.js';

export {
  TOOL_NAME,
  TOOL_VERSION,
  defaultOutputDirectory,
  renderOutputs,
  writeOutput,
} from './renderer/outputRenderer.js';

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
  type DiffCliOptions,
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
