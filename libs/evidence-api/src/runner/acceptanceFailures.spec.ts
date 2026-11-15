import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify } from 'yaml';
import { expect, it } from 'vitest';
import { runAcceptanceSuite } from './acceptanceRunner.js';

it('reports timeouts and skipped steps without losing request metadata or returning green', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'acceptance-timeout-'));
  const server = createServer(() => {
    /* Deliberately never responds. */
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const suitePath = path.join(root, 'suite.yml');
    const http = {
      method: 'POST',
      url: '${{env.host}}/hang',
      check: { status: 201 },
    };
    await writeFile(
      suitePath,
      stringify({
        version: '1.1',
        name: 'timeouts',
        tests: {
          flow: {
            steps: [
              { name: 'slow', http },
              { name: 'never-run', http },
            ],
          },
        },
      }),
    );
    const targetUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const result = await runAcceptanceSuite({
      suitePath,
      targetUrl,
      timeoutMs: 40,
    });
    expect(result.passed).toBe(false);
    expect(result.steps[0]).toMatchObject({
      method: 'POST',
      url: `${targetUrl}/hang`,
      expectedStatus: 201,
      passed: false,
      skipped: false,
    });
    expect(result.steps[0]!.failureDetails).toMatch(/timeout|timed out/i);
    expect(result.steps[1]).toMatchObject({
      method: 'POST',
      url: `${targetUrl}/hang`,
      passed: false,
      skipped: true,
    });
    await writeFile(
      suitePath,
      stringify({
        version: '1.1',
        name: 'skipped',
        tests: { flow: { steps: [{ if: '1 == 0', http }] } },
      }),
    );
    expect((await runAcceptanceSuite({ suitePath, targetUrl })).passed).toBe(
      false,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
