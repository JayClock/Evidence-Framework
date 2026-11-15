#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runEvidenceModelCommand } from './modelCli.js';

export { runEvidenceModelCommand } from './modelCli.js';

const main = async (): Promise<void> => {
  console.warn(
    '[DEPRECATED] evidence-model: use evidence pack/unpack/inspect/check/compile/lineage instead.',
  );
  process.exitCode = await runEvidenceModelCommand(process.argv.slice(2));
};

const entry = process.argv[1];
if (
  entry !== undefined &&
  pathToFileURL(realpathSync(entry)).href === import.meta.url
) {
  void main();
}
