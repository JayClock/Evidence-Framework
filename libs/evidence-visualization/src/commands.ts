import path from 'node:path';
import { cac } from 'cac';
import {
  generateWorkbench,
  reviewPagePath,
} from './generate/generateWorkbench.js';

export interface CliResult {
  output: unknown;
  error?: string;
  exitCode: number;
}

export interface ReviewOptions {
  projectRoot: string;
  out?: string;
  scopeRefs?: readonly string[];
  requireApi?: boolean;
  skipAi?: boolean;
  assetsDirectory?: string;
}

/** Shared execution API for `evidence review` and the deprecated binary. */
export async function runReviewCommand(
  options: ReviewOptions,
): Promise<CliResult> {
  try {
    const generated = await generateWorkbench({
      projectRoot: options.projectRoot,
      output: options.out ?? reviewPagePath(options.projectRoot),
      ...(options.scopeRefs === undefined
        ? {}
        : { scopeRefs: options.scopeRefs }),
      requireApi: options.requireApi === true,
      storyOptions: { skipAi: options.skipAi === true },
      ...(options.assetsDirectory === undefined
        ? {}
        : { assetsDirectory: options.assetsDirectory }),
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
    return {
      output: null,
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

const USAGE =
  'usage: evidence-workbench generate --project-root DIR [--out FILE] [--scope CONTEXT]... [--require-api] [--skip-ai] [--assets DIR]';

/** Compatibility syntax adapter; no hand-written argv scanner. */
export async function runCli(argv: readonly string[]): Promise<CliResult> {
  const cli = cac('evidence-workbench');
  cli
    .command('generate')
    .option('--project-root <dir>', 'Project root (required)')
    .option('-o, --out <file>', 'HTML output path')
    .option('--scope <id>', 'Context scope (repeatable)', { type: [] })
    .option('--require-api', 'Require complete API projection')
    .option(
      '--skip-ai',
      'Generate story fact cards without AI or network access',
    )
    .option('--assets <dir>', 'Workbench assets')
    .action((options: Record<string, unknown>) => {
      if (
        typeof options.projectRoot !== 'string' ||
        !options.projectRoot.trim()
      )
        throw new Error('--project-root 是必需的');
      return runReviewCommand({
        projectRoot: options.projectRoot,
        ...(options.out === undefined ? {} : { out: String(options.out) }),
        ...(options.scope === undefined
          ? {}
          : { scopeRefs: options.scope as string[] }),
        requireApi: options.requireApi === true,
        skipAi: options.skipAi === true,
        ...(options.assets === undefined
          ? {}
          : { assetsDirectory: path.resolve(String(options.assets)) }),
      });
    });
  cli.help();
  let help = false;
  cli.outputHelp = () => {
    help = true;
  };
  try {
    cli.parse(['node', 'evidence-workbench', ...argv], { run: false });
    if (help) return { output: `${USAGE}\n`, exitCode: 0 };
    if (!cli.matchedCommand) throw new Error(USAGE);
    if (
      argv.some((arg) => arg === '-o' || arg.startsWith('-o=')) &&
      argv.some((arg) => arg === '--out' || arg.startsWith('--out='))
    )
      throw new Error('Duplicate option: --out');
    if (cli.args.length || cli.options['--'].length)
      throw new Error('Unexpected positional arguments');
    for (const [name, value] of Object.entries(cli.options)) {
      if (name === '--') continue;
      if (name === 'scope' && Array.isArray(value)) {
        const scopes = value.filter((scope) => scope !== undefined);
        if (scopes.some((scope) => typeof scope !== 'string' || !scope.trim()))
          throw new Error('--scope needs a value');
        if (scopes.length) cli.options.scope = scopes;
        else delete cli.options.scope;
      } else if (Array.isArray(value))
        throw new Error(`Duplicate option: --${name}`);
      if (typeof value === 'string' && !value.trim())
        throw new Error(`--${name} needs a value`);
    }
    return (await cli.runMatchedCommand()) as CliResult;
  } catch (error) {
    return {
      output: null,
      error: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}
