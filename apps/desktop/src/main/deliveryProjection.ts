import path from 'node:path';

import {
  buildDelivery,
  type DeliveryBundle,
  type DeliveryRoute,
  type DeliveryService,
} from '@evidence-poc/evidence-api';
import { readModelRoot } from '@evidence-poc/evidence-model-core';

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

/** One file the export writes, relative to the chosen directory. */
export interface DeliveryFile {
  path: string;
  content: string;
}

export const previewOf = (bundle: DeliveryBundle): DeliveryPreview => {
  const countByService = new Map<string, number>();

  for (const route of bundle.routes) {
    countByService.set(route.serviceId, (countByService.get(route.serviceId) ?? 0) + 1);
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
    routes: bundle.routes.map((route: DeliveryRoute) => ({
      method: route.method,
      path: route.path,
      summary: route.summary,
      serviceId: route.serviceId,
    })),
    limitations: [...bundle.limitations],
  };
};

/**
 * The files a hand-off writes.
 *
 * The contract is machine-read (`openapi.json`), the topology is read by whoever
 * deploys it, and the limitations are prose because they are the part a reviewer
 * has to act on. Nothing here restates what the model says: every file is a
 * serialization of one projection.
 */
export const deliveryFilesOf = (bundle: DeliveryBundle): DeliveryFile[] => {
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  const files: DeliveryFile[] = [
    { path: 'openapi.json', content: json(bundle.openapi) },
    {
      path: 'topology.json',
      content: json({
        schemaVersion: bundle.schemaVersion,
        modelId: bundle.modelId,
        modelName: bundle.modelName,
        modelVersion: bundle.modelVersion,
        services: bundle.services,
        links: bundle.links,
        limitations: bundle.limitations,
      }),
    },
    { path: 'routes.json', content: json(bundle.routes) },
    { path: 'deployment.compose.json', content: json(bundle.deployment) },
  ];

  if (bundle.limitations.length > 0) {
    files.push({
      path: 'limitations.md',
      content: [
        `# ${bundle.modelName} · 尚未闭环的能力`,
        '',
        '以下内容模型尚未给出答案，交付物按缺口保留，不做推测：',
        '',
        ...bundle.limitations.map((limitation) => `- ${limitation}`),
        '',
      ].join('\n'),
    });
  }

  return files;
};

/** Reads a model root and projects its delivery. */
export const readDelivery = async (modelRoot: string): Promise<DeliveryBundle> => {
  const { bundle } = await readModelRoot(modelRoot);

  return buildDelivery(bundle);
};

/** Default directory a hand-off is written to, beside the project. */
export const suggestedDeliveryDirectory = (projectDirectory: string): string =>
  path.join(projectDirectory, 'delivery');
