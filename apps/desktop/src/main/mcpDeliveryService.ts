import type {
  McpDeliveryTopology,
  McpOpenApiContract,
} from '@evidence-poc/evidence-mcp';
import type { DeliveryBundle } from '@evidence-poc/evidence-api';

import { readDelivery } from './deliveryProjection';
import { modelSourceOf, projectDirectoryOf } from './modelSource';

/**
 * The two MCP reads that answer "what does this model become".
 *
 * They project the saved sources, exactly like the delivery hub, so an external
 * agent plans against the same boundaries a person sees. Neither writes anything:
 * a contract that a caller intends to deploy belongs in their repository, not in
 * the modeler's project.
 */

export interface McpDeliveryService {
  topology: (rootPath: string) => Promise<McpDeliveryTopology>;
  openapi: (rootPath: string) => Promise<McpOpenApiContract>;
}

const topologyOf = (bundle: DeliveryBundle): McpDeliveryTopology => {
  const counts = new Map<string, number>();

  for (const route of bundle.routes) {
    counts.set(route.serviceId, (counts.get(route.serviceId) ?? 0) + 1);
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
      routeCount: counts.get(service.id) ?? 0,
    })),
    links: bundle.links.map((link) => ({
      from: link.from,
      to: link.to,
      kind: link.kind,
      mode: link.mode,
      label: link.label,
    })),
    limitations: [...bundle.limitations],
  };
};

export const createMcpDeliveryService = (
  build: (modelRoot: string) => Promise<DeliveryBundle> = readDelivery,
): McpDeliveryService => {
  const modelRootOf = (rootPath: string): string =>
    modelSourceOf(projectDirectoryOf(rootPath));

  return {
    topology: async (rootPath) => topologyOf(await build(modelRootOf(rootPath))),
    openapi: async (rootPath) => {
      const bundle = await build(modelRootOf(rootPath));

      return {
        modelId: bundle.modelId,
        modelVersion: bundle.modelVersion,
        pathCount: Object.keys(bundle.openapi.paths).length,
        document: bundle.openapi,
        limitations: [...bundle.limitations],
      };
    },
  };
};
