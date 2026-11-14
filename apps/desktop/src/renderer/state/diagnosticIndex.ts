import type {
  SensorIssue,
  SensorReport,
  SensorSeverity,
} from '@evidence-poc/evidence-agent/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

export interface DiagnosticStatus {
  severity: SensorSeverity;
  issues: readonly SensorIssue[];
}
export type DiagnosticIndex = ReadonlyMap<string, DiagnosticStatus>;
const priority = { info: 0, warn: 1, block: 2 } as const;
export const diagnosticColor = (severity: SensorSeverity): string =>
  severity === 'block'
    ? '#b42318'
    : severity === 'warn'
      ? '#b76b00'
      : '#2563eb';

/** Explicit references only: a message mentioning an id is not an attachment. */
export const createDiagnosticIndex = (
  report: SensorReport | null,
  document: DomainModelDocument,
): DiagnosticIndex => {
  const known = new Set(
    [...document.entities, ...document.relationships].map((item) => item.id),
  );
  const contexts = new Set(
    document.entities
      .filter((item) => item.category === 'context')
      .map((item) => item.id),
  );
  const index = new Map<string, DiagnosticStatus>();
  for (const issue of report?.issues ?? []) {
    const target = issue.targetNodeId?.split('#')[0];
    const id =
      target && known.has(target)
        ? target
        : issue.contextRef && contexts.has(issue.contextRef)
          ? issue.contextRef
          : undefined;
    if (!id) continue;
    const previous = index.get(id);
    if (previous?.issues.some((item) => item.issueId === issue.issueId))
      continue;
    index.set(id, {
      severity:
        previous && priority[previous.severity] > priority[issue.severity]
          ? previous.severity
          : issue.severity,
      issues: [...(previous?.issues ?? []), issue],
    });
  }
  return index;
};
