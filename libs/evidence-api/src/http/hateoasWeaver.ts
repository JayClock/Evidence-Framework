import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { DeliveryRoute } from '../delivery/routes.js';
import type { ApiJourneyStep } from '../types.js';

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
  const add = (
    source: DeliveryRoute,
    target: DeliveryRoute,
    rel: string,
    href: string,
  ) => {
    const link = {
      sourceRouteId: source.id,
      targetRouteId: target.id,
      rel,
      href,
      method: target.method,
      templated: href.includes('{'),
    };
    links.set(`${source.id}\0${rel}\0${target.id}`, link);
  };
  for (const route of routes) add(route, route, 'self', route.itemPath);
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
    const targets = routes.filter(
      (route) => route.entityRef === dependent.id && route.method === 'POST',
    );
    for (const source of routes.filter(
      (route) => route.entityRef === prerequisite.id,
    )) {
      for (const target of targets)
        add(source, target, `next:${target.entityRef}`, target.path);
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
      route.allowedPartyRoleRefs.map((roleRef) => ({
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
