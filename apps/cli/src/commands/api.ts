import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  loadFm,
  migrateOverlay,
  buildProjection,
} from '@evidence-poc/evidence-api';
import {
  runApiCommand,
  type Command,
} from '@evidence-poc/evidence-acceptance/commands';
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
  if (command === 'migrate-overlay') {
    for (const name of Object.keys(options))
      if (name !== '--' && !['in', 'out', 'o', 'model', 'fm'].includes(name))
        throw new Error('Unexpected option for api migrate-overlay: --' + name);
    const input = stringOption(options.in),
      output = stringOption(options.out);
    if (input === undefined || output === undefined)
      throw new Error('--in and --out are required');
    const loaded = await loadFm(
      path.resolve(
        context.cwd,
        stringOption(options.model) ??
          stringOption(options.fm) ??
          '.evidence/fm',
      ),
    );
    if (loaded.index === null)
      throw new Error(
        loaded.diagnostics.map((item) => item.message).join('; '),
      );
    const migrated = migrateOverlay(
      loaded.index.document,
      JSON.parse(readFileSync(path.resolve(context.cwd, input), 'utf8')),
    );
    const projected = buildProjection({
      index: loaded.index,
      design: migrated,
    });
    const errors = projected.diagnostics.filter(
      (item) => item.severity === 'error',
    );
    if (errors.length)
      throw new Error(errors.map((item) => item.message).join('; '));
    writeFileSync(
      path.resolve(context.cwd, output),
      JSON.stringify(migrated, null, 2) + '\n',
      { flag: 'wx' },
    );
    context.stdout('Migrated overlay to API v6: ' + output);
    return 0;
  }
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
        ? ['projectRoot', 'model', 'fm', 'out', 'o']
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
