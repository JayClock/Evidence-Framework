import { mkdirSync, realpathSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderDeliverables } from '@evidence-poc/evidence-acceptance';
import { writeOutput } from '@evidence-poc/evidence-api';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from '../context.js';
import { loadModel } from '../model.js';

function canonical(file: string): string {
  try {
    return realpathSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    return parent === file
      ? file
      : path.join(canonical(parent), path.basename(file));
  }
}
const inside = (child: string, parent: string) => {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
};

export interface ExportVerifyResult {
  readonly synchronized: boolean;
  readonly missingFiles: readonly string[];
  readonly staleFiles: readonly string[];
  readonly extraFiles: readonly string[];
}

/** Exact bytes, no writes, and no symlink traversal in a dedicated output tree. */
export function verifyDeliverables(
  out: string,
  expected: Readonly<Record<string, string>>,
): ExportVerifyResult {
  const existing = new Set<string>();
  const symlinks = new Set<string>();
  const walk = (dir: string, prefix = ''): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${name}/`);
      else {
        existing.add(name);
        if (entry.isSymbolicLink()) symlinks.add(name);
      }
    }
  };
  walk(out);
  const missingFiles: string[] = [],
    staleFiles: string[] = [];
  for (const [name, content] of Object.entries(expected)) {
    if (!existing.has(name)) missingFiles.push(name);
    else if (
      symlinks.has(name) ||
      !readFileSync(path.join(out, name)).equals(Buffer.from(content))
    )
      staleFiles.push(name);
  }
  const extraFiles = [...existing]
    .filter((name) => !Object.hasOwn(expected, name))
    .sort();
  return {
    synchronized:
      !missingFiles.length && !staleFiles.length && !extraFiles.length,
    missingFiles: missingFiles.sort(),
    staleFiles: staleFiles.sort(),
    extraFiles,
  };
}

export async function exportCommand(
  values: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const format = stringOption(values.format)!;
  if (format !== 'stepci' && format !== 'hurl')
    throw new Error('--format must be stepci or hurl');
  const modelPath = canonical(
    path.resolve(context.cwd, stringOption(values.model)!),
  );
  const out = canonical(path.resolve(context.cwd, stringOption(values.out)!));
  if (
    inside(out, modelPath) ||
    inside(modelPath, out) ||
    inside(canonical(context.cwd), out)
  )
    throw new Error(
      'OUTPUT_INPUT_CONFLICT: output must not overlap the model or replace the working directory',
    );
  const model = await loadModel(modelPath);
  const all = !values.openapi && !values.tests;
  const result = await renderDeliverables(model, {
    openapi: all || values.openapi === true,
    tests: all || values.tests === true,
    format,
  });
  if (values.verify) {
    const verification = verifyDeliverables(out, result.files);
    if (!verification.synchronized) {
      context.stderr(
        [
          ...verification.missingFiles.map((file) => `MISSING: ${file}`),
          ...verification.staleFiles.map((file) => `MODIFIED: ${file}`),
          ...verification.extraFiles.map((file) => `EXTRA: ${file}`),
          `Out-of-sync deliverables detected. Run 'evidence export --model ${JSON.stringify(modelPath)} --out ${JSON.stringify(out)}${all ? '' : values.openapi ? ' --openapi' : ` --tests --format ${format}`}' and commit the changes.`,
        ].join('\n'),
      );
      return 1;
    }
    context.stdout(
      'Deliverables synchronized (exact byte comparison; no files written).',
    );
    return 0;
  }
  // No writes until both the contract and the acceptance suite have compiled.
  mkdirSync(path.dirname(out), { recursive: true });
  writeOutput(out, result.files);
  context.stdout(
    [
      `OpenAPI 3.1 validation: PASSED (${result.endpointCount} endpoints)`,
      `Acceptance: ${result.flowCount} flows, ${result.stepCount} steps`,
      ...Object.keys(result.files)
        .sort()
        .map((file) => `Exported: ${path.join(out, file)}`),
      'Output directory replaced atomically; use a dedicated generated directory.',
    ].join('\n'),
  );
  return 0;
}
