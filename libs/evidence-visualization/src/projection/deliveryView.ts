import type { DeliveryBundle } from '@evidence-poc/evidence-api';

import type { WorkbenchDelivery } from './workbenchProjection.js';

/**
 * Reducing a delivery projection to what the review page shows.
 *
 * The page is read offline by people who did not run the projector, so it keeps
 * the boundaries and the crossing points and drops digests, file paths and the
 * whole OpenAPI document. Routes are flattened to one line each because the page
 * answers "which service answers this business moment", not "what is the schema".
 */
export const deliveryViewOf = (delivery: DeliveryBundle): WorkbenchDelivery => {
  const routesByService = new Map<
    string,
    { method: string; path: string; summary: string }[]
  >();

  for (const route of delivery.routes) {
    const bucket = routesByService.get(route.serviceId) ?? [];
    bucket.push({
      method: route.method,
      path: route.path,
      summary: route.summary,
    });
    routesByService.set(route.serviceId, bucket);
  }

  return {
    services: delivery.services.map((service) => ({
      id: service.id,
      name: service.name,
      kind: service.kind,
      lane: service.lane,
      contextRef: service.contextRef,
      supplies: [...service.supplies],
      consumes: [...service.consumes],
      notes: service.notes,
      routes: [...(routesByService.get(service.id) ?? [])].sort((left, right) =>
        `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`),
      ),
    })),
    links: delivery.links.map((link) => ({
      id: link.id,
      from: link.from,
      to: link.to,
      kind: link.kind,
      mode: link.mode,
      label: link.label,
      viaRef: link.viaRef,
    })),
    limitations: [...delivery.limitations],
  };
};
