import path from 'node:path';
import {
  runApiCommand,
  type Command,
} from '@evidence-poc/evidence-api/commands';
import {
  stringOption,
  type CommandOptions,
  type CommandContext,
} from '../context.js';

/** Retain legacy overlay/projection workflows behind the single evidence bin. */
export async function apiCommand(
  command: string,
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  if (
    ![
      'inspect',
      'check',
      'project',
      'deliver',
      'diff',
      'export-tests',
    ].includes(command)
  )
    throw new Error(`Unknown API command: ${command}`);
  const allowed = new Set(
    command === 'diff'
      ? ['base', 'target', 'baseApi', 'api', 'format']
      : command === 'export-tests'
        ? ['projectRoot', 'model', 'fm', 'out', 'o', 'format']
        : ['projectRoot', 'model', 'fm', 'fmCheck', 'api', 'out', 'o'],
  );
  for (const name of Object.keys(options)) {
    if (name !== '--' && !allowed.has(name))
      throw new Error(`Unexpected option for api ${command}: --${name}`);
  }
  const resolve = (value: unknown) => {
    const option = stringOption(value);
    return option === undefined ? undefined : path.resolve(context.cwd, option);
  };
  const api = resolve(options.api);
  const baseApi = resolve(options.baseApi);
  const fmCheck = resolve(options.fmCheck);
  const out = resolve(options.out);
  const format = stringOption(options.format);
  if (
    command === 'diff' &&
    format !== undefined &&
    format !== 'json' &&
    format !== 'markdown'
  )
    throw new Error('--format must be json or markdown');
  if (
    command === 'export-tests' &&
    format !== undefined &&
    format !== 'stepci' &&
    format !== 'hurl'
  )
    throw new Error('--format must be stepci or hurl');
  const result = await runApiCommand(
    command === 'diff'
      ? {
          command,
          base: resolve(options.base) ?? '',
          target: resolve(options.target) ?? '',
          format: (format as 'json' | 'markdown') ?? 'json',
          ...(baseApi === undefined ? {} : { baseApi }),
          ...(api === undefined ? {} : { api }),
        }
      : {
          command: command as Exclude<Command, 'diff'>,
          projectRoot: resolve(options.projectRoot) ?? context.cwd,
          fm:
            resolve(options.model) ??
            resolve(options.fm) ??
            path.join(context.cwd, '.evidence/fm'),
          ...(fmCheck === undefined ? {} : { fmCheck }),
          ...(api === undefined ? {} : { api }),
          ...(out === undefined ? {} : { out }),
          ...(command === 'export-tests'
            ? { format: (format as 'stepci' | 'hurl') ?? 'stepci' }
            : {}),
        },
  );
  if (result.error) throw new Error(result.error);
  if (result.output !== null)
    context.stdout(
      typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output, null, 2),
    );
  return result.exitCode;
}
