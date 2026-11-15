import path from 'node:path';
import {
  generateWorkbench,
  reviewPagePath,
} from '@evidence-poc/evidence-visualization';
import {
  stringOption,
  type CommandOptions,
  type CommandContext,
} from '../context.js';

export async function reviewCommand(
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const projectRoot = path.resolve(
    context.cwd,
    stringOption(options.projectRoot) ?? '.',
  );
  const scopeRefs = options.scope as string[] | undefined;
  scopeRefs?.forEach(stringOption);
  const assets = stringOption(options.assets);
  const generated = await generateWorkbench({
    projectRoot,
    output: path.resolve(
      context.cwd,
      stringOption(options.out) ?? reviewPagePath(projectRoot),
    ),
    ...(scopeRefs ? { scopeRefs } : {}),
    requireApi: options.requireApi === true,
    ...(assets ? { assetsDirectory: path.resolve(context.cwd, assets) } : {}),
  });
  context.stdout(
    JSON.stringify(
      {
        output: generated.output,
        counts: generated.data.counts,
        validation: generated.data.validation,
      },
      null,
      2,
    ),
  );
  return 0;
}
