import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isModelBundlePath,
  parseModelBundleText,
} from '@evidence-poc/evidence-model-core';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import {
  buildDeliveryContract,
  validateDeliveryExamples,
} from './delivery/modelDelivery.js';
import { buildDeliveryRoutes } from './delivery/routes.js';
import { projectAcceptanceTests } from './delivery/scenarioProjector.js';
import { assertOpenApiContract } from './openapi/validateContract.js';
import { renderStepCi } from './renderer/stepCiRenderer.js';
import { renderHurl } from './renderer/hurlRenderer.js';
import { writeOutput } from './renderer/outputRenderer.js';

export const defaultAcceptanceDirectory = (root: string): string =>
  path.join(root, '.evidence', 'api', 'acceptance');

/** Direct source loader: inline examples are the only acceptance source. */
export async function exportAcceptanceTests(options: {
  fm: string;
  out: string;
  format: 'stepci' | 'hurl';
}): Promise<{ files: string[]; flowCount: number; stepCount: number }> {
  const parsed = isModelBundlePath(options.fm)
    ? (() => {
        const result = parseModelBundleText(readFileSync(options.fm, 'utf8'));
        return { bundle: result.document, issues: result.issues };
      })()
    : await readModelRoot(options.fm);
  if (parsed.issues.length > 0)
    throw new Error(
      `FM_INVALID: ${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`,
    );
  const model = parsed.bundle;
  const routes = buildDeliveryRoutes(model);
  const contract = buildDeliveryContract(model, routes);
  await assertOpenApiContract(contract);
  const invalid = validateDeliveryExamples(contract, routes);
  if (invalid.length > 0)
    throw new Error(
      `API_EXAMPLE_INVALID: ${invalid.map((issue) => issue.message).join('\n')}`,
    );
  const projection = projectAcceptanceTests(model, routes);
  const files =
    options.format === 'stepci'
      ? { 'acceptance.stepci.yml': renderStepCi(projection) }
      : renderHurl(projection);
  // All validation and rendering precedes the atomic directory replacement.
  mkdirSync(path.dirname(options.out), { recursive: true });
  writeOutput(options.out, files);
  return {
    files: Object.keys(files).sort(),
    flowCount: projection.flows.length,
    stepCount: projection.flows.reduce(
      (total, flow) => total + flow.steps.length,
      0,
    ),
  };
}
