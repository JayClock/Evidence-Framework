#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '@evidence-poc/evidence-api';
import { runCli } from './commands.js';

export { runCli, runDiff, runApiCommand, validatePaths } from './commands.js';
export type {
  Command,
  CliOptions,
  DiffCliOptions,
  CliResult,
} from './commands.js';

const main = async (): Promise<void> => {
  console.warn(
    '[DEPRECATED] evidence-api: use evidence export/diff, or evidence api <command> for legacy projections.',
  );
  const result = await runCli(process.argv.slice(2));
  if (result.error !== undefined) process.stderr.write(`${result.error}\n`);
  if (result.output !== null)
    process.stdout.write(
      typeof result.output === 'string'
        ? result.output
        : canonicalJson(result.output),
    );
  process.exitCode = result.exitCode;
};

const entry = process.argv[1];
if (
  entry !== undefined &&
  pathToFileURL(realpathSync(entry)).href === import.meta.url
) {
  void main();
}
