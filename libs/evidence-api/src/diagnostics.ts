/**
 * The findings an API projection reports.
 *
 * Three severities carry three different promises, and the exit status depends
 * on them: an `error` means the design contradicts the model or the contract, a
 * `gap` means the question is still open and a reviewer has to decide, and a
 * `warning` is advice. A gap is not a failure — but it is not a pass either.
 */

export type DiagnosticSeverity = 'error' | 'gap' | 'warning';

/** Which part of the design a gap is asking about. */
export type DiagnosticCategory =
  | 'business'
  | 'design'
  | 'expression'
  | 'coverage';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  targetRef?: string;
  location?: string;
  relatedRefs?: readonly string[];
  /** Stable key a reviewer tracks a gap by until it is resolved. */
  gapKey?: string;
  category?: DiagnosticCategory;
}

export const errorDiagnostic = (
  code: string,
  message: string,
  targetRef?: string,
  location?: string,
  relatedRefs: readonly string[] = [],
): Diagnostic => ({
  code,
  severity: 'error',
  message,
  ...(targetRef === undefined ? {} : { targetRef }),
  ...(location === undefined ? {} : { location }),
  ...(relatedRefs.length === 0 ? {} : { relatedRefs: [...relatedRefs] }),
});

export const gapDiagnostic = (
  code: string,
  gapKey: string,
  category: DiagnosticCategory,
  message: string,
  targetRef?: string,
  relatedRefs: readonly string[] = [],
): Diagnostic => ({
  code,
  severity: 'gap',
  message,
  ...(targetRef === undefined ? {} : { targetRef }),
  ...(relatedRefs.length === 0 ? {} : { relatedRefs: [...relatedRefs] }),
  gapKey,
  category,
});

/** Reports print `relatedRefs` as an array and drop absent optional fields. */
export const diagnosticToJson = (diagnostic: Diagnostic): Record<string, unknown> => {
  const result: Record<string, unknown> = {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    targetRef: diagnostic.targetRef ?? null,
    location: diagnostic.location ?? null,
    relatedRefs: [...(diagnostic.relatedRefs ?? [])],
  };

  if (diagnostic.gapKey !== undefined) {
    result['gapKey'] = diagnostic.gapKey;
  }

  if (diagnostic.category !== undefined) {
    result['category'] = diagnostic.category;
  }

  return result;
};

/** True when any finding blocks delivery. */
export const hasErrors = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'error');

/** True when any question is still open. */
export const hasGaps = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some((diagnostic) => diagnostic.severity === 'gap');

/** Stable text for one finding, used to dedupe without collapsing variants. */
const identityOf = (diagnostic: Diagnostic): string =>
  JSON.stringify(diagnosticToJson(diagnostic));

/**
 * Removes duplicates and orders findings by severity, code, target then message.
 *
 * The order is part of the output: `projection.json` is compared with a saved
 * one, so two runs that found the same things must print them the same way.
 */
export const normalizeDiagnostics = (
  diagnostics: readonly Diagnostic[],
): Diagnostic[] => {
  const unique = new Map<string, Diagnostic>();

  for (const diagnostic of diagnostics) {
    const identity = identityOf(diagnostic);

    if (!unique.has(identity)) {
      unique.set(identity, diagnostic);
    }
  }

  return [...unique.values()].sort((left, right) => {
    for (const difference of [
      left.severity.localeCompare(right.severity),
      left.code.localeCompare(right.code),
      (left.targetRef ?? '').localeCompare(right.targetRef ?? ''),
      left.message.localeCompare(right.message),
    ]) {
      if (difference !== 0) {
        return difference;
      }
    }

    // Findings that agree on every sorted field still have to print in a fixed
    // order, so the identity breaks the tie rather than set iteration order.
    return identityOf(left).localeCompare(identityOf(right));
  });
};
