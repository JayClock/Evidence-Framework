import type { LiveDeliveryPreview } from '@evidence-poc/desktop-contracts/delivery';
import type { DeliveryPreview } from '@evidence-poc/desktop-contracts/projects';

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
    components: { schemas: {}, examples: {} },
    'x-evidence-services': [],
  },
  diff: {
    baseModelDigest: 'sha256:base',
    targetModelDigest: 'sha256:current',
    hasBreakingChanges: false,
    changes: [],
    details: {},
    changelog: '# API changes',
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
