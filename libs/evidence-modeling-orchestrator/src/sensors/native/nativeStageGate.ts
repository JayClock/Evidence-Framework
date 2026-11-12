import type { FmCheckReport } from '@evidence-poc/evidence-model-core';

import type { StageGateReport } from '../sensorReport.js';

/**
 * The downstream hand-off gate.
 *
 * The gate consumes a *saved* FM check report, not the live model: it is the
 * moment a scope stops being under discussion and becomes something a contract
 * can be derived from. It refuses any report that is not contract version 5.
 */

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unique = <TItem>(values: readonly TItem[]): TItem[] => [...new Set(values)];

/** Fields the gate copies into its evidence block. */
const EVIDENCE_FIELDS = [
  'checkVersion',
  'consistent',
  'complete',
  'valid',
  'inputChanged',
  'errors',
] as const;

/**
 * Why the saved FM report does not authorise this scope.
 *
 * Each condition is checked separately so a reviewer sees every reason at once
 * instead of fixing one and discovering the next.
 */
export const filterFmCheckErrors = (
  report: unknown,
  scopes: readonly string[],
): { errors: string[]; evidence: Record<string, unknown> } => {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = {};

  if (!isRecord(report)) {
    return { errors: ['FM check report is not a JSON object'], evidence };
  }

  for (const field of EVIDENCE_FIELDS) {
    evidence[field] = report[field];
  }

  if (report['checkVersion'] !== 5) {
    errors.push(
      `FM check contract is not version 5: ${JSON.stringify(report['checkVersion'])}`,
    );
  }
  if (report['consistent'] !== true) {
    errors.push('FM check did not report consistent: true');
  }
  if (report['complete'] !== true) {
    errors.push('FM check did not report complete: true for the requested scope');
  }
  if (report['valid'] !== true) {
    errors.push('FM check did not report valid: true');
  }
  if (report['inputChanged'] !== false) {
    errors.push('FM inputs changed after the check; the evidence is stale');
  }

  const reported = Array.isArray(report['errors']) ? report['errors'] : [];

  if (reported.length > 0) {
    errors.push(`FM check reported ${reported.length} error(s)`);
  }

  const gaps = Array.isArray(report['gaps']) ? report['gaps'] : [];

  if (gaps.length > 0) {
    errors.push(`FM check reported ${gaps.length} gap(s)`);
  }

  const covered = new Set(
    Array.isArray(report['scopeRefs'])
      ? report['scopeRefs'].filter((ref): ref is string => typeof ref === 'string')
      : [],
  );

  evidence['scopeRefs'] = [...covered].sort();

  for (const scope of scopes) {
    if (!covered.has(scope)) {
      errors.push(`FM check does not cover scope '${scope}'`);
    }
  }

  return { errors, evidence };
};

export interface StageGateInput {
  target: 'api' | 'visualization';
  /** The saved `check_fm` report the gate consumes. */
  fmCheck: unknown;
  scopes: readonly string[];
}

/** Decides whether a checked scope may be handed to the next stage. */
export const checkNativeStageGate = (input: StageGateInput): StageGateReport => {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = { fmCheck: {} };

  if (input.scopes.length === 0) {
    errors.push('no scope supplied; downstream never consumes an unbounded model');
  }

  const fm = filterFmCheckErrors(input.fmCheck, input.scopes);
  errors.push(...fm.errors);
  evidence['fmCheck'] = fm.evidence;

  return {
    passed: errors.length === 0,
    target: input.target,
    scopeRefs: [...input.scopes],
    errors: unique(errors),
  };
};

/** True when the report proves the scope it was produced for. */
export const isGateReadyReport = (
  report: FmCheckReport,
  scopes: readonly string[],
): boolean => filterFmCheckErrors(report, scopes).errors.length === 0;
