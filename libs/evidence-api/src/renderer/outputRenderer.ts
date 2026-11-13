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
import type { EvidenceApiSnapshot } from '../types.js';
import { deliveryFilesOf } from '../delivery/files.js';
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

/** Projection contract version, written into every manifest it renders. */
export const TOOL_VERSION = '5.1.0';

const sha256 = (content: string): string =>
  createHash('sha256').update(content, 'utf8').digest('hex');

/** Every file a projection renders, in the order the manifest lists them. */
export const renderOutputs = (
  projection: EvidenceApiSnapshot,
): Record<string, string> => {
  const outputs: Record<string, string> = {
    ...Object.fromEntries(
      deliveryFilesOf(projection).map((file) => [file.path, file.content]),
    ),
    'projection.json': canonicalJson(projection),
    'http-journeys.json': canonicalJson({
      runtimeValidated: false,
      journeys: projection.journeys,
    }),
  };

  const manifest = {
    schemaVersion: '5.1',
    apiId: projection.apiId,
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
    inputs: projection.digests,
    outputs: Object.fromEntries(
      Object.entries(outputs)
        .sort(([left], [right]) => compareText(left, right))
        .map(([name, content]) => [
          name,
          {
            sha256: sha256(content),
            bytes: Buffer.byteLength(content, 'utf8'),
          },
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

/** Writes one generated file, flushed so a crash cannot leave a torn tail. */
const writeFileDurably = (
  directory: string,
  name: string,
  content: string,
): void => {
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
export const writeOutput = (
  out: string,
  outputs: Record<string, string>,
): void => {
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
