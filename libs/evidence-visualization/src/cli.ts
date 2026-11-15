#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCli } from './commands.js';

export { runCli } from './commands.js';
export type { CliResult } from './commands.js';

const main = async (): Promise<void> => {
  console.warn(
    '[DEPRECATED] evidence-workbench generate: use evidence review instead.',
  );
  const result = await runCli(process.argv.slice(2));
  if (result.error !== undefined) process.stderr.write(`${result.error}\n`);
  if (result.output !== null)
    process.stdout.write(
      typeof result.output === 'string'
        ? result.output
        : `${JSON.stringify(result.output, null, 2)}\n`,
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
