import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { buildDelivery } from '@evidence-poc/evidence-api';
import { hasErrors } from '@evidence-poc/evidence-api';
import { assertOpenApiContract } from '@evidence-poc/evidence-api';
import { canonicalJson } from '@evidence-poc/evidence-api';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';
import { renderAcceptanceSuite } from './renderer/brunoSuite.js';

async function validatedDelivery(model: DomainModelDocument) {
  const delivery = buildDelivery(model);
  if (hasErrors(delivery.diagnostics))
    throw new Error(
      delivery.diagnostics
        .map((item) => `${item.code}: ${item.message}`)
        .join('\n'),
    );
  await assertOpenApiContract(delivery.openapi);
  return delivery;
}

/** Compile a baseline through the same delivery validation as an export. */
export async function compileAcceptanceBaseline(model: DomainModelDocument) {
  const { routes } = await validatedDelivery(model);
  return projectAcceptanceTests(model, routes);
}

/** Compile everything before the caller atomically publishes a single output tree. */
export async function renderDeliverables(
  model: DomainModelDocument,
  options: {
    openapi: boolean;
    tests: boolean;
  },
) {
  const delivery = await validatedDelivery(model);
  const files: Record<string, string> = {};
  if (options.openapi) files['openapi.json'] = canonicalJson(delivery.openapi);
  const projection = options.tests
    ? projectAcceptanceTests(model, delivery.routes)
    : undefined;
  if (projection) Object.assign(files, renderAcceptanceSuite(projection));
  return {
    files,
    endpointCount: delivery.routes.length,
    flowCount: projection?.flows.length ?? 0,
    stepCount:
      projection?.flows.reduce((total, flow) => total + flow.steps.length, 0) ??
      0,
  };
}
