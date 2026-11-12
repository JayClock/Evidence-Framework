#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorkbenchInputError } from './generate/collectWorkbench.js';
import { generateWorkbench, reviewPagePath } from './generate/generateWorkbench.js';

/**
 * The `evidence-workbench` command.
 *
 * One verb over one page: read the checked model, project it, write the offline
 * workbench. Exit 0 when the page was written, 1 when it was not — and when it
 * was not, the previous page is still there, because a review reads snapshots.
 */

export interface CliResult {
  /** Value printed to stdout as JSON, or null for nothing. */
  output: unknown;
  error?: string;
  exitCode: number;
}

const USAGE =
  'usage: evidence-workbench generate --project-root DIR [--out FILE] [--scope CONTEXT]... [--require-api] [--assets DIR]';

interface ParsedArguments {
  command: string;
  values: Map<string, string[]>;
}

const parse = (argv: readonly string[]): ParsedArguments | string => {
  const [command, ...rest] = argv;

  if (command === undefined) {
    return USAGE;
  }

  const values = new Map<string, string[]>();
  let index = 0;

  while (index < rest.length) {
    const token = rest[index] as string;

    if (!token.startsWith('--')) {
      return `无法识别的参数：${token}\n${USAGE}`;
    }

    const name = token.slice(2);

    if (name === 'require-api') {
      values.set(name, ['true']);
      index += 1;
      continue;
    }

    const value = rest[index + 1];

    if (value === undefined) {
      return `--${name} 需要一个值`;
    }

    values.set(name, [...(values.get(name) ?? []), value]);
    index += 2;
  }

  return { command, values };
};

const single = (
  values: Map<string, string[]>,
  name: string,
): string | undefined => values.get(name)?.at(-1);

/**
 * Generates the page and reports what it contains.
 *
 * The summary is the same shape the Python generator printed, so a caller that
 * already parses one can read the other.
 */
export const runCli = async (argv: readonly string[]): Promise<CliResult> => {
  const parsed = parse(argv);

  if (typeof parsed === 'string') {
    return { output: null, error: parsed, exitCode: 1 };
  }

  if (parsed.command !== 'generate') {
    return {
      output: null,
      error: `无法识别的子命令：${parsed.command}\n${USAGE}`,
      exitCode: 1,
    };
  }

  const projectRoot = single(parsed.values, 'project-root');

  if (projectRoot === undefined || projectRoot === '') {
    return { output: null, error: '--project-root 是必需的', exitCode: 1 };
  }

  const scopeRefs = parsed.values.get('scope');
  const assetsDirectory = single(parsed.values, 'assets');

  try {
    const generated = await generateWorkbench({
      projectRoot,
      output: single(parsed.values, 'out') ?? reviewPagePath(projectRoot),
      ...(scopeRefs === undefined ? {} : { scopeRefs }),
      requireApi: parsed.values.has('require-api'),
      ...(assetsDirectory === undefined
        ? {}
        : { assetsDirectory: path.resolve(assetsDirectory) }),
    });

    return {
      output: {
        output: generated.output,
        counts: generated.data.counts,
        validation: generated.data.validation,
      },
      exitCode: 0,
    };
  } catch (error) {
    if (error instanceof WorkbenchInputError || error instanceof Error) {
      return { output: null, error: error.message, exitCode: 1 };
    }

    return { output: null, error: String(error), exitCode: 1 };
  }
};

/** Entry point when this file is run directly. */
const main = async (): Promise<void> => {
  const result = await runCli(process.argv.slice(2));

  if (result.error !== undefined) {
    process.stderr.write(`${result.error}\n`);
  }

  if (result.output !== null) {
    process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
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
