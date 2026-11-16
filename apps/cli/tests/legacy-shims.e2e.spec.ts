import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-shims-'));
  await writeFile(
    path.join(root, 'model.evidence.json'),
    await readFile(
      path.join(repo, 'examples/b2b-escrow/model/b2b-escrow.evidence.json'),
    ),
  );
});
afterEach(() => rm(root, { recursive: true, force: true }));

function invoke(binary: string, args: string[]) {
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
const unified = (args: string[]) =>
  invoke(path.join(repo, 'apps/cli/dist/cli.js'), args);

it('keeps all deprecated bins executable with warnings on stderr and valid JSON stdout', async () => {
  const unpack = await unified(['unpack', 'model.evidence.json']);
  expect(unpack.code, unpack.stderr).toBe(0);
  const calls = [
    [
      'evidence-model-io',
      ['inspect', path.join(root, 'model.evidence.json'), '--json'],
    ],
    [
      'evidence-acceptance',
      [
        'inspect',
        '--project-root',
        root,
        '--fm',
        path.join(root, 'model.evidence.json'),
      ],
    ],
  ] as const;
  for (const [library, args] of calls) {
    const result = await invoke(
      path.join(repo, `libs/${library}/dist/cli.js`),
      [...args],
    );
    expect([0, 3], `${result.stdout}\n${result.stderr}`).toContain(result.code);
    expect(result.stderr).toContain('[DEPRECATED]');
    expect(JSON.parse(result.stdout)).toBeTruthy();
  }
  const projection = await unified([
    'api',
    'inspect',
    '--model',
    'model.evidence.json',
  ]);
  expect([0, 3], projection.stderr).toContain(projection.code);
  expect(JSON.parse(projection.stdout)).toMatchObject({
    modelId: 'b2b-escrow',
  });
  expect(projection.stderr).toBe('');
  const diff = await unified([
    'api',
    'diff',
    '--base',
    'model.evidence.json',
    '--target',
    'model.evidence.json',
  ]);
  expect(diff.code, diff.stderr).toBe(0);
  expect(JSON.parse(diff.stdout)).toMatchObject({ hasBreakingChanges: false });
}, 20000);

it('detects symlinked legacy bins and keeps programmatic imports silent', async () => {
  const binary = path.join(repo, 'libs/evidence-model-io/dist/cli.js');
  const link = path.join(root, 'evidence-model');
  await symlink(binary, link);
  const result = await invoke(link, [
    'inspect',
    'model.evidence.json',
    '--json',
  ]);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stderr).toContain('[DEPRECATED]');
  expect(JSON.parse(result.stdout)).toHaveProperty('modelId');
  const imported = await invoke('--input-type=module', [
    '-e',
    ['evidence-model-io', 'evidence-acceptance']
      .map(
        (library) =>
          `await import(${JSON.stringify(path.join(repo, `libs/${library}/dist/cli.js`))});`,
      )
      .join('\n'),
  ]);
  expect(imported.code, imported.stderr).toBe(0);
  expect(imported.stdout).toBe('');
  expect(imported.stderr).toBe('');
}, 20000);
