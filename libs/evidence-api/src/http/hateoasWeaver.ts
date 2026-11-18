import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { DeliveryRoute } from '../delivery/routes.js';
import type { ApiJourneyStep } from '../types.js';
import { allowedCallerRoleRefs } from '../delivery/addressing.js';

export interface HypermediaLink {
  sourceRouteId: string;
  targetRouteId: string;
  rel: string;
  href: string;
  method: DeliveryRoute['method'];
  templated: boolean;
}

/** References describe possible navigation, never runtime readiness or permissions. */
export const weaveHypermedia = (
  document: DomainModelDocument,
  routes: readonly DeliveryRoute[],
): HypermediaLink[] => {
  const links = new Map<string, HypermediaLink>();
  const byEntity = new Map<string, DeliveryRoute[]>();
  for (const route of routes) {
    const group = byEntity.get(route.entityRef) ?? [];
    group.push(route);
    byEntity.set(route.entityRef, group);
  }
  const forEntity = (ref: string) => byEntity.get(ref) ?? [];
  const primaryOf = (route: DeliveryRoute) =>
    forEntity(route.entityRef).find(
      (candidate) =>
        candidate.method === 'GET' &&
        candidate.responseShape === 'item' &&
        candidate.path === route.itemPath,
    );
  const add = (source: DeliveryRoute, target: DeliveryRoute, rel: string) => {
    const link = {
      sourceRouteId: source.id,
      targetRouteId: target.id,
      rel,
      href: target.path,
      method: target.method,
      templated: target.path.includes('{'),
    };
    links.set(`${source.id}\0${rel}\0${target.id}`, link);
  };
  for (const route of routes) {
    const target =
      route.responseShape === 'collection' ? route : primaryOf(route);
    if (target !== undefined) add(route, target, 'self');
  }
  const entities = new Map(
    document.entities.map((entity) => [entity.id, entity]),
  );
  for (const edge of document.relationships) {
    if (edge.kind !== 'references') continue;
    const dependent = entities.get(edge.sourceRef);
    const prerequisite = entities.get(edge.targetRef);
    if (
      dependent?.category !== 'evidence' ||
      prerequisite?.category !== 'evidence'
    )
      continue;
    const sources = forEntity(prerequisite.id);
    const dependentRoutes = forEntity(dependent.id);
    const targets = dependentRoutes.filter((route) => {
      if (route.method !== 'POST') return false;
      if (dependent.kind === 'contract' && prerequisite.kind === 'proposal') {
        // Overlay paths are presentation; the signing entrance still belongs to this proposal.
        return (
          route.id === `route.sign-from-${prerequisite.id}.${dependent.id}`
        );
      }
      return !route.id.startsWith('route.sign-from-');
    });
    for (const source of sources) {
      for (const target of targets) add(source, target, `next:${dependent.id}`);
    }
    if (
      dependent.kind === 'fulfillment_confirmation' &&
      prerequisite.kind === 'fulfillment_request'
    ) {
      const trace = dependentRoutes.find(
        (route) =>
          route.method === 'GET' &&
          route.responseShape === 'collection' &&
          route.requestRef === prerequisite.id,
      );
      const request = sources.find(
        (route) => route.method === 'GET' && route.responseShape === 'item',
      );
      if (trace !== undefined) {
        for (const source of sources.filter(
          (route) => route.responseShape === 'item',
        ))
          add(source, trace, `confirmations:${dependent.id}`);
      }
      if (request !== undefined) {
        for (const source of dependentRoutes.filter(
          (route) => route.responseShape === 'item',
        ))
          add(source, request, `request:${prerequisite.id}`);
        if (
          prerequisite.asyncAcceptance === true &&
          prerequisite.contextRef === dependent.contextRef
        ) {
          const primary = dependentRoutes.find(
            (route) =>
              route.method === 'GET' &&
              route.responseShape === 'item' &&
              route.path === route.itemPath,
          );
          if (primary !== undefined)
            add(request, primary, `result:${dependent.id}`);
        }
      }
    }
  }
  return [...links.values()].sort((a, b) =>
    `${a.sourceRouteId}\0${a.rel}\0${a.targetRouteId}`.localeCompare(
      `${b.sourceRouteId}\0${b.rel}\0${b.targetRouteId}`,
    ),
  );
};

export const halLinksFor = (
  links: readonly HypermediaLink[],
  routeId: string,
): Record<string, unknown> =>
  Object.fromEntries(
    links
      .filter((link) => link.sourceRouteId === routeId)
      .map((link) => [
        link.rel,
        {
          href: link.href,
          templated: link.templated,
          ...(link.rel === 'self' ? {} : { method: link.method }),
        },
      ]),
  );

/** A graph of possible steps; branches and cycles remain graphs, not an invented sequence. */
export const deriveJourneys = (
  routes: readonly DeliveryRoute[],
  links: readonly HypermediaLink[],
): ApiJourneyStep[] => {
  const steps = routes
    .filter((route) => route.method === 'POST')
    .flatMap((route) =>
      allowedCallerRoleRefs(route).map((roleRef) => ({
        id: `step.${route.id}.${roleRef}`,
        roleRef,
        routeId: route.id,
        method: route.method,
        path: route.path,
        purpose: route.purpose,
        nextPossibleSteps: [] as string[],
      })),
    );
  for (const step of steps) {
    const next = new Set(
      links
        .filter(
          (link) => link.sourceRouteId === step.routeId && link.rel !== 'self',
        )
        .map((link) => link.targetRouteId),
    );
    step.nextPossibleSteps = steps
      .filter((candidate) => next.has(candidate.routeId))
      .map((candidate) => candidate.id)
      .sort();
  }
  return steps.sort((a, b) => a.id.localeCompare(b.id));
};
