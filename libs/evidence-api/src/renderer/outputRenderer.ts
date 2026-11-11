import { createHash } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { canonicalJson } from '../canonicalJson.js';
import { compareText } from '../order.js';
import type { JsonObject } from '../types.js';
import { buildOpenApi } from '../openapi/openapi.js';
import { buildVectors } from '../vectors/e2eVectors.js';
import { API_PROJECTION_SCHEMA_TEXT } from '../schemas/apiProjectionSchema.js';
import { API_SCHEMA_TEXT } from '../schemas/apiSchema.js';

/**
 * The generated tree: five documents plus the manifest that describes them.
 *
 * Writing is all-or-nothing. A half-replaced directory would let a consumer read
 * a new `projection.json` beside a stale `openapi.json`, which is worse than the
 * previous version staying in place.
 */

/** The tool identity a manifest records. */
export const TOOL_NAME = 'evidence-api';

/** Report contract version, kept in step with the Python engine it replaces. */
export const TOOL_VERSION = '5.0.0';

const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

/** Every file a projection renders, in the order the manifest lists them. */
export const renderOutputs = (projection: JsonObject): Record<string, string> => {
  const http = isRecord(projection['http']) ? projection['http'] : {};
  const representations = recordsOf(http['representations']);
  const outputs: Record<string, string> = {
    'projection.json': canonicalJson(projection),
    'http-journeys.json': canonicalJson({
      runtimeValidated: false,
      entryPoints: http['entryPoints'],
      consumerCoverage: http['consumerCoverage'],
      navigation: http['navigation'],
      journeys: http['journeys'],
    }),
    'representation-examples.json': canonicalJson(
      Object.fromEntries(
        representations.map((item) => [String(item['id']), item['example']]),
      ),
    ),
    'e2e-test-vectors.json': canonicalJson(buildVectors(projection)),
    'openapi.json': canonicalJson(buildOpenApi(projection)),
  };

  const manifest = {
    schemaVersion: '5.0',
    apiId: projection['apiId'],
    tool: {
      name: TOOL_NAME,
      version: TOOL_VERSION,
      schemas: {
        'api.schema.json': sha256(API_SCHEMA_TEXT),
        'api-projection.schema.json': sha256(API_PROJECTION_SCHEMA_TEXT),
      },
    },
    runtime: {
      node: process.versions.node,
      dependencies: { ajv: toolVersionOf('ajv') },
    },
    inputs: projection['inputDigests'],
    outputs: Object.fromEntries(
      Object.entries(outputs)
        .sort(([left], [right]) => compareText(left, right))
        .map(([name, content]) => [
          name,
          { sha256: sha256(content), bytes: Buffer.byteLength(content, 'utf8') },
        ]),
    ),
  };

  outputs['manifest.json'] = canonicalJson(manifest);

  return outputs;
};

const require = createRequire(import.meta.url);

/** Reads a dependency's version, or says it is missing instead of guessing. */
const toolVersionOf = (name: string): string => {
  try {
    const parsed = JSON.parse(
      readFileSync(require.resolve(`${name}/package.json`), 'utf8'),
    ) as { version?: string };

    return parsed.version ?? 'unknown';
  } catch {
    return 'missing';
  }
};

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordsOf = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

/** Writes one generated file, flushed so a crash cannot leave a torn tail. */
const writeFileDurably = (directory: string, name: string, content: string): void => {
  if (path.basename(name) !== name || name === '.' || name === '..') {
    throw new Error('OUTPUT_NAME_INVALID: 输出只允许直接文件名');
  }

  const descriptor = openSync(path.join(directory, name), 'wx');

  try {
    writeSync(descriptor, content);
  } finally {
    closeSync(descriptor);
  }
};

/**
 * Replaces a generated directory, keeping the old one when anything fails.
 *
 * The staging directory is a sibling so the final move is a rename on the same
 * filesystem; a failed move restores the previous tree rather than leaving none.
 */
export const writeOutput = (out: string, outputs: Record<string, string>): void => {
  const parent = path.dirname(out);
  const stage = mkdtempSync(path.join(parent, `.${path.basename(out)}.stage-`));
  let backup: string | null = null;

  try {
    mkdirSync(stage, { recursive: true });

    for (const name of [...Object.keys(outputs).sort(compareText)]) {
      writeFileDurably(stage, name, outputs[name] as string);
    }

    if (exists(out)) {
      backup = mkdtempSync(path.join(parent, `.${path.basename(out)}.backup-`));
      rmSync(backup, { recursive: true, force: true });
      renameSync(out, backup);
    }

    try {
      renameSync(stage, out);
    } catch (error) {
      if (backup !== null && !exists(out)) {
        renameSync(backup, out);
        backup = null;
      }

      throw error;
    }

    if (backup !== null) {
      rmSync(backup, { recursive: true, force: true });
      backup = null;
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
};

const exists = (target: string): boolean => {
  try {
    statSync(target);

    return true;
  } catch {
    return false;
  }
};

/** Where a projection lands when the caller does not say. */
export const defaultOutputDirectory = (projectRoot: string): string =>
  path.join(projectRoot, '.evidence', 'api', 'generated');
