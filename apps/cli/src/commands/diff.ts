import path from 'node:path';
import { runCli } from '@evidence-poc/evidence-api/cli';
import { argumentsFor, stringOption, type CommandContext } from '../context.js';

export async function diffCommand(
  argv: readonly string[],
  context: CommandContext,
): Promise<number> {
  const { values, positionals } = argumentsFor(argv, {
    format: { type: 'string', default: 'json' },
  });
  if (positionals.length !== 3 || positionals[0] !== 'api')
    throw new Error(
      'usage: evidence diff api <old-model> <new-model> [--format json|markdown]',
    );
  const format = stringOption(values.format)!;
  if (!['json', 'markdown'].includes(format))
    throw new Error('--format must be json or markdown');
  const result = await runCli([
    'diff',
    '--base',
    path.resolve(context.cwd, positionals[1]!),
    '--target',
    path.resolve(context.cwd, positionals[2]!),
    '--format',
    format,
  ]);
  if (result.error) throw new Error(result.error);
  context.stdout(
    typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output, null, 2),
  );
  return result.exitCode === 0 ? 0 : 1;
}
