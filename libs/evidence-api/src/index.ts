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
  partyRolesPlayedByParticipants,
  type FmIndex,
  type FmSnapshot,
  type LoadFmResult,
} from './adapter/fmAdapter.js';

export {
  inspectSummary,
  type InspectEntry,
  type InspectSummary,
} from './inspect.js';

export { API_SCHEMA } from './schemas/apiSchema.js';
export { API_PROJECTION_SCHEMA } from './schemas/apiProjectionSchema.js';
