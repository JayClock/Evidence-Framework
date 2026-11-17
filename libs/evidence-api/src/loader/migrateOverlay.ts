import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { buildDeliveryRoutes, type DeliveryRoute } from '../delivery/routes.js';
import { rawSegmentOf } from '../delivery/segments.js';
import {
  loadDesign,
  type DesignDocument,
  type RouteOverlay,
  type JourneyOverlay,
} from './apiLoader.js';

/** The v5 default surface is recognized exactly; custom aliases keep their chosen spelling. */
const legacyPath = (
  model: DomainModelDocument,
  route: DeliveryRoute,
  oldId: string,
): string => {
  const lane = '/' + rawSegmentOf(route.contextRef);
  const contract =
    route.contractRef === null
      ? lane
      : lane + '/' + rawSegmentOf(route.contractRef);
  if (route.purpose === 'sign') return contract;
  if (route.purpose === 'open')
    return lane + '/' + rawSegmentOf(route.entityRef);
  if (route.purpose === 'propose' || route.entityRef.startsWith('rfp.')) {
    const rfp = model.relationships.find(
      (edge) =>
        edge.kind === 'references' &&
        edge.sourceRef === route.entityRef &&
        edge.targetRef.startsWith('rfp.'),
    )?.targetRef;
    return (
      lane +
      '/' +
      (rfp === undefined ? '' : rawSegmentOf(rfp) + '/{rfpId}/') +
      rawSegmentOf(route.entityRef) +
      (route.method === 'GET' ? '/{rfpId}' : '')
    );
  }
  if (route.requestRef !== null) {
    const base = contract + '/{contractId}/' + rawSegmentOf(route.requestRef);
    if (oldId.startsWith('route.ledger.')) return base;
    if (route.purpose === 'request') return base + '/request';
    if (route.purpose === 'confirm') {
      const request = buildDeliveryRoutes(model).find(
        (candidate) =>
          candidate.entityRef === route.requestRef &&
          candidate.purpose === 'request',
      )!;
      const siblings = model.relationships.filter(
        (edge) =>
          edge.kind === 'references' &&
          edge.targetRef === route.requestRef &&
          model.entities.some(
            (entity) =>
              entity.id === edge.sourceRef &&
              entity.category === 'evidence' &&
              entity.kind === 'fulfillment_confirmation',
          ),
      );
      return (
        base +
        '/request' +
        (request.shape === 'collection' ? '/{requestId}' : '') +
        '/confirmation' +
        (siblings.length > 1 ? '/' + rawSegmentOf(route.entityRef) : '')
      );
    }
  }
  return route.contractRef === route.entityRef
    ? contract + '/{contractId}'
    : lane + '/' + rawSegmentOf(route.entityRef);
};

/** A model is required because v5 paths alone cannot reveal child cardinality or aggregate identity. */
export const migrateOverlay = (
  model: DomainModelDocument,
  input: DesignDocument,
): DesignDocument => {
  const loaded = loadDesign('overlay.json', JSON.stringify(input));
  if (loaded.diagnostics.length > 0 || loaded.design === null)
    throw new Error(
      'OVERLAY_MIGRATION_INVALID: ' +
        loaded.diagnostics.map((item) => item.message).join('; '),
    );
  const routes = buildDeliveryRoutes(model);
  const ids = new Map<string, string>();
  const overlays = ((loaded.design['routes'] ?? []) as RouteOverlay[]).map(
    (overlay) => {
      const candidate =
        routes.find((route) => route.id === overlay.id) ??
        routes.find(
          (route) =>
            route.id === overlay.id.replace(/^route\.ledger\./, 'route.read.'),
        );
      if (candidate === undefined)
        throw new Error('OVERLAY_MIGRATION_UNKNOWN_ROUTE: ' + overlay.id);
      ids.set(overlay.id, candidate.id);
      if (overlay.path === undefined) return { ...overlay, id: candidate.id };
      const legacy = legacyPath(model, candidate, overlay.id);
      let path = overlay.path;
      if (path === legacy) path = candidate.path;
      else {
        const prefix = '/' + rawSegmentOf(candidate.contextRef) + '/';
        if (path.startsWith(prefix)) path = path.slice(prefix.length - 1);
        const oldParams: Record<string, string> = {
          contract: 'contractId',
          request: 'requestId',
          rfp: 'rfpId',
          proposal: 'proposalId',
          confirmation: 'confirmationId',
        };
        for (const [name, entityRef] of Object.entries(
          candidate.parameterEntityRefs,
        )) {
          const old = oldParams[entityRef.split('.')[0]!];
          if (old !== undefined)
            path = path.replaceAll('{' + old + '}', '{' + name + '}');
        }
      }
      const parameters = (value: string) =>
        [...value.matchAll(/\{[^{}]+\}/g)]
          .map((match) => match[0])
          .sort()
          .join();
      if (parameters(path) !== parameters(candidate.path))
        throw new Error(
          'OVERLAY_MIGRATION_PARAMETERS: ' +
            overlay.id +
            ' requires manual review',
        );
      return { ...overlay, id: candidate.id, path };
    },
  );
  const journeys = ((loaded.design['journeys'] ?? []) as JourneyOverlay[]).map(
    (step) => ({
      ...step,
      routeId:
        ids.get(step.routeId) ??
        (routes.some((route) => route.id === step.routeId)
          ? step.routeId
          : step.routeId.replace(/^route\.ledger\./, 'route.read.')),
    }),
  );
  return { ...loaded.design, schemaVersion: '6.0', routes: overlays, journeys };
};
