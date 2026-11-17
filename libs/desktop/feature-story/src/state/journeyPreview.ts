import {
  evaluateRuleOnExample,
  type FlowScenarioTrace,
  type FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import type {
  DomainModelDocument,
  RelationshipFlowKind,
} from '@evidence-poc/evidence-schema';

export interface JourneyRulePreview {
  id: string;
  label: string;
  kind: string;
  value?: unknown;
  error?: string;
}

/** A local, read-only rehearsal of the visible prefix, not HTTP acceptance or a
 * persisted simulation. No future/cross-flow examples may satisfy a binding.
 * Missing bindings remain unknown; malformed/evaluation failures stay visible.
 */
export const previewJourneyStep = (
  document: DomainModelDocument,
  flow: FlowScenarioTrace,
  step: FlowStepTrace,
) => {
  const prefix = flow.steps.filter((s) => s.sequence <= step.sequence);
  const values = new Map(prefix.map((s) => [s.entityId, s.values]));
  const rules: JourneyRulePreview[] = [];
  for (const rule of document.rules) {
    const bindings: Record<string, unknown> = {};
    let complete = true;
    for (const [alias, binding] of Object.entries(rule.bindings)) {
      if ('type' in binding) {
        if (
          (alias === 'asOf' || alias === 'now') &&
          binding.type === 'timestamp'
        )
          bindings[alias] = step.asOf;
        else complete = false;
        continue;
      }
      const declared =
        document.entities
          .find((e) => e.id === binding.ref)
          ?.examples?.filter((e) => !e.test) ?? [];
      const value =
        values.get(binding.ref) ??
        (declared.length === 1 ? declared[0].value : undefined);
      if (binding.cardinality === 'many') {
        const list = prefix
          .filter((s) => s.entityId === binding.ref)
          .map((s) => s.values);
        if (list.length) bindings[alias] = list;
        else if (value) bindings[alias] = [value];
        else complete = false;
      } else if (value) bindings[alias] = value;
      else complete = false;
    }
    if (!complete) continue;
    try {
      rules.push({
        id: rule.id,
        label: rule.label,
        kind: rule.kind,
        value: evaluateRuleOnExample(document, rule, {
          bindings,
          asOf: step.asOf,
        }),
      });
    } catch (error) {
      rules.push({
        id: rule.id,
        label: rule.label,
        kind: rule.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const active = document.entities.find((e) => e.id === step.entityId);
  const references = document.relationships.filter(
    (r) => r.kind === 'references',
  );
  const branches = references.filter(
    (r) => r.flowKind && r.flowKind !== 'primary',
  );
  const explicit =
    active?.kind === 'contract'
      ? []
      : branches.filter((r) => r.sourceRef === step.entityId);
  const triggeredRules = document.rules.filter(
    (r) =>
      r.kind === 'breach' &&
      rules.some((p) => p.id === r.id && p.value === true) &&
      (explicit.length > 0 ||
        Object.values(r.bindings).some(
          (b) => 'ref' in b && b.ref === step.entityId,
        )),
  );
  const triggeredRefs = new Set(
    triggeredRules.flatMap((r) =>
      Object.values(r.bindings).flatMap((b) => ('ref' in b ? [b.ref] : [])),
    ),
  );
  const flowKind: RelationshipFlowKind =
    explicit.some((r) => r.flowKind === 'escalation') ||
    branches.some(
      (r) => r.flowKind === 'escalation' && triggeredRefs.has(r.targetRef),
    )
      ? 'escalation'
      : explicit.length || triggeredRules.length
        ? 'breach_compensation'
        : 'primary';
  const entryIds = branches
    .filter(
      (r) =>
        r.flowKind === flowKind &&
        triggeredRefs.has(r.targetRef) &&
        flow.steps.some((s) => s.entityId === r.sourceRef),
    )
    .map((r) => r.sourceRef);
  const related = new Set(
    [step.actingRoleRef, step.responsibleRoleRef, ...entryIds].filter(
      (id): id is string => id !== undefined,
    ),
  );
  for (const r of document.relationships) {
    if (
      (r.kind === 'plays_role' &&
        (r.sourceRef === step.entityId ||
          prefix.some(
            (s) =>
              s.entityId === r.sourceRef &&
              step.basedOn.includes(`${s.entityId}#${s.exampleLabel}`),
          ))) ||
      (r.kind === 'references' &&
        (r.sourceRef === step.entityId || entryIds.includes(r.sourceRef)) &&
        document.entities.some(
          (e) =>
            e.id === r.targetRef &&
            ((e.category === 'participant' && e.domainRole) ||
              e.category === 'role'),
        ))
    )
      related.add(r.targetRef);
  }
  const activeRelationshipIds = references
    .filter(
      (r) =>
        (r.sourceRef === step.entityId || entryIds.includes(r.sourceRef)) &&
        (r.flowKind === undefined ||
          r.flowKind === 'primary' ||
          r.flowKind === flowKind),
    )
    .map((r) => r.id);
  return {
    flowKind,
    triggeredRuleIds: triggeredRules.map((r) => r.id),
    relatedEntityIds: [...related],
    activeRelationshipIds,
    rules,
  };
};
