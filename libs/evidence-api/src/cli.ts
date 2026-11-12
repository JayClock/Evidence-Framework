#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFm } from './adapter/fmAdapter.js';
import { canonicalJson } from './canonicalJson.js';
import { hasErrors, hasGaps, type Diagnostic } from './diagnostics.js';
import { inspectSummary } from './inspect.js';
import { loadDesign, validateProjection } from './loader/apiLoader.js';
import { buildProjection, type Projection } from './projector.js';
import {
  defaultOutputDirectory,
  renderOutputs,
  writeOutput,
} from './renderer/outputRenderer.js';

/**
 * The `evidence-api` command.
 *
 * Three subcommands over one contract: `inspect` lists what the model offers,
 * `check` says whether a design is ready, and `project` writes the delivery tree.
 * The exit status is the same for all three — 0 clean, 1 a blocking problem, 3
 * open questions — so a script can gate on it.
 */

export type Command = 'inspect' | 'check' | 'project';

export interface CliOptions {
  command: Command;
  projectRoot: string;
  fm: string;
  fmCheck: string;
  api?: string;
  out?: string;
}

export interface CliResult {
  /** Text written to stdout. */
  output: unknown;
  /** Text written to stderr. */
  error?: string;
  exitCode: number;
}

const USAGE =
  'usage: evidence-api <inspect|check|project> --project-root DIR --fm DIR --fm-check FILE [--api FILE] [--out DIR]';

const isDirectory = (target: string): boolean => {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
};

const isInside = (child: string, parent: string): boolean =>
  child === parent || child.startsWith(`${parent}${path.sep}`);

/**
 * Why the paths cannot describe this run.
 *
 * Every argument is absolute because a relative one would resolve against
 * whatever directory the process happens to start in, and the output must not
 * sit inside an input: the projection would then read its own previous result.
 */
export const validatePaths = (
  options: CliOptions,
  designSourcePaths: readonly string[] = [],
): string | null => {
  const required: [string | undefined, string, boolean][] = [
    [options.projectRoot, 'project-root', true],
    [options.fm, 'fm', true],
    [options.fmCheck, 'fm-check', true],
    [options.api, 'api', options.command !== 'inspect'],
    [options.out, 'out', false],
  ];

  for (const [value, name, needed] of required) {
    if (value === undefined || value === '') {
      if (needed) {
        return `--${name} 是必需的`;
      }

      continue;
    }

    if (!path.isAbsolute(value)) {
      return `PATH_NOT_ABSOLUTE: --${name} 必须使用绝对路径`;
    }
  }

  const projectRoot = path.resolve(options.projectRoot);

  if (!isDirectory(projectRoot)) {
    return 'PROJECT_ROOT_INVALID: --project-root 必须是现有目录';
  }

  const fm = path.resolve(options.fm);
  const fmCheck = path.resolve(options.fmCheck);
  const api = options.api === undefined ? undefined : path.resolve(options.api);

  if (isInside(fmCheck, fm)) {
    return 'FM_CHECK_INPUT_CONFLICT: FM 检查结果必须位于模型目录之外';
  }

  if (api !== undefined && isInside(api, fm)) {
    return 'API_INPUT_CONFLICT: API 设计文件必须位于 FM 根目录之外';
  }

  if (options.command !== 'project') {
    return null;
  }

  const out = path.resolve(options.out ?? defaultOutputDirectory(projectRoot));

  if (!isInside(out, projectRoot)) {
    return 'OUTPUT_OUTSIDE_PROJECT: 输出目录必须位于项目根内';
  }

  for (const protectedPath of [
    fm,
    ...(api === undefined ? [] : [api]),
    fmCheck,
    ...designSourcePaths.map((source) => path.resolve(projectRoot, source)),
  ]) {
    if (isInside(out, protectedPath) || isInside(protectedPath, out)) {
      return 'OUTPUT_INPUT_CONFLICT: 输出不能与 FM、API 输入、来源或 Skill 安装目录重叠';
    }
  }

  if (isDirectory(out)) {
    return null;
  }

  return isDirectory(path.dirname(out))
    ? null
    : 'OUTPUT_PARENT_INVALID: 输出父目录必须已存在';
};

const parse = (
  argv: readonly string[],
): { command: Command; values: Record<string, string> } | string => {
  const [command, ...rest] = argv;

  if (command !== 'inspect' && command !== 'check' && command !== 'project') {
    return USAGE;
  }

  const values: Record<string, string> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] as string;

    if (!token.startsWith('--')) {
      return `unexpected argument: ${token}`;
    }

    const value = rest[index + 1];

    if (value === undefined) {
      return `${token} needs a value`;
    }

    values[token.slice(2)] = value;
    index += 1;
  }

  return { command, values };
};

/** The findings a CLI report prints, in the shape the reports use. */
const printed = (diagnostic: Diagnostic): Record<string, unknown> => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  targetRef: diagnostic.targetRef ?? null,
  location: diagnostic.location ?? null,
  relatedRefs: [...(diagnostic.relatedRefs ?? [])],
  ...(diagnostic.gapKey === undefined ? {} : { gapKey: diagnostic.gapKey }),
  ...(diagnostic.category === undefined ? {} : { category: diagnostic.category }),
});

const refused = (code: string, message: string): CliResult => ({
  output: {
    valid: false,
    diagnostics: [{ code, severity: 'error', message }],
  },
  exitCode: 1,
});

const reportOf = (
  projection: Projection,
  diagnostics: readonly Diagnostic[],
): Record<string, unknown> => {
  const complete = diagnostics.length === 0 && projection.http?.complete === true;

  if (projection.http !== null) {
    projection.http.complete = complete;
  }

  return {
    valid: !hasErrors(diagnostics),
    complete,
    interfaceCount: projection.capabilities.length,
    gapCount: diagnostics.filter((item) => item.severity === 'gap').length,
    diagnostics: diagnostics.map(printed),
  };
};

const sourcePathsOf = (design: Record<string, unknown>): string[] =>
  Array.isArray(design['sources'])
    ? design['sources']
        .map((source) =>
          typeof source === 'object' && source !== null
            ? (source as Record<string, unknown>)['path']
            : undefined,
        )
        .filter((value): value is string => typeof value === 'string')
    : [];

/**
 * Runs one command.
 *
 * Nothing is written while a question is open: a partially resolved tree would be
 * read as a finished one, and the next consumer has no way to tell.
 */
export const runCli = async (argv: readonly string[]): Promise<CliResult> => {
  const parsed = parse(argv);

  if (typeof parsed === 'string') {
    return { output: null, error: parsed, exitCode: 1 };
  }

  const { command, values } = parsed;
  const options: CliOptions = {
    command,
    projectRoot: values['project-root'] ?? '',
    fm: values['fm'] ?? '',
    fmCheck: values['fm-check'] ?? '',
    ...(values['api'] === undefined ? {} : { api: values['api'] }),
    ...(values['out'] === undefined ? {} : { out: values['out'] }),
  };

  const pathProblem = validatePaths(options);

  if (pathProblem !== null) {
    return { output: null, error: pathProblem, exitCode: 1 };
  }

  let check: unknown;

  try {
    check = JSON.parse(readFileSync(options.fmCheck, 'utf8')) as unknown;
  } catch (error) {
    return refused(
      'FM_CHECK_INVALID',
      error instanceof Error ? error.message : String(error),
    );
  }

  const loaded = await loadFm(options.fm, check);

  if (loaded.index === null) {
    return {
      output: {
        valid: false,
        diagnostics: loaded.diagnostics.map(printed),
      },
      exitCode: 1,
    };
  }

  if (command === 'inspect') {
    return { output: inspectSummary(loaded.index), exitCode: 0 };
  }

  const designPath = options.api as string;
  let designContent: string;

  try {
    designContent = readFileSync(designPath, 'utf8');
  } catch (error) {
    return refused(
      'DESIGN_INVALID',
      error instanceof Error ? error.message : String(error),
    );
  }

  const loadedDesign = loadDesign(designPath, designContent);

  if (loadedDesign.design === null || loadedDesign.diagnostics.length > 0) {
    return {
      output: {
        valid: false,
        diagnostics: loadedDesign.diagnostics.map(printed),
      },
      exitCode: 1,
    };
  }

  const design = loadedDesign.design;
  const outputProblem = validatePaths(options, sourcePathsOf(design));

  if (outputProblem !== null) {
    return { output: null, error: outputProblem, exitCode: 1 };
  }

  const built = buildProjection({
    design,
    index: loaded.index,
    projectRoot: options.projectRoot,
    apiContent: designContent,
  });
  const projectionProblems = validateProjection(built.projection);

  for (const problem of projectionProblems) {
    built.projection.diagnostics.push(printed(problem));
  }

  const allDiagnostics: Diagnostic[] = [
    ...built.diagnostics,
    ...projectionProblems.map((problem) => problem),
  ];
  const summary = reportOf(built.projection, allDiagnostics);

  if (command === 'check') {
    return {
      output: { ...summary, projection: built.projection },
      exitCode: hasErrors(allDiagnostics) ? 1 : hasGaps(allDiagnostics) ? 3 : 0,
    };
  }

  if (summary['complete'] !== true) {
    return {
      output: summary,
      exitCode: hasErrors(allDiagnostics) ? 1 : 3,
    };
  }

  const out = options.out ?? defaultOutputDirectory(options.projectRoot);

  try {
    writeOutput(
      out,
      renderOutputs(built.projection as unknown as Record<string, unknown>),
    );
  } catch (error) {
    return {
      output: null,
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }

  return { output: { ...summary, out }, exitCode: 0 };
};

/** Entry point when this file is run directly. */
const main = async (): Promise<void> => {
  const result = await runCli(process.argv.slice(2));

  if (result.error !== undefined) {
    process.stderr.write(`${result.error}\n`);
  }

  if (result.output !== null) {
    process.stdout.write(canonicalJson(result.output));
  }

  process.exitCode = result.exitCode;
};

// Compare the resolved entry path, not its basename: every package ships a
// `cli.js`, so a suffix test runs this command whenever another one is imported.
if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  void main();
}
