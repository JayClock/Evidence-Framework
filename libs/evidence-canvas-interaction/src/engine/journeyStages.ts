import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import type {
  BusinessMilestoneStage,
  JourneyNodePlacement,
} from '../layout/types.js';

export const JOURNEY_STAGES: readonly {
  stage: BusinessMilestoneStage;
  label: string;
}[] = [
  { stage: 'sourcing', label: '寻源比选 / Sourcing' },
  { stage: 'agreement', label: '契约缔结 / Agreement' },
  { stage: 'advance', label: '预付备料 / Advance' },
  { stage: 'dispatch', label: '出厂交付 / Dispatch' },
  { stage: 'inspection', label: '检验核验 / Inspection' },
  { stage: 'breach_remedy', label: '违约索赔 / Breach & Remedy' },
  { stage: 'clearing', label: '清结算 / Clearing' },
];

export const isCapability = (entity: EntityAST): boolean =>
  entity.category === 'participant' &&
  entity.kind === 'thing' &&
  entity.domainRole !== undefined;

/** Presentation inference only. References point from a later fact to its basis.
 * Explicit flow semantics win over vocabulary; causal chains work with anonymous
 * ids and labels too. Shared upstream facts are never swallowed by a remedy.
 */
export const inferJourneyPlacements = (
  graph: DomainGraph,
): Map<string, JourneyNodePlacement> => {
  const references = graph
    .relationships()
    .filter((r) => r.kind === 'references');
  const assignments = new Map<string, JourneyNodePlacement>();
  const visiting = new Set<string>();
  const remedySources = new Set(
    references
      .filter((r) => r.flowKind && r.flowKind !== 'primary')
      .map((r) => r.sourceRef),
  );
  const remedyRoles = new Set(
    references
      .filter(
        (r) =>
          r.flowKind === 'escalation' &&
          graph.getEntity(r.targetRef)?.category === 'role',
      )
      .map((r) => r.targetRef),
  );
  const dependencies = (id: string) =>
    references
      .filter((r) => r.sourceRef === id)
      .map((r) => graph.getEntity(r.targetRef))
      .filter((e): e is EntityAST => e !== undefined);
  const infer = (entity: EntityAST): JourneyNodePlacement => {
    const cached = assignments.get(entity.id);
    if (cached) return cached;
    if (visiting.has(entity.id))
      return { stage: 'agreement', corridor: 'primary_track' };
    visiting.add(entity.id);
    let stage: BusinessMilestoneStage = 'agreement';
    let auxiliaryFor: string | undefined;
    let corridor: JourneyNodePlacement['corridor'] = 'primary_track';
    if (entity.category === 'evidence') {
      const bases = dependencies(entity.id).filter(
        (e) => e.category === 'evidence',
      );
      if (entity.kind === 'rfp' || entity.kind === 'proposal')
        stage = 'sourcing';
      else if (entity.kind === 'contract') stage = 'agreement';
      else if (
        remedySources.has(entity.id) ||
        bases.some((e) => infer(e).corridor === 'remedy_corridor')
      ) {
        stage = 'breach_remedy';
        corridor = 'remedy_corridor';
      } else if (entity.kind === 'fulfillment_confirmation') {
        const request = bases.find((e) => e.kind === 'fulfillment_request');
        stage = request ? infer(request).stage : 'dispatch';
      } else if (entity.kind === 'other_evidence') stage = 'inspection';
      else {
        const vocabulary = [
          entity.label,
          ...(entity.attributes?.map((a) => a.name) ?? []),
          graph.getEntity(entity.contextRef)?.label ?? '',
        ].join(' ');
        if (
          /escrow|clearing|release|settlement|托管|清算|放款|尾款/i.test(
            vocabulary,
          )
        )
          stage = 'clearing';
        else if (/inspect|quality|质检|检验|核验/i.test(vocabulary))
          stage = 'inspection';
        else if (/dispatch|delivery|ship|交货|发货|出厂|交付/i.test(vocabulary))
          stage = 'dispatch';
        else {
          // A request following another fulfillment pair advances one milestone.
          const prior = bases
            .filter(
              (e) =>
                e.kind === 'fulfillment_request' ||
                e.kind === 'fulfillment_confirmation',
            )
            .map((e) => infer(e).stage);
          stage =
            prior.includes('inspection') || prior.includes('clearing')
              ? 'clearing'
              : prior.includes('dispatch')
                ? 'inspection'
                : prior.includes('advance')
                  ? 'dispatch'
                  : 'advance';
        }
      }
    } else if (isCapability(entity)) {
      const consumers = references
        .filter((r) => r.targetRef === entity.id)
        .sort(
          (a, b) =>
            Number(b.flowKind === 'breach_compensation') -
              Number(a.flowKind === 'breach_compensation') ||
            a.id.localeCompare(b.id),
        );
      const consumer = consumers
        .map((r) => graph.getEntity(r.sourceRef))
        .find((e) => e !== undefined);
      if (consumer) {
        const placement = infer(consumer);
        stage = placement.stage;
        corridor = placement.corridor;
        auxiliaryFor = consumer.id;
      } else
        stage =
          entity.category === 'participant' && entity.domainRole === 'checker'
            ? 'inspection'
            : 'clearing';
    } else if (entity.category === 'role') {
      if (remedyRoles.has(entity.id)) {
        stage = 'breach_remedy';
        corridor = 'remedy_corridor';
      } else if (entity.kind === 'third_party') stage = 'inspection';
      else if (entity.kind === 'context') stage = 'sourcing';
      else if (entity.kind === 'evidence') stage = 'clearing';
      else if (entity.kind === 'domain') {
        const actor = graph
          .relationships()
          .find((r) => r.kind === 'plays_role' && r.targetRef === entity.id);
        const participant = actor && graph.getEntity(actor.sourceRef);
        if (participant) {
          const placement = infer(participant);
          stage = placement.stage;
          corridor = placement.corridor;
        }
      }
    }
    visiting.delete(entity.id);
    const placement: JourneyNodePlacement = {
      stage,
      corridor,
      ...(entity.category === 'evidence' && entity.responsibleRoleRef
        ? { roleId: entity.responsibleRoleRef }
        : entity.category === 'role'
          ? { roleId: entity.id }
          : {}),
      ...(auxiliaryFor ? { auxiliaryFor } : {}),
    };
    assignments.set(entity.id, placement);
    return placement;
  };
  // Sorting makes geometry independent of source file / collection order.
  for (const entity of [...graph.entities()].sort((a, b) =>
    a.id.localeCompare(b.id),
  ))
    infer(entity);
  return assignments;
};
