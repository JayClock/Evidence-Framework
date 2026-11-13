import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { DeliveryRoute } from './routes.js';

export type UnaddressedRoute = Omit<
  DeliveryRoute,
  | 'shape'
  | 'itemPath'
  | 'allowedPartyRoleRefs'
  | 'exposure'
  | 'outputFields'
  | 'rules'
>;

/** Read the child endpoint regardless of the relationship's arrow direction. */
export const childShape = (
  graph: DomainGraph,
  parent: string,
  child: string,
): 'singleton' | 'collection' => {
  const maxima = graph.relationships().flatMap((edge) => {
    if (edge.kind !== 'references') return [];
    if (edge.sourceRef === child && edge.targetRef === parent)
      return edge.sourceCardinality === undefined
        ? []
        : [edge.sourceCardinality.max];
    if (edge.targetRef === child && edge.sourceRef === parent)
      return edge.targetCardinality === undefined
        ? []
        : [edge.targetCardinality.max];
    return [];
  });
  // Unknown or contradictory quantities must never imply uniqueness.
  return maxima.length > 0 && maxima.every((max) => max === 1)
    ? 'singleton'
    : 'collection';
};

export const callerRoles = (
  graph: DomainGraph,
  route: UnaddressedRoute,
): string[] => {
  const entity = graph.getEntity(route.entityRef);
  const context = graph.getEntity(route.contextRef);
  const contract =
    graph.rootContractOf(route.contextRef) ??
    (context?.category === 'context' && context.parentContextRef !== undefined
      ? graph.rootContractOf(context.parentContextRef)
      : undefined);
  const bound = contract?.roleRefs ?? [];
  const candidates =
    entity?.category === 'evidence' && entity.responsibleRoleRef !== undefined
      ? bound.filter((ref) => ref === entity.responsibleRoleRef)
      : bound;
  const played = new Set(
    graph
      .relationships()
      .filter((edge) => {
        const player = graph.getEntity(edge.sourceRef);
        return (
          edge.kind === 'plays_role' &&
          player?.category === 'participant' &&
          player.kind === 'party'
        );
      })
      .map((edge) => edge.targetRef),
  );
  return [...new Set(candidates)]
    .filter((ref) => {
      const role = graph.getEntity(ref);
      return (
        played.has(ref) && role?.category === 'role' && role.kind === 'party'
      );
    })
    .sort();
};
