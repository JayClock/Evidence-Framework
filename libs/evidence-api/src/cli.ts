#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFm } from './adapter/fmAdapter.js';
import { canonicalJson } from './canonicalJson.js';
import { diagnosticToJson, hasErrors, hasGaps } from './diagnostics.js';
import { inspectSummary } from './inspect.js';
import {
  loadDesign,
  validateProjection,
  type DesignDocument,
} from './loader/apiLoader.js';
import { buildProjection, isComplete } from './projector.js';
import {
  defaultOutputDirectory,
  renderOutputs,
  writeOutput,
} from './renderer/outputRenderer.js';

export type Command = 'inspect' | 'check' | 'project' | 'deliver';

export interface CliOptions {
  command: Command;
  projectRoot: string;
  fm: string;
  fmCheck?: string;
  api?: string;
  out?: string;
}

export interface CliResult {
  output: unknown;
  error?: string;
  exitCode: number;
}

const USAGE =
  'usage: evidence-api <inspect|check|project|deliver> --project-root DIR --fm DIR_OR_BUNDLE [--fm-check FILE] [--api FILE] [--out DIR]';

const isDirectory = (target: string): boolean => {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
};
const isInside = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(`${parent}${path.sep}`);

/** Optional inputs remain protected against output overlap when they are supplied. */
export const validatePaths = (options: CliOptions): string | null => {
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
  const root = path.resolve(options.projectRoot);
  if (!isDirectory(root))
    return 'PROJECT_ROOT_INVALID: --project-root 必须是现有目录';
  const fm = path.resolve(options.fm);
  if (
    options.fmCheck !== undefined &&
    isInside(path.resolve(options.fmCheck), fm)
  ) {
    return 'FM_CHECK_INPUT_CONFLICT: FM 检查结果必须位于模型目录之外';
  }
  if (options.api !== undefined && isInside(path.resolve(options.api), fm)) {
    return 'API_INPUT_CONFLICT: API 覆盖文件必须位于 FM 根目录之外';
  }
  if (options.command !== 'project' && options.command !== 'deliver')
    return null;
  const out = path.resolve(options.out ?? defaultOutputDirectory(root));
  if (!isInside(out, root))
    return 'OUTPUT_OUTSIDE_PROJECT: 输出目录必须位于项目根内';
  for (const input of [options.fm, options.api, options.fmCheck]) {
    if (
      input !== undefined &&
      (isInside(out, path.resolve(input)) || isInside(path.resolve(input), out))
    ) {
      return 'OUTPUT_INPUT_CONFLICT: 输出不能与模型、覆盖文件或检查报告重叠';
    }
  }
  return null;
};

const parse = (argv: readonly string[]): CliOptions | string => {
  const [command, ...rest] = argv;
  if (
    command !== 'inspect' &&
    command !== 'check' &&
    command !== 'project' &&
    command !== 'deliver'
  )
    return USAGE;
  const values: Record<string, string> = {};
  const flags = new Set(['project-root', 'fm', 'fm-check', 'api', 'out']);
  for (let index = 0; index < rest.length; index += 2) {
    const token = rest[index]!;
    const key = token.slice(2);
    if (!token.startsWith('--') || !flags.has(key))
      return `unexpected argument: ${token}`;
    if (key in values) return `duplicate argument: ${token}`;
    const value = rest[index + 1];
    if (value === undefined || value.startsWith('--'))
      return `${token} needs a value`;
    values[key] = value;
  }
  return {
    command,
    projectRoot: values['project-root'] ?? '',
    fm: values['fm'] ?? '',
    ...(values['fm-check'] === undefined
      ? {}
      : { fmCheck: values['fm-check'] }),
    ...(values['api'] === undefined ? {} : { api: values['api'] }),
    ...(values['out'] === undefined ? {} : { out: values['out'] }),
  };
};

const refused = (code: string, message: string): CliResult => ({
  output: { valid: false, diagnostics: [{ code, severity: 'error', message }] },
  exitCode: 1,
});

/** Preview and export current inputs; stale evidence is a gap, not a reason to hide the draft. */
export const runCli = async (argv: readonly string[]): Promise<CliResult> => {
  const options = parse(argv);
  if (typeof options === 'string')
    return { output: null, error: options, exitCode: 1 };
  const problem = validatePaths(options);
  if (problem !== null) return { output: null, error: problem, exitCode: 1 };

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

const main = async (): Promise<void> => {
  const result = await runCli(process.argv.slice(2));
  if (result.error !== undefined) process.stderr.write(`${result.error}\n`);
  if (result.output !== null)
    process.stdout.write(canonicalJson(result.output));
  process.exitCode = result.exitCode;
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  void main();
