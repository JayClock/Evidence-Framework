import type { LiveDeliveryPreview } from '../../shared/delivery';
import type { DeliveryPreview } from '../../shared/projects';

export const liveDeliveryPreview = (
  revision = 1,
  preview?: DeliveryPreview,
): LiveDeliveryPreview => ({
  revision,
  modelDigest: 'sha256:current',
  baseModelDigest: 'sha256:base',
  preview: preview ?? {
    modelId: 'test',
    modelName: '测试',
    modelVersion: '1.0',
    services: [],
    links: [],
    routes: [],
    limitations: [],
  },
  openapi: {
    openapi: '3.1.0',
    info: {
      title: '测试',
      version: '1.0',
      description: '由履约模型直接投影的契约。',
    },
    'x-evidence-model': 'test',
    paths: {},
    components: { schemas: {} },
    'x-evidence-services': [],
  },
  diff: {
    baseModelId: 'test',
    targetModelId: 'test',
    baseModelDigest: 'sha256:base',
    targetModelDigest: 'sha256:current',
    summary: {
      routesAdded: 0,
      routesRemoved: 0,
      routesModified: 0,
      breakingChangeCount: 0,
      hasBreakingChanges: false,
    },
    routes: [],
    hypermediaLinks: [],
    breakingChanges: [],
    diagnostics: { base: [], target: [] },
  },
  changeLog: '# API changes',
  apiSummary: {
    totalRoutes: 0,
    coverageRatio: 1,
    uncoveredEntities: [],
    breakingChangeCount: 0,
    hasBaseline: true,
    modelDigest: 'sha256:current',
  },
  issues: [],
  bindings: [],
  canExportDraft: true,
});
