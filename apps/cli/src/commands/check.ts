import path from 'node:path';
import { buildFmCheckReport } from '@evidence-poc/evidence-model-core';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from '../context.js';
import { loadModel } from '../model.js';

export async function checkCommand(
  modelPath: string | undefined,
  values: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const model = await loadModel(
    path.resolve(context.cwd, modelPath ?? '.evidence/fm'),
  );
  const scopeRefs = values.scope as string[] | undefined;
  scopeRefs?.forEach(stringOption);
  const { report } = buildFmCheckReport({
    model,
    ...(scopeRefs ? { scopeRefs } : {}),
  });
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
