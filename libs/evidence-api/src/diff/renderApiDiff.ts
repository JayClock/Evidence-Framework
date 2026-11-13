import type { ApiModelDiffResult } from './apiDiff.js';

export const renderApiDiff = (
  diff: ApiModelDiffResult,
  color = false,
): string => {
  const paint = (text: string, code: number) =>
    color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const lines = [
    `API ${diff.baseModelId}: +${diff.summary.routesAdded} -${diff.summary.routesRemoved} ~${diff.summary.routesModified}`,
    `Breaking changes: ${diff.summary.breakingChangeCount}`,
  ];
  for (const route of diff.routes) {
    const marker =
      route.changeType === 'added'
        ? '+'
        : route.changeType === 'removed'
          ? '-'
          : '~';
    lines.push(
      paint(
        `${marker} ${route.method.padEnd(4)} ${route.path}${route.breaking ? ' [BREAKING]' : ''}`,
        route.breaking ? 31 : marker === '+' ? 32 : 33,
      ),
    );
    for (const field of route.fieldDiffs)
      lines.push(
        `    ${field.changeType} ${field.name}${field.shifted === undefined ? '' : ` (${field.shifted})`}`,
      );
    for (const change of route.breakingChanges)
      lines.push(`    ! ${change.kind}: ${change.description}`);
  }
  for (const [side, diagnostics] of Object.entries(diff.diagnostics))
    for (const issue of diagnostics)
      lines.push(`! ${side} ${issue.severity} ${issue.code}: ${issue.message}`);
  if (diff.routes.length === 0) lines.push('No API changes.');
  return `${lines.join('\n')}\n`;
};
