import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { renderDeliverables, writeOutput } from '@evidence-poc/evidence-api';
import { argumentsFor, stringOption, type CommandContext } from '../context.js';
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
const inside = (child: string, parent: string) =>
  child === parent || child.startsWith(`${parent}${path.sep}`);

export async function exportCommand(
  argv: readonly string[],
  context: CommandContext,
): Promise<number> {
  const { values, positionals } = argumentsFor(argv, {
    model: { type: 'string', default: '.evidence/fm' },
    out: { type: 'string', default: 'dist' },
    openapi: { type: 'boolean' },
    tests: { type: 'boolean' },
    format: { type: 'string', default: 'stepci' },
  });
  if (positionals.length)
    throw new Error(
      'usage: evidence export [--model path] [--openapi] [--tests] [--format stepci|hurl] [--out dir]',
    );
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
