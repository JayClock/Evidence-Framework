import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { SuiteProjection } from '../delivery/scenarioProjector.js';
import { canonical } from '../runner/suiteSelection.js';
import { renderBruno } from './brunoRenderer.js';

export const suiteManifest = 'evidence-acceptance.json';
const data = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value),
  'Expected a JSON object',
);
const bindings = data.refine(
  (value): value is Record<string, string> =>
    Object.values(value).every((item) => typeof item === 'string'),
  'Expected string bindings',
);
const manifest = z.object({
  version: z.literal(1),
  projection: z.object({
    modelId: z.string().min(1),
    flows: z
      .array(
        z.object({
          id: z.string().min(1),
          tags: z.array(z.string()).optional(),
          steps: z
            .array(
              z.object({
                ref: z.string().min(1),
                route: z.object({
                  method: z.enum(['GET', 'POST']),
                  path: z.string().regex(/^\/(?![/\\])[^\\?#]*$/),
                }),
                asOf: z.string().datetime(),
                actingRoleRef: z.string().min(1),
                status: z.number().int().min(100).max(599),
                inputs: data,
                assertions: data,
                responseSchema: data.optional(),
                parameters: bindings,
                captures: bindings,
              }),
            )
            .nonempty(),
        }),
      )
      .nonempty(),
  }),
});

/** Generated metadata for flow selection and drift, not a second HTTP test format. */
export function renderAcceptanceSuite(
  projection: SuiteProjection,
): Record<string, string> {
  const snapshot = {
    version: 1,
    projection: {
      modelId: projection.modelId,
      flows: projection.flows.map((flow) => ({
        ...flow,
        steps: flow.steps.map(({ route: { method, path }, ...step }) => ({
          ...step,
          route: { method, path },
        })),
      })),
    },
  };
  // Round-trip the canonical representation so native bytes and the metadata
  // always agree, including the order of keys in rendered request bodies.
  const text = canonical(snapshot);
  return {
    ...renderBruno(manifest.parse(JSON.parse(text)).projection),
    [suiteManifest]: `${JSON.stringify(JSON.parse(text), null, 2)}\n`,
  };
}

async function readCollectionFile(
  directory: string,
  relative: string,
): Promise<Buffer> {
  const parts = relative.split('/');
  let file = directory;
  for (const [index, part] of parts.entries()) {
    file = path.join(file, part);
    const info = await lstat(file);
    if (!(index === parts.length - 1 ? info.isFile() : info.isDirectory()))
      throw new Error(`Not a regular collection path: ${relative}`);
  }
  return readFile(file);
}

/** Accept only this exporter’s collections. Never execute user-authored Bruno scripts. */
export async function readAcceptanceSuite(
  directory: string,
): Promise<SuiteProjection> {
  try {
    if (!(await lstat(directory)).isDirectory())
      throw new Error('Expected a generated Bruno collection directory');
    const contents = await readCollectionFile(directory, suiteManifest);
    const { projection } = manifest.parse(JSON.parse(contents.toString()));
    for (const [name, expected] of Object.entries(renderBruno(projection))) {
      if (
        !(await readCollectionFile(directory, name)).equals(
          Buffer.from(expected),
        )
      )
        throw new Error(`Modified Bruno artifact: ${name}`);
    }
    return projection;
  } catch (error) {
    throw new Error(
      `Invalid generated Bruno collection: ${directory}. Run evidence export --tests. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
