import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const binary = path.join(repo, 'apps/cli/dist/cli.js');
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-model-cli-'));
  await writeFile(
    path.join(root, 'source.evidence.json'),
    await readFile(
      path.join(repo, 'examples/acceptance/procurement.evidence.json'),
    ),
  );
});
afterEach(() => rm(root, { recursive: true, force: true }));

function invoke(args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        [binary, ...args],
        { cwd: root, timeout: 15000 },
        (error, stdout, stderr) => {
          resolve({
            code: error ? Number(error.code) || 1 : 0,
            stdout,
            stderr,
          });
        },
      );
    },
  );
}

it('round trips, compiles, derives lineage and generates an offline review in the caller cwd', async () => {
  const unpacked = await invoke([
    'unpack',
    'source.evidence.json',
    '-o',
    '.evidence/fm',
  ]);
  expect(unpacked.code, unpacked.stderr).toBe(0);
  for (const args of [
    ['pack', '.evidence/fm', '--out=packed.evidence.json', '--sort-keys'],
    ['compile', '.evidence/fm', '-o', 'derived/compiled.json', '--compact'],
    ['lineage', '.evidence/fm', '--out', 'derived/lineage.json'],
    ['review', '--out', 'review.html'],
  ]) {
    const result = await invoke(args);
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toBe('');
  }
  const inspect = await invoke(['inspect', 'packed.evidence.json', '--json']);
  expect(inspect.code, inspect.stderr).toBe(0);
  expect(JSON.parse(inspect.stdout)).toMatchObject({
    modelId: 'procurement-evolution',
    issues: [],
  });
  const compiled = await readFile(
    path.join(root, 'derived/compiled.json'),
    'utf8',
  );
  expect(compiled.trim().split('\n')).toHaveLength(1);
  expect(JSON.parse(compiled)).toHaveProperty('entities');
  expect(
    JSON.parse(await readFile(path.join(root, 'derived/lineage.json'), 'utf8')),
  ).toBeTruthy();
  expect(await readFile(path.join(root, 'review.html'), 'utf8')).toContain(
    '<html',
  );
  const check = await invoke([
    'check',
    'packed.evidence.json',
    '--scope',
    'context.procurement',
    '--json',
  ]);
  expect(JSON.parse(check.stdout)).toHaveProperty('complete');
}, 20000);

it('supports direct diff with a Markdown default, explicit JSON and legacy JSON', async () => {
  const args = ['source.evidence.json', 'source.evidence.json'];
  const markdown = await invoke(['diff', ...args]);
  expect(markdown.code, markdown.stderr).toBe(0);
  expect(markdown.stdout).toContain('#');
  for (const prefix of [
    ['diff', '--format=json'],
    ['diff', 'api'],
  ]) {
    const result = await invoke([...prefix, ...args]);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      hasBreakingChanges: false,
    });
  }
}, 20000);

it('rejects invalid and duplicate options and missing or extra arguments without writes', async () => {
  for (const args of [
    ['pack'],
    ['pack', 'missing', '--out'],
    ['pack', 'missing', '-o', 'a', '--out', 'b'],
    ['pack', 'missing', '--out', 'a', '-o', 'b'],
    ['compile', '.evidence/fm'],
    ['review', '--unknown'],
    ['check', 'source.evidence.json', 'extra'],
    ['check', 'source.evidence.json', '--scope'],
    ['diff', 'source.evidence.json'],
    ['test', '--tag', '--target', 'http://localhost', '--json'],
  ]) {
    const result = await invoke(args);
    expect(
      result.code,
      `${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
    ).not.toBe(0);
  }
  for (const command of [
    'pack',
    'unpack',
    'compile',
    'review',
    'check',
    'test',
    'diff',
  ]) {
    const help = await invoke([command, '--help']);
    expect(help.code, help.stderr).toBe(0);
    expect(help.stdout).toContain(`Usage: evidence ${command}`);
  }
  const version = await invoke(['--version']);
  expect(version.code).toBe(0);
  expect(version.stdout.trim()).toBe('evidence/0.0.1');
}, 20000);
