import {
  furthestLifecycleStage,
  lifecycleStageOf,
  lifecycleStageOfContext,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { JourneyNodePlacement } from '../layout/types.js';

export const inferJourneyPlacements = (
  graph: DomainGraph,
): Map<string, JourneyNodePlacement> => {
  const entities = graph.entities();
  const members = new Map<string, EntityAST[]>();
  for (const entity of entities) {
    if (!('contextRef' in entity) || entity.contextRef === undefined) continue;
    const list = members.get(entity.contextRef) ?? [];
    list.push(entity);
    members.set(entity.contextRef, list);
  }

  const remedy = new Set<string>();
  const downstream = new Map<string, string[]>();
  for (const edge of graph.relationships()) {
    if (edge.kind !== 'references') continue;
    if (
      edge.flowKind === 'breach_compensation' ||
      edge.flowKind === 'escalation'
    )
      remedy.add(edge.sourceRef);
    if (
      edge.flowKind === 'escalation' &&
      graph.getEntity(edge.targetRef)?.category === 'role'
    )
      remedy.add(edge.targetRef);
    const source = graph.getEntity(edge.sourceRef);
    const target = graph.getEntity(edge.targetRef);
    if (
      source?.category !== 'evidence' ||
      target?.category !== 'evidence' ||
      source.contextRef !== target.contextRef
    )
      continue;
    const neighbors = downstream.get(edge.targetRef) ?? [];
    neighbors.push(edge.sourceRef);
    downstream.set(edge.targetRef, neighbors);
  }
  for (const id of remedy) {
    for (const dependent of downstream.get(id) ?? []) remedy.add(dependent);
  }

  return new Map(
    entities.map((entity) => {
      const context =
        'contextRef' in entity && entity.contextRef !== undefined
          ? graph.getEntity(entity.contextRef)
          : undefined;
      const stage =
        entity.category === 'evidence'
          ? (entity.stage ??
            lifecycleStageOf(entity) ??
            (context?.category === 'context' && context.kind === 'pre_contract'
              ? ((members.get(context.id) ?? []).reduce<
                  ReturnType<typeof lifecycleStageOf>
                >(
                  (latest, member) =>
                    furthestLifecycleStage(latest, lifecycleStageOf(member)),
                  null,
                ) ?? 'rfp')
              : 'fulfillment'))
          : entity.category === 'context'
            ? lifecycleStageOfContext(entity, members.get(entity.id))
            : entity.category === 'role' &&
                context?.category === 'context' &&
                context.kind === 'contract'
              ? 'contract'
              : 'fulfillment';
      return [
        entity.id,
        {
          stage,
          corridor: remedy.has(entity.id) ? 'remedy_corridor' : 'primary_track',
          ...(entity.category === 'evidence' && entity.responsibleRoleRef
            ? { roleId: entity.responsibleRoleRef }
            : entity.category === 'role'
              ? { roleId: entity.id }
              : {}),
        },
      ];
    }),
  );
};
