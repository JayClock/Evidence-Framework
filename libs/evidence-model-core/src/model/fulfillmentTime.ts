import {
  timeAttributeOf,
  type EvidenceEntityAST,
} from '@evidence-poc/evidence-schema';

export const completionExpressionFor = (
  request: Pick<EvidenceEntityAST, 'attributes'>,
  confirmation: Pick<EvidenceEntityAST, 'attributes'>,
): string | undefined => {
  const start = timeAttributeOf(request, 'start');
  const deadline = timeAttributeOf(request, 'deadline');
  const occurrence = timeAttributeOf(confirmation, 'occurrence');
  return start && deadline && occurrence
    ? `confirmations.exists(c, c.${occurrence.name} >= request.${start.name} && c.${occurrence.name} <= request.${deadline.name})`
    : undefined;
};

export const timeoutExpressionFor = (
  request: Pick<EvidenceEntityAST, 'attributes'>,
  confirmation: Pick<EvidenceEntityAST, 'attributes'>,
): string | undefined => {
  const start = timeAttributeOf(request, 'start');
  const deadline = timeAttributeOf(request, 'deadline');
  const occurrence = timeAttributeOf(confirmation, 'occurrence');
  return start && deadline && occurrence
    ? `now > request.${deadline.name} && !confirmations.exists(c, c.${occurrence.name} >= request.${start.name} && c.${occurrence.name} <= request.${deadline.name})`
    : undefined;
};
