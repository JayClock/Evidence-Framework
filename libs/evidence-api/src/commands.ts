import { mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { cac } from 'cac';

import {
  exportAcceptanceTests,
  defaultAcceptanceDirectory,
} from './exportTests.js';
import { loadFm } from './adapter/fmAdapter.js';
import { diagnosticToJson, hasErrors, hasGaps } from './diagnostics.js';
import { inspectSummary } from './inspect.js';
import {
  loadDesign,
  validateProjection,
  type DesignDocument,
} from './loader/apiLoader.js';
import { buildProjection, isComplete } from './projector.js';
import { compareContracts } from './diff/compareContracts.js';
import { assertOpenApiContract } from './openapi/validateContract.js';
import { OasdiffError } from './diff/oasdiffRunner.js';
import {
  defaultOutputDirectory,
  renderOutputs,
  writeOutput,
} from './renderer/outputRenderer.js';

export type Command =
  | 'inspect'
  | 'check'
  | 'project'
  | 'deliver'
  | 'diff'
  | 'export-tests';

export interface CliOptions {
  command: Exclude<Command, 'diff'>;
  projectRoot: string;
  fm: string;
  fmCheck?: string;
  api?: string;
  out?: string;
  format?: 'stepci' | 'hurl';
}

export interface DiffCliOptions {
  command: 'diff';
  base: string;
  target: string;
  format: 'json' | 'markdown';
  baseApi?: string;
  api?: string;
}

export interface CliResult {
  output: unknown;
  error?: string;
  exitCode: number;
}

const USAGE =
  'usage: evidence-api <inspect|check|project|deliver> --project-root DIR --fm DIR_OR_BUNDLE [--fm-check FILE] [--api FILE] [--out DIR]\n       evidence-api diff --base DIR_OR_BUNDLE --target DIR_OR_BUNDLE [--base-api FILE] [--api FILE] [--format json|markdown]\n       evidence-api export-tests --project-root DIR --fm DIR_OR_BUNDLE [--format stepci|hurl] [--out DIR]';

const isDirectory = (target: string): boolean => {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
};
const isInside = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(`${parent}${path.sep}`);

/** Resolve existing ancestors too, so new outputs cannot hide behind a symlink. */
const canonicalPath = (target: string): string => {
  const absolute = path.resolve(target);
  try {
    return realpathSync(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    return parent === absolute
      ? absolute
      : path.join(canonicalPath(parent), path.basename(absolute));
  }
};

/** Optional inputs remain protected against output overlap when they are supplied. */
const validateResolvedPaths = (options: CliOptions): string | null => {
  for (const [value, name, required] of [
    [options.projectRoot, 'project-root', true],
    [options.fm, 'fm', true],
    [options.fmCheck, 'fm-check', false],
    [options.api, 'api', false],
    [options.out, 'out', false],
  ] as const) {
    if (value === undefined || value === '') {
      if (required || value === '') return `--${name} 是必需的`;
    } else if (!path.isAbsolute(value)) {
      return `PATH_NOT_ABSOLUTE: --${name} 必须使用绝对路径`;
    }
  }
  const root = canonicalPath(options.projectRoot);
  if (!isDirectory(root))
    return 'PROJECT_ROOT_INVALID: --project-root 必须是现有目录';
  const fm = canonicalPath(options.fm);
  if (
    options.fmCheck !== undefined &&
    isInside(canonicalPath(options.fmCheck), fm)
  ) {
    return 'FM_CHECK_INPUT_CONFLICT: FM 检查结果必须位于模型目录之外';
  }
  if (options.api !== undefined && isInside(canonicalPath(options.api), fm)) {
    return 'API_INPUT_CONFLICT: API 覆盖文件必须位于 FM 根目录之外';
  }
  if (!['project', 'deliver', 'export-tests'].includes(options.command))
    return null;
  const out = canonicalPath(
    options.out ??
      (options.command === 'export-tests'
        ? defaultAcceptanceDirectory(root)
        : defaultOutputDirectory(root)),
  );
  if (!isInside(out, root))
    return 'OUTPUT_OUTSIDE_PROJECT: 输出目录必须位于项目根内';
  for (const input of [options.fm, options.api, options.fmCheck]) {
    if (
      input !== undefined &&
      (isInside(out, canonicalPath(input)) ||
        isInside(canonicalPath(input), out))
    ) {
      return 'OUTPUT_INPUT_CONFLICT: 输出不能与模型、覆盖文件或检查报告重叠';
    }
  }
  return null;
};

export const validatePaths = (options: CliOptions): string | null => {
  try {
    return validateResolvedPaths(options);
  } catch (error) {
    return `PATH_INVALID: ${error instanceof Error ? error.message : String(error)}`;
  }
};

const parse = (
  argv: readonly string[],
): CliOptions | DiffCliOptions | string => {
  const cli = cac('evidence-api');
  for (const command of [
    'inspect',
    'check',
    'project',
    'deliver',
    'diff',
    'export-tests',
  ] as const) {
    const registered = cli
      .command(command)
      .action((options: Record<string, unknown>) => {
        const value = (name: string): string | undefined =>
          options[name] === undefined ? undefined : String(options[name]);
        if (command === 'diff') {
          const format = value('format') ?? 'json';
          if (format !== 'json' && format !== 'markdown')
            throw new Error('--format 必须是 json 或 markdown');
          return {
            command,
            base: value('base') ?? '',
            target: value('target') ?? '',
            format,
            ...(value('baseApi') === undefined
              ? {}
              : { baseApi: value('baseApi') }),
            ...(value('api') === undefined ? {} : { api: value('api') }),
          };
        }
        const format = value('format') ?? 'stepci';
        if (
          command === 'export-tests' &&
          format !== 'stepci' &&
          format !== 'hurl'
        )
          throw new Error('--format 必须是 stepci 或 hurl');
        return {
          command,
          projectRoot: value('projectRoot') ?? '',
          fm: value('fm') ?? '',
          ...(command === 'export-tests' ? { format } : {}),
          ...(value('fmCheck') === undefined
            ? {}
            : { fmCheck: value('fmCheck') }),
          ...(value('api') === undefined ? {} : { api: value('api') }),
          ...(value('out') === undefined ? {} : { out: value('out') }),
        };
      });
    const flags =
      command === 'diff'
        ? ['base', 'target', 'base-api', 'api', 'format']
        : command === 'export-tests'
          ? ['project-root', 'fm', 'out', 'format']
          : ['project-root', 'fm', 'fm-check', 'api', 'out'];
    for (const flag of flags) registered.option(`--${flag} <value>`, flag);
  }
  try {
    cli.parse(['node', 'evidence-api', ...argv], { run: false });
    if (!cli.matchedCommand) return USAGE;
    if (cli.args.length || cli.options['--'].length)
      return 'unexpected positional argument';
    for (const [name, value] of Object.entries(cli.options)) {
      if (name === '--') continue;
      if (Array.isArray(value)) return `duplicate argument: --${name}`;
      if (typeof value === 'string' && !value.trim())
        return `--${name} needs a value`;
    }
    return cli.runMatchedCommand() as CliOptions | DiffCliOptions;
  } catch (error) {
    return error instanceof Error
      ? error.message
          .replace(/^Unknown option /, 'unexpected argument: ')
          .replace(/option `([^`]+)` value is missing/, '$1 needs a value')
      : String(error);
  }
};

const refused = (code: string, message: string): CliResult => ({
  output: { valid: false, diagnostics: [{ code, severity: 'error', message }] },
  exitCode: 1,
});

export const runDiff = async (options: DiffCliOptions): Promise<CliResult> => {
  for (const [value, name, required] of [
    [options.base, 'base', true],
    [options.target, 'target', true],
    [options.baseApi, 'base-api', false],
    [options.api, 'api', false],
  ] as const) {
    if (value === undefined) {
      if (required)
        return { output: null, error: `--${name} 是必需的`, exitCode: 2 };
    } else if (value === '')
      return { output: null, error: `--${name} 是必需的`, exitCode: 2 };
    else if (!path.isAbsolute(value))
      return {
        output: null,
        error: `PATH_NOT_ABSOLUTE: --${name} 必须使用绝对路径`,
        exitCode: 2,
      };
  }
  try {
    const base = await loadFm(options.base),
      target = await loadFm(options.target);
    if (base.index === null || target.index === null)
      return {
        output: {
          valid: false,
          diagnostics: [...base.diagnostics, ...target.diagnostics].map(
            diagnosticToJson,
          ),
        },
        exitCode: 2,
      };
    const overlays = [options.baseApi, options.api].map((file) =>
      file === undefined ? undefined : loadDesign(file),
    );
    const invalid = overlays.flatMap((overlay) => overlay?.diagnostics ?? []);
    if (hasErrors(invalid))
      return {
        output: { valid: false, diagnostics: invalid.map(diagnosticToJson) },
        exitCode: 2,
      };
    const before = buildProjection({
      index: base.index,
      ...(overlays[0]?.design == null ? {} : { design: overlays[0].design }),
    }).projection;
    const after = buildProjection({
      index: target.index,
      ...(overlays[1]?.design == null ? {} : { design: overlays[1].design }),
    }).projection;
    const diff = await compareContracts(before, after);
    return {
      output: options.format === 'json' ? diff : diff.changelog,
      exitCode: diff.hasBreakingChanges ? 1 : 0,
    };
  } catch (error) {
    return {
      output: null,
      error:
        error instanceof OasdiffError
          ? [error.message, error.stdout, error.stderr]
              .filter(Boolean)
              .join('\n')
          : error instanceof Error
            ? error.message
            : String(error),
      exitCode: 2,
    };
  }
};

/** Preview and export current inputs; stale evidence is a gap, not a reason to hide the draft. */
export const runCli = async (argv: readonly string[]): Promise<CliResult> => {
  if (
    (argv.length === 1 && ['--help', '-h'].includes(argv[0]!)) ||
    (argv.length === 2 &&
      [
        'inspect',
        'check',
        'project',
        'deliver',
        'diff',
        'export-tests',
      ].includes(argv[0]!) &&
      ['--help', '-h'].includes(argv[1]!))
  )
    return { output: `${USAGE}\n`, exitCode: 0 };
  const options = parse(argv);
  if (typeof options === 'string')
    return {
      output: null,
      error: options,
      exitCode: argv[0] === 'diff' ? 2 : 1,
    };
  return runApiCommand(options);
};

/** Shared execution API; the legacy binary and unified CLI use the same checks. */
export const runApiCommand = async (
  options: CliOptions | DiffCliOptions,
): Promise<CliResult> => {
  if (options.command === 'diff') return runDiff(options);
  const problem = validatePaths(options);
  if (problem !== null) return { output: null, error: problem, exitCode: 1 };
  if (options.command === 'export-tests') {
    const out = options.out ?? defaultAcceptanceDirectory(options.projectRoot);
    try {
      const exported = await exportAcceptanceTests({
        fm: options.fm,
        out,
        format: options.format ?? 'stepci',
      });
      return {
        output: {
          valid: true,
          out,
          format: options.format ?? 'stepci',
          ...exported,
        },
        exitCode: 0,
      };
    } catch (error) {
      return refused(
        'ACCEPTANCE_EXPORT_FAILED',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  let check: unknown;
  if (options.fmCheck !== undefined) {
    try {
      check = JSON.parse(readFileSync(options.fmCheck, 'utf8'));
    } catch (error) {
      return refused(
        'FM_CHECK_INVALID',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const loaded = await loadFm(options.fm, check);
  if (loaded.index === null) {
    return {
      output: {
        valid: false,
        diagnostics: loaded.diagnostics.map(diagnosticToJson),
      },
      exitCode: 1,
    };
  }
  const index = loaded.index;
  let design: DesignDocument | undefined;
  if (options.api !== undefined) {
    const overlay = loadDesign(options.api);
    if (overlay.design === null || hasErrors(overlay.diagnostics)) {
      return {
        output: {
          valid: false,
          diagnostics: overlay.diagnostics.map(diagnosticToJson),
        },
        exitCode: 1,
      };
    }
    design = overlay.design;
  }
  const built = buildProjection({
    index,
    ...(design === undefined ? {} : { design }),
  });
  const diagnostics = [
    ...built.diagnostics,
    ...validateProjection(built.projection),
  ];
  const exitCode = hasErrors(diagnostics) ? 1 : hasGaps(diagnostics) ? 3 : 0;
  const summary = {
    status: 'FM_LIVE_INSPECTED',
    mode: built.projection.mode,
    valid: !hasErrors(diagnostics),
    complete: isComplete(built.projection) && diagnostics.length === 0,
    modelId: built.projection.modelId,
    routeCount: built.projection.routes.length,
    serviceCount: built.projection.services.length,
    gapCount: diagnostics.filter((item) => item.severity === 'gap').length,
    diagnostics: diagnostics.map(diagnosticToJson),
  };
  if (options.command === 'inspect')
    return { output: { ...inspectSummary(index), ...summary }, exitCode };
  if (options.command === 'check')
    return { output: { ...summary, projection: built.projection }, exitCode };
  if (hasErrors(diagnostics)) return { output: summary, exitCode };

  const out = options.out ?? defaultOutputDirectory(options.projectRoot);
  try {
    await assertOpenApiContract(built.projection.openapi);
    mkdirSync(path.dirname(out), { recursive: true });
    const outputs = renderOutputs(built.projection);
    writeOutput(out, outputs);
    return {
      output: {
        ...summary,
        out,
        files: Object.keys(outputs),
        limitations: built.projection.limitations,
      },
      exitCode,
    };
  } catch (error) {
    return {
      output: null,
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
};
