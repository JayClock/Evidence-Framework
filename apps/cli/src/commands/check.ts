import path from 'node:path';
import { buildFmCheckReport } from '@evidence-poc/evidence-model-core';
import { argumentsFor, type CommandContext } from '../context.js';
import { loadModel } from '../model.js';

export async function checkCommand(
  argv: readonly string[],
  context: CommandContext,
): Promise<number> {
  const { values, positionals } = argumentsFor(argv, {
    json: { type: 'boolean' },
  });
  if (positionals.length > 1)
    throw new Error('usage: evidence check [model] [--json]');
  const model = await loadModel(
    path.resolve(context.cwd, positionals[0] ?? '.evidence/fm'),
  );
  const { report } = buildFmCheckReport({ model });
  context.stdout(
    values.json
      ? JSON.stringify(report, null, 2)
      : [
          `Model: ${model.manifest.id}`,
          report.valid
            ? 'PASSED: static model checks (not HTTP acceptance)'
            : 'FAILED: static model checks',
          ...report.errors,
        ].join('\n'),
  );
  return report.valid ? 0 : 1;
}
