import type { SensorOutcome } from './sensorsEngine.js';

/**
 * Shadow-mode parity between the Python sensors and the native ones.
 *
 * A migration that silently changes a verdict is worse than no migration, so
 * while both engines exist they run together and any difference is reported as
 * a finding rather than swallowed. The comparison is deliberately narrow: the
 * fields that decide a verdict, not the prose of an error message.
 */

/** Report fields that change a decision, in the order a reviewer reads them. */
const FM_CHECK_FIELDS = [
  'checkVersion',
  'valid',
  'consistent',
  'complete',
  'inputChanged',
  'modelDigest',
  'scopeRefs',
  'gaps',
  'errors',
  'scenarioRequirement',
  'scenarioCount',
  'executedScenarioCount',
  'simulationPassed',
] as const;

/**
 * Canonical text for a value, with object keys sorted.
 *
 * Two reports that agree but build their records in a different order are the
 * same verdict; reporting that as drift would train a reviewer to ignore it.
 */
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonical(item));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }

  return value;
};

const traceOf = (value: unknown): string =>
  value === undefined ? 'undefined' : JSON.stringify(canonical(value));

const readField = (report: unknown, field: string): unknown =>
  typeof report === 'object' && report !== null
    ? (report as Record<string, unknown>)[field]
    : undefined;

const pathsOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === 'object' && item !== null
            ? String((item as Record<string, unknown>)['path'] ?? '')
            : '',
        )
        .sort()
    : [];

/**
 * Names every field the two engines disagree about.
 *
 * An empty list means the native engine reproduces the Python verdict for this
 * model; a non-empty one is a bug report with the exact field to look at.
 */
export const compareSensorOutcomes = (
  python: SensorOutcome,
  native: SensorOutcome,
): string[] => {
  const differences: string[] = [];

  const comparePair = (label: string, left: unknown, right: unknown): void => {
    const leftText = traceOf(left);
    const rightText = traceOf(right);

    if (leftText !== rightText) {
      differences.push(`${label}: python=${leftText} native=${rightText}`);
    }
  };

  for (const field of FM_CHECK_FIELDS) {
    comparePair(
      `check_fm.${field}`,
      readField(python.fmCheck, field),
      readField(native.fmCheck, field),
    );
  }

  comparePair(
    'audit_key_data.keyDataCount',
    readField(python.keyData, 'keyDataCount'),
    readField(native.keyData, 'keyDataCount'),
  );
  comparePair(
    'audit_key_data.counts',
    readField(python.keyData, 'counts'),
    readField(native.keyData, 'counts'),
  );
  comparePair(
    'audit_key_data.needsDecision',
    pathsOf(readField(python.keyData, 'needsDecision')),
    pathsOf(readField(native.keyData, 'needsDecision')),
  );
  comparePair(
    'audit_key_data.derived',
    pathsOf(readField(python.keyData, 'derived')),
    pathsOf(readField(native.keyData, 'derived')),
  );

  comparePair(
    'check_interview_trace.valid',
    python.traceCheck?.valid,
    native.traceCheck?.valid,
  );
  comparePair(
    'check_interview_trace.errors',
    python.traceCheck?.errors,
    native.traceCheck?.errors,
  );

  return differences;
};
