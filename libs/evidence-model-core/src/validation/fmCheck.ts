import {
  strictValidateDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { completenessGaps, selectScope, ScopeSelectionError } from './scope.js';
import { digestOf } from './modelDigest.js';
import { analyzeTraceability } from './traceability.js';
import { auditDomainComponentNaming, type ModelAdvisory } from './lintRules.js';

/** Breaking report contract: static model checks never claim HTTP acceptance. */
export const FM_CHECK_VERSION = 6;
export interface FmCheckReport {
  checkVersion: number;
  valid: boolean;
  consistent: boolean;
  complete: boolean | null;
  scopeRefs: readonly string[];
  contextRefs: readonly string[];
  gaps: readonly string[];
  humanConfirmation: 'not-asserted-by-machine';
  modelDigest: string;
  inputChanged: boolean;
  modelValidated: boolean;
  /** Declared examples, not executed tests. Export/run standard scripts separately. */
  testExampleCount: number;
  errors: readonly string[];
  advisories: readonly ModelAdvisory[];
}
export interface FmCheckRequest {
  model: DomainModelDocument;
  sourceIssues?: readonly string[];
  scopeRefs?: readonly string[];
  modelDigest?: string;
  currentDigest?: () => string;
}
export interface FmCheckOutcome {
  report: FmCheckReport;
  selected: DomainModelDocument | null;
}
const dedupe = (messages: readonly string[]): string[] => [
  ...new Set(messages),
];

/** Consistency and responsibility completeness only; not a backend test runner. */
export const buildFmCheckReport = (request: FmCheckRequest): FmCheckOutcome => {
  const { model, scopeRefs } = request;
  const digest = request.modelDigest ?? digestOf(model);
  const staticErrors = dedupe([
    ...(request.sourceIssues ?? []),
    ...strictValidateDomainModel(model).issues.map(
      (issue) => `${issue.path}: ${issue.message}`,
    ),
    ...analyzeTraceability(model).errors,
  ]);
  const modelValidated = staticErrors.length === 0;
  let selected: DomainModelDocument | null = null;
  if (scopeRefs !== undefined && modelValidated) {
    try {
      selected = selectScope(model, scopeRefs);
    } catch (error) {
      if (!(error instanceof ScopeSelectionError)) throw error;
      staticErrors.push(error.message);
    }
  }
  const target = selected ?? model;
  const gaps = modelValidated ? completenessGaps(target, staticErrors) : [];
  const inputChanged = (request.currentDigest?.() ?? digest) !== digest;
  const errors = dedupe([
    ...staticErrors,
    ...(inputChanged ? ['Model inputs changed during validation'] : []),
  ]);
  const consistent = staticErrors.length === 0 && !inputChanged;
  const complete =
    scopeRefs === undefined ? null : gaps.length === 0 && consistent;
  return {
    report: {
      checkVersion: FM_CHECK_VERSION,
      valid: errors.length === 0 && complete !== false,
      consistent,
      complete,
      scopeRefs: scopeRefs === undefined ? [] : [...scopeRefs],
      contextRefs:
        selected?.entities
          .filter((entity) => entity.category === 'context')
          .map((entity) => entity.id)
          .sort() ?? [],
      gaps: dedupe(gaps),
      humanConfirmation: 'not-asserted-by-machine',
      modelDigest: digest,
      inputChanged,
      modelValidated,
      testExampleCount: target.entities.reduce(
        (total, entity) =>
          total +
          (entity.examples ?? []).filter(
            (example) => example.test !== undefined,
          ).length,
        0,
      ),
      errors,
      advisories: auditDomainComponentNaming(model),
    },
    selected,
  };
};
