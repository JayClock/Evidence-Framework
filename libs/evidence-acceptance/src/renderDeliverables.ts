import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { buildDelivery } from '@evidence-poc/evidence-api';
import { hasErrors } from '@evidence-poc/evidence-api';
import { assertOpenApiContract } from '@evidence-poc/evidence-api';
import { canonicalJson } from '@evidence-poc/evidence-api';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';
import { renderStepCi } from './renderer/stepCiRenderer.js';
import { renderHurl } from './renderer/hurlRenderer.js';

/** Compile everything before the caller atomically publishes a single output tree. */
export async function renderDeliverables(
  model: DomainModelDocument,
  options: {
    openapi: boolean;
    tests: boolean;
    format: 'stepci' | 'hurl';
  },
) {
  const delivery = buildDelivery(model);
  if (hasErrors(delivery.diagnostics))
    throw new Error(
      delivery.diagnostics
        .map((item) => `${item.code}: ${item.message}`)
        .join('\n'),
    );
  await assertOpenApiContract(delivery.openapi);
  const files: Record<string, string> = {};
  if (options.openapi) files['openapi.json'] = canonicalJson(delivery.openapi);
  const projection = options.tests
    ? projectAcceptanceTests(model, delivery.routes)
    : undefined;
  if (projection)
    Object.assign(
      files,
      options.format === 'stepci'
        ? { 'acceptance.stepci.yml': renderStepCi(projection) }
        : renderHurl(projection),
    );
  return {
    files,
    endpointCount: delivery.routes.length,
    flowCount: projection?.flows.length ?? 0,
    stepCount:
      projection?.flows.reduce((total, flow) => total + flow.steps.length, 0) ??
      0,
  };
}
