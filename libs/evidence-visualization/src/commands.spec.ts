import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unpackModelBundle } from '@evidence-poc/evidence-model-io';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { runCli } from './commands.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-review-cli-'));
  await unpackModelBundle(
    fileURLToPath(
      new URL(
        '../../../examples/acceptance/procurement.evidence.json',
        import.meta.url,
      ),
    ),
    path.join(root, '.evidence/fm'),
  );
});
afterEach(() => rm(root, { recursive: true, force: true }));

it('adapts legacy generate syntax to the shared review operation', async () => {
  const output = path.join(root, 'legacy.html');
  const result = await runCli([
    'generate',
    '--project-root',
    root,
    '--skip-ai',
    '-o',
    output,
  ]);
  expect(result.exitCode, result.error).toBe(0);
  expect(result.output).toMatchObject({ output });
  const html = await readFile(output, 'utf8');
  expect(html).toContain('<html');
  const data = JSON.parse(
    /id="workbench-data">(.*?)<\/script>/s.exec(html)![1]!,
  );
  expect(data.stories[0].flowId).toBe('payment');
});

it('provides help and rejects missing, unknown, duplicate and malformed options', async () => {
  expect((await runCli(['generate', '--help'])).exitCode).toBe(0);
  for (const args of [
    [],
    ['unknown'],
    ['generate'],
    ['generate', '--project-root'],
    ['generate', '--project-root', root, '--bad'],
    ['generate', '--project-root', root, '--project-root', root],
    ['generate', '--project-root', root, '--scope'],
    ['generate', '--project-root', root, '--scope', ''],
    ['generate', '--project-root', root, '--out', 'a', '-o', 'b'],
    ['generate', '--project-root', root, 'extra'],
  ]) {
    const result = await runCli(args);
    expect(result.exitCode, args.join(' ')).toBe(1);
    expect(result.output).toBeNull();
    expect(result.error).toBeTruthy();
  }
});
