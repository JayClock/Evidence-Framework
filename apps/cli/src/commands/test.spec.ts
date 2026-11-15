import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { dispatch } from '../router.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-test-'));
  await writeFile(
    path.join(root, 'smoke.stepci.yml'),
    `version: "1.1"
name: smoke
env:
  host: http://invalid
  asOf: "2026-03-31T10:00:00Z"
tests:
  flow:
    steps:
      - name: payment
        http:
          method: GET
          url: "\${{env.host}}/pay"
          headers:
            x-evidence-asof: "\${{env.asOf}}"
          check:
            status: 200
            jsonpath:
              $.amount: 500
`,
  );
});
afterEach(() => rm(root, { recursive: true, force: true }));

it('prints green, red and parseable JSON, ignoring a 404 health probe', async () => {
  let amount = 500;
  const clocks: unknown[] = [];
  const server = createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(404).end();
      return;
    }
    clocks.push(req.headers['x-evidence-asof']);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ amount }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const output: string[] = [],
      errors: string[] = [];
    const context = {
      cwd: root,
      stdout: (text: string) => output.push(text),
      stderr: (text: string) => errors.push(text),
      color: false,
    };
    const args = ['test', '--target', target, '--scenarios', '.'];
    expect(await dispatch(args, context)).toBe(0);
    expect(output.pop()).toContain('PASSED (Green)');
    amount = 501;
    expect(await dispatch(args, context)).toBe(1);
    const red = output.pop();
    expect(red).toContain('Expected: 500');
    expect(red).toContain('Received: 501');
    expect(red).not.toContain('\u001b');
    expect(
      await dispatch(
        [...args, '--json', '--as-of', '2026-04-01T10:00:00Z'],
        context,
      ),
    ).toBe(1);
    expect(JSON.parse(output.pop()!)).toMatchObject({
      passed: false,
      asOf: '2026-04-01T10:00:00Z',
    });
    expect(clocks).toEqual([
      '2026-03-31T10:00:00Z',
      '2026-03-31T10:00:00Z',
      '2026-04-01T10:00:00Z',
    ]);
    expect(errors).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('fails closed for unreachable targets, invalid clocks and unsupported inputs', async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const output: string[] = [];
  const context = {
    cwd: root,
    stdout: (text: string) => output.push(text),
    stderr: () => undefined,
    color: false,
  };
  const args = ['test', '--target', target, '--scenarios', '.', '--json'];
  expect(await dispatch(args, context)).toBe(1);
  expect(JSON.parse(output.pop()!).error).toContain('is unreachable');
  for (const extra of [
    ['--as-of', '2026-02-30T00:00:00Z'],
    ['--timeout', '0'],
    ['--unknown'],
  ])
    expect(await dispatch([...args, ...extra], context)).toBe(1);
  expect(
    await dispatch(['test', '--target', 'ftp://localhost', '--json'], context),
  ).toBe(1);
});
