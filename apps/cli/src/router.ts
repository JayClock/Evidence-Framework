import { testCommand } from './commands/test.js';
import { exportCommand } from './commands/export.js';
import { checkCommand } from './commands/check.js';
import { diffCommand } from './commands/diff.js';
import type { CommandContext } from './context.js';

const HELP = `Evidence — model-driven contracts and black-box acceptance

Usage:
  evidence export [--model path] [--openapi] [--tests] [--format stepci|hurl] [--out dir] [--verify]
  evidence test --target URL [--scenarios file|dir] [--as-of UTC] [--timeout ms] [--verbose|--json|--report markdown|junit]
                [--gate regression|dod] [--baseline-model path] [--filter pattern] [--tag label ...]
                [--detect-drift] [--strict-drift] [--allow-pending] [--report-dir dir]
  evidence check [model] [--json]
  evidence diff api <old-model> <new-model> [--format json|markdown]
  evidence --help

Model paths may be source directories or *.evidence.json bundles.
Gates are strict by default. --allow-pending is DoD-only and never reports failed tests as passed.
Regression runs original baseline tests; DoD runs new/changed complete flows.
Without a baseline, gates require explicit regression/dod tags in example test metadata.
`;

export async function dispatch(
  argv: readonly string[],
  context: CommandContext = {
    cwd: process.cwd(),
    stdout: (text) => process.stdout.write(`${text}\n`),
    stderr: (text) => process.stderr.write(`${text}\n`),
    color: Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env),
  },
): Promise<number> {
  try {
    const [command, ...rest] = argv;
    if (command === undefined || ['help', '--help', '-h'].includes(command)) {
      context.stdout(HELP);
      return 0;
    }
    if (
      ['export', 'test', 'check', 'diff'].includes(command) &&
      (rest.includes('--help') || rest.includes('-h'))
    ) {
      context.stdout(HELP);
      return 0;
    }
    if (command === 'test') return await testCommand(rest, context);
    if (command === 'export') return await exportCommand(rest, context);
    if (command === 'check') return await checkCommand(rest, context);
    if (command === 'diff') return await diffCommand(rest, context);
    throw new Error(`Unknown command: ${command}. Run evidence --help.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (argv.includes('--json'))
      context.stdout(JSON.stringify({ passed: false, error: message }));
    else context.stderr(`Error: ${message}`);
    return 1;
  }
}
