import { cac, type CAC } from 'cac';
import { testCommand } from './commands/test.js';
import { exportCommand } from './commands/export.js';
import { checkCommand } from './commands/check.js';
import { diffCommand } from './commands/diff.js';
import { modelCommand } from './commands/model.js';
import { reviewCommand } from './commands/review.js';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from './context.js';

const defaultContext = (): CommandContext => ({
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  color: Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env),
});

export function createCli(context: CommandContext = defaultContext()): CAC {
  const cli = cac('evidence');
  cli
    .command('check [model]', 'Static model consistency and scope checks')
    .option('--scope <id>', 'Context responsibility scope (repeatable)', {
      type: [],
    })
    .option('--json', 'Machine-readable report')
    .action((model: string | undefined, options: CommandOptions) =>
      checkCommand(model, options, context),
    );
  cli
    .command('test', 'Run black-box HTTP acceptance suites')
    .option('--target <url>', 'Backend service base URL (required)')
    .option('--scenarios <path>', 'Step CI YAML file or directory', {
      default: 'dist',
    })
    .option('--as-of <utc>', 'Business timestamp')
    .option('--timeout <ms>', 'Request timeout', { default: '5000' })
    .option('--verbose', 'Detailed failures')
    .option('--json', 'Machine-readable report')
    .option('--gate <gate>', 'regression | dod')
    .option('--baseline-model <path>', 'Baseline model for the gate')
    .option('--filter <pattern>', 'Filter acceptance flows')
    .option('--tag <label>', 'Filter tags (repeatable)', { type: [] })
    .option('--detect-drift', 'Report response contract drift')
    .option('--strict-drift', 'Fail on response contract drift')
    .option(
      '--allow-pending',
      'Allow pending DoD results (never turn failures green)',
    )
    .option('--report <format>', 'markdown | junit')
    .option('--report-dir <dir>', 'Write JSON, Markdown and JUnit reports')
    .action((options: CommandOptions) => testCommand(options, context));
  cli
    .command('export', 'Export OpenAPI 3.1 and HTTP acceptance suites')
    .option('--model <path>', 'Model directory or bundle', {
      default: '.evidence/fm',
    })
    .option('-o, --out <dir>', 'Dedicated output directory', {
      default: 'dist',
    })
    .option('--openapi', 'Export only the contract')
    .option('--tests', 'Export only acceptance suites')
    .option('--format <format>', 'stepci | hurl', { default: 'stepci' })
    .option('--verify', 'Read-only exact byte verification')
    .action((options: CommandOptions) => exportCommand(options, context));
  cli
    .command(
      'diff <base> <target>',
      'Compare contracts (legacy: evidence diff api <base> <target>)',
    )
    .option(
      '--format <format>',
      'json | markdown (default: markdown; legacy: json)',
    )
    .action((base: string, target: string, options: CommandOptions) =>
      diffCommand(base, target, options, context),
    );
  for (const [command, target, description] of [
    ['pack', 'modelDir', 'Pack a model tree into one bundle'],
    ['unpack', 'bundleFile', 'Restore a model tree from a bundle'],
    ['compile', 'modelDir', 'Compile a checked model snapshot'],
    ['inspect', 'model', 'Inspect model files and counts'],
    ['lineage', 'modelDir', 'Export attribute lineage'],
  ] as const) {
    const registered = cli
      .command(`${command} <${target}>`, description)
      .action((source: string, options: CommandOptions) =>
        modelCommand(command, source, options, context),
      );
    if (command === 'inspect')
      registered.option('--json', 'Machine-readable summary');
    else registered.option('-o, --out <path>', 'Output path');
    if (command === 'compile' || command === 'lineage')
      registered.option('--compact', 'Compact snapshot');
    if (command !== 'inspect')
      registered.option('--sort-keys', 'Stable object key order');
  }
  cli
    .command('review', 'Build a single-file offline review workbench')
    .option('--project-root <dir>', 'Project root', { default: '.' })
    .option('-o, --out <file>', 'HTML output path')
    .option('--scope <id>', 'Context responsibility scope (repeatable)', {
      type: [],
    })
    .option('--require-api', 'Require a complete API projection')
    .option('--assets <dir>', 'Workbench assets directory')
    .action((options: CommandOptions) => reviewCommand(options, context));
  cli.help();
  cli.version('0.0.1');
  // cac's default printer writes to console. Render its registered metadata to
  // the injected output instead, keeping dispatch embeddable and JSON clean.
  cli.outputHelp = () => {
    const command = cli.matchedCommand;
    const commands = command ? [command] : cli.commands;
    const options = [...(command?.options ?? []), ...cli.globalCommand.options];
    context.stdout(
      [
        'Evidence — model-driven contracts and black-box acceptance',
        `Usage: evidence ${command?.rawName ?? '<command> [options]'}`,
        ...commands.map((entry) => `  ${entry.rawName}  ${entry.description}`),
        'Options:',
        ...options.map(
          (option) =>
            `  ${option.rawName}  ${option.description}${option.config.default === undefined ? '' : ` (default: ${option.config.default})`}`,
        ),
      ].join('\n'),
    );
  };
  cli.outputVersion = () => context.stdout('evidence/0.0.1');
  return cli;
}

function validateInvocation(cli: CAC): void {
  const command = cli.matchedCommand;
  if (!command)
    throw new Error(
      `Unknown command: ${cli.args[0] ?? ''}. Run evidence --help.`,
    );
  // cac uses arrays for repeated options; only explicitly repeatable flags may
  // accept them. This also rejects duplicates expressed via short aliases.
  for (const [name, value] of Object.entries(cli.options)) {
    if (name === '--') {
      if ((value as unknown[]).length)
        throw new Error('Unexpected arguments after --');
      continue;
    }
    if (Array.isArray(value) && value.every((item) => item === undefined)) {
      delete cli.options[name];
      continue;
    }
    const option = command.options.find((entry) => entry.names.includes(name));
    if (Array.isArray(value) && !Array.isArray(option?.config.type))
      throw new Error(`Duplicate option: --${name}`);
    if (Array.isArray(value)) {
      if (value.some((item) => item === true || item === false))
        throw new Error(`Expected a nonempty option value: --${name}`);
      cli.options[name] = value.map(stringOption);
    }
  }
  if (cli.args.length > command.args.length)
    throw new Error(`Unexpected arguments. Usage: evidence ${command.rawName}`);
}

export async function dispatch(
  argv: readonly string[],
  context: CommandContext = defaultContext(),
): Promise<number> {
  try {
    const args = [...argv];
    if (args[0] === 'diff' && args[1] === 'api') {
      args.splice(1, 1);
      if (
        !args.some((arg) => arg === '--format' || arg.startsWith('--format='))
      )
        args.push('--format', 'json');
    }
    if (args.length === 0 || args[0] === 'help') args.splice(0, 1, '--help');
    const cli = createCli(context);
    cli.parse(['node', 'evidence', ...args], { run: false });
    if (cli.options.help || cli.options.version) return 0;
    cli.args = [...cli.args, ...cli.options['--']];
    cli.options['--'] = [];
    validateInvocation(cli);
    return (await cli.runMatchedCommand()) as number;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv.includes('--json'))
      context.stdout(JSON.stringify({ passed: false, error: message }));
    else context.stderr(`Error: ${message}`);
    return 1;
  }
}
