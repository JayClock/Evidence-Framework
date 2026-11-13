import path from 'node:path';

import {
  buildProjection,
  hasErrors,
  loadFm,
  deliveryFilesOf,
  type DeliveryBundle,
  type DeliveryService,
} from '@evidence-poc/evidence-api';

export { deliveryFilesOf };

/**
 * Turning a project's model into the documents a delivery hand-off consists of.
 *
 * The renderer never reads the model tree, so the preview it shows and the files
 * the export writes are both produced here, from the same bundle. That way the
 * modal cannot describe a delivery the export would not produce.
 */

/** One route as the preview lists it. */
export interface DeliveryPreviewRoute {
  method: string;
  path: string;
  summary: string;
  serviceId: string;
}

/** What the delivery hub shows before anything is written. */
export interface DeliveryPreview {
  modelId: string;
  modelName: string;
  modelVersion: string;
  services: readonly {
    id: string;
    name: string;
    kind: DeliveryService['kind'];
    contextRef: string;
    supplies: readonly string[];
    consumes: readonly string[];
    notes: string;
    routeCount: number;
  }[];
  links: readonly {
    id: string;
    from: string;
    to: string;
    kind: string;
    mode: string;
    label: string;
    viaRef: string;
  }[];
  routes: readonly DeliveryPreviewRoute[];
  limitations: readonly string[];
}

/**
 * The preview the hub renders.
 *
 * It counts routes per service because that is the number a reader checks first:
 * a service with no route exists in the topology but answers nothing, and the hub
 * should show that rather than hide it behind a tidy table.
 */
export const previewOf = (bundle: DeliveryBundle): DeliveryPreview => {
  const countByService = new Map<string, number>();

  for (const route of bundle.routes) {
    countByService.set(
      route.serviceId,
      (countByService.get(route.serviceId) ?? 0) + 1,
    );
  }

  return {
    modelId: bundle.modelId,
    modelName: bundle.modelName,
    modelVersion: bundle.modelVersion,
    services: bundle.services.map((service) => ({
      id: service.id,
      name: service.name,
      kind: service.kind,
      contextRef: service.contextRef,
      supplies: [...service.supplies],
      consumes: [...service.consumes],
      notes: service.notes,
      routeCount: countByService.get(service.id) ?? 0,
    })),
    links: bundle.links.map((link) => ({ ...link })),
    routes: bundle.routes.map((route) => ({
      method: route.method,
      path: route.path,
      summary: route.summary,
      serviceId: route.serviceId,
    })),
    limitations: [...bundle.limitations],
  };
};

/** Reads a model root and projects its delivery. */
export const readDelivery = async (
  modelRoot: string,
): Promise<DeliveryBundle> => {
  const loaded = await loadFm(modelRoot);
  if (loaded.index === null) {
    throw new Error(loaded.diagnostics.map((item) => item.message).join('；'));
  }
  const built = buildProjection({ index: loaded.index });
  if (hasErrors(built.diagnostics)) {
    throw new Error(built.diagnostics.map((item) => item.message).join('；'));
  }
  return built.projection;
};

/** Default directory a hand-off is written to, beside the project. */
export const suggestedDeliveryDirectory = (projectDirectory: string): string =>
  path.join(projectDirectory, 'delivery');
