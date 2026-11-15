import path from 'node:path';
import {
  runReviewCommand,
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
  const result = await runReviewCommand({
    projectRoot,
    out: path.resolve(
      context.cwd,
      stringOption(options.out) ?? reviewPagePath(projectRoot),
    ),
    ...(scopeRefs ? { scopeRefs } : {}),
    requireApi: options.requireApi === true,
    ...(assets ? { assetsDirectory: path.resolve(context.cwd, assets) } : {}),
  });
  if (result.error) throw new Error(result.error);
  context.stdout(JSON.stringify(result.output, null, 2));
  return result.exitCode;
}
