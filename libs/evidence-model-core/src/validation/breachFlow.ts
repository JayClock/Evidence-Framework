import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** Explicit dependency direction: compensation request / escalation record -> breached request.
 * Labels are never used to infer legal meaning. This proves structure, not legal finality.
 */
export const breachFlowGaps = (model: DomainModelDocument): string[] => {
  const entities = new Map(model.entities.map((entity) => [entity.id, entity]));
  const gaps: string[] = [];
  const compensation = new Map<string, string[]>();
  for (const edge of model.relationships) {
    if (edge.flowKind === undefined || edge.flowKind === 'primary') continue;
    const source = entities.get(edge.sourceRef);
    const target = entities.get(edge.targetRef);
    if (
      edge.kind !== 'references' ||
      target?.category !== 'evidence' ||
      target.kind !== 'fulfillment_request'
    ) {
      gaps.push(
        `${edge.id}: breach flow must reference the breached Fulfillment Request`,
      );
      continue;
    }
    if (edge.flowKind === 'breach_compensation') {
      if (
        source?.category !== 'evidence' ||
        source.kind !== 'fulfillment_request'
      ) {
        gaps.push(
          `${edge.id}: compensation source must be a new Fulfillment Request`,
        );
        continue;
      }
      const targets = compensation.get(source.id) ?? [];
      compensation.set(source.id, [...targets, target.id]);
      // The existing completeness checker also checks every request for an
      // associated confirmation/proof. A flow annotation cannot waive that gate.
    } else if (
      source?.category !== 'evidence' ||
      source.kind !== 'other_evidence' ||
      source.responsibleRoleRef === undefined ||
      !edge.notes?.trim()
    ) {
      gaps.push(
        `${edge.id}: escalation requires an Evidence record, responsible role and notes naming the hand-off endpoint`,
      );
    }
  }
  const done = new Set<string>();
  const active = new Set<string>();
  const walk = (id: string): boolean => {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    const cycle = (compensation.get(id) ?? []).some(walk);
    active.delete(id);
    done.add(id);
    return cycle;
  };
  for (const id of compensation.keys()) {
    if (walk(id)) gaps.push(`${id}: compensation chain must not be cyclic`);
  }
  return gaps;
};
