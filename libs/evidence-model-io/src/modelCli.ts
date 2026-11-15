import { cac } from 'cac';
import { runModelCommand, type ModelCommandContext } from './commands.js';

/** Legacy syntax adapter. Operations are shared with `evidence`, not reimplemented. */
export async function runEvidenceModelCommand(
  argv: readonly string[],
): Promise<number> {
  const context: ModelCommandContext = {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
  };
  const cli = cac('evidence-model');
  for (const command of [
    'pack',
    'unpack',
    'inspect',
    'check',
    'compile',
    'lineage',
  ]) {
    const registered = cli
      .command(`${command} <target>`, `Use evidence ${command} instead`)
      .action((target: string, options: Record<string, unknown>) =>
        runModelCommand(
          command,
          {
            target,
            out: options.out === undefined ? undefined : String(options.out),
            scopes: (options.scope as string[] | undefined) ?? [],
            compact: options.compact === true,
            sortKeys: options.sortKeys === true,
            json: options.json === true,
          },
          context,
        ),
      );
    if (command === 'inspect' || command === 'check')
      registered.option('--json', 'JSON report');
    if (command === 'check')
      registered.option('--scope <id>', 'Context scope (repeatable)', {
        type: [],
      });
    if (!['inspect', 'check'].includes(command))
      registered.option('-o, --out <path>', 'Output path');
    if (!['inspect', 'check'].includes(command))
      registered.option('--sort-keys', 'Sort object keys');
    if (command === 'compile' || command === 'lineage')
      registered.option('--compact', 'Compact JSON');
  }
  cli.help();
  cli.outputHelp = () =>
    context.stdout(
      [
        'Usage: evidence-model <command> [options]',
        ...cli.commands.map(
          (command) => `  ${command.rawName}  ${command.description}`,
        ),
        'Options: --out, -o <path>; --sort-keys; --compact; --scope <id> (repeatable); --json',
      ].join('\n'),
    );
  try {
    cli.parse(['node', 'evidence-model', ...argv], { run: false });
    if (cli.options.help) return 0;
    if (!argv.length) {
      cli.outputHelp();
      return 2;
    }
    if (!cli.matchedCommand) throw new Error(`未知命令 ${cli.args[0]}`);
    // mri can overwrite mixed aliases before cac exposes repeated values.
    if (
      argv.some((arg) => arg === '-o' || arg.startsWith('-o=')) &&
      argv.some((arg) => arg === '--out' || arg.startsWith('--out='))
    )
      throw new Error('Duplicate option: --out');
    cli.args = [...cli.args, ...cli.options['--']];
    if (cli.args.length > 1) throw new Error('Unexpected positional arguments');
    for (const [name, value] of Object.entries(cli.options)) {
      if (name === '--') continue;
      if (name === 'scope' && Array.isArray(value)) {
        const scopes = value.filter((scope) => scope !== undefined);
        if (scopes.some((scope) => typeof scope !== 'string' || !scope.trim()))
          throw new Error('--scope needs a value');
        cli.options.scope = scopes;
      } else if (Array.isArray(value))
        throw new Error(`Duplicate option: --${name}`);
      if (typeof value === 'string' && !value.trim())
        throw new Error(`--${name} needs a value`);
    }
    return (await cli.runMatchedCommand()) as number;
  } catch (error) {
    context.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}
