import type { FmCheckReport } from '@evidence-poc/evidence-model-core';

import type { StageGateReport } from '../sensorReport.js';

/**
 * The downstream hand-off gate, without Python.
 *
 * The gate consumes a *saved* FM check report and the recorded human closure,
 * not the live model: it is the moment a scope stops being under interview and
 * becomes something a contract can be derived from. This ports
 * `check_stage_gate.py`, including its refusal of anything but report version 5.
 */

type JsonObject = Record<string, unknown>;

const CLOSURE_PREFIXES = ['范围结束确认：', '全局追责结束确认：'] as const;

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

/**
 * Why the trace does not record a human closure for this scope.
 *
 * A closure is a confirmed fact with a fixed prefix; anything else is a
 * conclusion the machine reached on its own, which the gate does not accept.
 */
export const closureErrors = (
  trace: unknown,
  scopes: readonly string[],
): { errors: string[]; evidence: Record<string, unknown> } => {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = { scopes: {} };

  if (!isRecord(trace)) {
    return { errors: ['Interview trace is not a JSON object'], evidence };
  }

  const records = Array.isArray(trace['traces']) ? trace['traces'] : [];

  evidence['traceCount'] = records.length;

  const recorded = new Map<string, Set<string>>(
    scopes.map((scope) => [scope, new Set<string>()] as const),
  );

  for (const record of records) {
    if (!isRecord(record)) {
      continue;
    }

    const userInput = isRecord(record['userInput']) ? record['userInput'] : {};
    const facts = Array.isArray(userInput['confirmedFacts'])
      ? userInput['confirmedFacts']
      : [];

    for (const scope of scopes) {
      for (const fact of facts) {
        if (typeof fact !== 'string') {
          continue;
        }

        if (
          CLOSURE_PREFIXES.some((prefix) => fact.trim() === `${prefix}${scope}`)
        ) {
          recorded
            .get(scope)
            ?.add(typeof record['traceId'] === 'string' ? record['traceId'] : '<unknown>');
        }
      }
    }
  }

  const perScope: Record<string, string[]> = {};

  for (const scope of scopes) {
    const traceIds = [...(recorded.get(scope) ?? [])].sort();
    perScope[scope] = traceIds;

    if (traceIds.length === 0) {
      errors.push(
        `no recorded human closure for scope '${scope}'; expected a confirmed fact '${CLOSURE_PREFIXES[0]}${scope}'`,
      );
    }
  }

  evidence['scopes'] = perScope;

  return { errors, evidence };
};

export interface StageGateInput {
  target: 'api' | 'visualization';
  /** The saved `check_fm` report the gate consumes. */
  fmCheck: unknown;
  /** The saved interview trace holding the recorded closure. */
  trace: unknown;
  scopes: readonly string[];
}

/**
 * Decides whether a checked scope may be handed to the next stage.
 *
 * The gate proves scope completeness and recorded closure; authorisation and
 * business approval stay human statements, which is why the report always
 * carries them as limitations.
 */
export const checkNativeStageGate = (input: StageGateInput): StageGateReport => {
  const errors: string[] = [];
  const evidence: Record<string, unknown> = { fmCheck: {}, trace: {} };

  if (input.scopes.length === 0) {
    errors.push('no scope supplied; downstream never consumes an unbounded model');
  }

  const fm = filterFmCheckErrors(input.fmCheck, input.scopes);
  errors.push(...fm.errors);
  evidence['fmCheck'] = fm.evidence;

  const trace = closureErrors(input.trace, input.scopes);
  errors.push(...trace.errors);
  evidence['trace'] = trace.evidence;

  return {
    passed: errors.length === 0,
    target: input.target,
    scopeRefs: [...input.scopes],
    errors: unique(errors),
    limitations: [
      'downstream authorization and business approval remain human statements; this gate only proves scope completeness and recorded closure',
    ],
  };
};

/** True when the report proves the scope it was produced for. */
export const isGateReadyReport = (
  report: FmCheckReport,
  scopes: readonly string[],
): boolean => filterFmCheckErrors(report, scopes).errors.length === 0;
