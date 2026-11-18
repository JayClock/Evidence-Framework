import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stringify, parse } from 'yaml';
import { describe, it, expect } from 'vitest';
import { renderStepCi } from '../renderer/stepCiRenderer.js';
import { projectAcceptanceTests } from '../delivery/scenarioProjector.js';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';
import { runAcceptanceSuite, validateAsOf } from './acceptanceRunner.js';

it('reports drift as advisory or strict without replacing other official assertions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'acceptance-drift-'));
  let payload = '{"amount":500,"secret":true}';
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(payload);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const suitePath = path.join(root, 'suite.yml');
    await writeFile(
      suitePath,
      stringify({
        version: '1.1',
        name: 'drift',
        tests: {
          flow: {
            steps: [
              {
                http: {
                  url: '${{env.host}}',
                  method: 'GET',
                  check: {
                    status: 200,
                    schema: {
                      type: 'object',
                      required: ['amount'],
                      additionalProperties: false,
                      properties: { amount: { type: 'number' } },
                    },
                  },
                },
              },
            ],
          },
        },
      }),
    );
    const options = {
      suitePath,
      targetUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    };
    expect((await runAcceptanceSuite(options)).passed).toBe(false);
    const advisory = await runAcceptanceSuite({
      ...options,
      detectDrift: true,
    });
    expect(advisory.passed).toBe(true);
    expect(advisory.steps[0]?.driftIssues).toContainEqual(
      expect.objectContaining({ type: 'extraneous_field', path: '/secret' }),
    );
    expect(
      (await runAcceptanceSuite({ ...options, strictDrift: true })).passed,
    ).toBe(false);
    payload = 'not-json';
    expect(
      (await runAcceptanceSuite({ ...options, strictDrift: true })).steps[0]
        ?.driftIssues?.[0]?.keyword,
    ).toBe('parse');
    payload = '{"amount":500}';
    expect(
      (await runAcceptanceSuite({ ...options, strictDrift: true })).passed,
    ).toBe(true);
    const baselineYaml = await import('node:fs/promises').then((fs) =>
      fs.readFile(suitePath, 'utf8'),
    );
    expect(
      await runAcceptanceSuite({ ...options, gate: 'dod', baselineYaml }),
    ).toMatchObject({ passed: true, selectedFlowCount: 0, steps: [] });
    await expect(
      runAcceptanceSuite({ ...options, filter: 'missing' }),
    ).rejects.toThrow('No acceptance flows');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

it('parameterizes distinct step clocks without collapsing a scenario timeline', () => {
  const projection = projectAcceptanceTests(createAcceptanceModel());
  projection.flows[0]!.steps[1]!.asOf = '2026-04-01T10:00:00Z';
  const workflow = parse(renderStepCi(projection));
  expect(workflow.env.asOf).toBe(projection.flows[0]!.steps[0]!.asOf);
  expect(workflow.env.asOf_2).toBe('2026-04-01T10:00:00Z');
  expect(workflow.tests.flow_1.steps[1].http.headers['x-evidence-asof']).toBe(
    '${{env.asOf_2}}',
  );
});

it('requires a monitor header on 202 and treats receipt ID arrays as literal equality', async () => {
  const projection = projectAcceptanceTests(createAcceptanceModel());
  const flow = projection.flows[0]!;
  const step = flow.steps[0]!;
  flow.steps = [step];
  step.status = 202;
  step.assertions = { '$.request_ids': ['quarter-1', 'year-1'] };
  delete step.responseSchema;

  const root = await mkdtemp(path.join(tmpdir(), 'acceptance-literal-'));
  let location: string | undefined = '/requests/request-1';
  let requestIds = ['quarter-1', 'year-1'];
  const server = createServer((_request, response) => {
    response.statusCode = 202;
    response.setHeader('content-type', 'application/json');
    if (location !== undefined) response.setHeader('location', location);
    response.end(JSON.stringify({ request_ids: requestIds }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const suitePath = path.join(root, 'suite.yml');
    await writeFile(suitePath, renderStepCi(projection));
    const options = {
      suitePath,
      targetUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    };
    expect((await runAcceptanceSuite(options)).passed).toBe(true);
    location = undefined;
    expect((await runAcceptanceSuite(options)).passed).toBe(false);
    location = '/requests/request-1';
    requestIds = ['year-1'];
    expect((await runAcceptanceSuite(options)).passed).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

it('runs official HTTP assertions, overrides target/clock, and preserves failure differences', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'acceptance-runner-'));
  const seen: unknown[] = [];
  const server = createServer((request, response) => {
    seen.push(request.headers['x-evidence-asof']);
    response.setHeader('content-type', 'application/json');
    response.end('{"amount":501}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const suitePath = path.join(root, 'suite.yml');
    await writeFile(
      suitePath,
      stringify({
        version: '1.1',
        name: 'smoke',
        env: { host: 'http://invalid', asOf: '2026-01-01T00:00:00Z' },
        tests: {
          flow: {
            steps: [
              {
                name: 'pay',
                http: {
                  url: '${{env.host}}/pay',
                  method: 'POST',
                  headers: { 'x-evidence-asof': '${{env.asOf}}' },
                  check: { status: 200, jsonpath: { '$.amount': 500 } },
                },
              },
            ],
          },
        },
      }),
    );
    const targetUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const report = await runAcceptanceSuite({
      suitePath,
      targetUrl,
      asOf: '2026-03-31T10:00:00Z',
      timeoutMs: 1000,
    });
    expect(report.passed).toBe(false);
    expect(report.steps[0]).toMatchObject({
      method: 'POST',
      url: `${targetUrl}/pay`,
      status: 200,
      skipped: false,
    });
    expect(report.steps[0]!.assertions).toContainEqual({
      path: 'jsonpath.$.amount',
      expected: 500,
      actual: 501,
      passed: false,
    });
    expect(seen).toEqual(['2026-03-31T10:00:00Z']);
    expect((await runAcceptanceSuite({ suitePath, targetUrl })).passed).toBe(
      false,
    );
    expect(seen[1]).toBe('2026-01-01T00:00:00Z');
    await writeFile(suitePath, 'version: "1.1"\ntests: {}\n');
    await expect(runAcceptanceSuite({ suitePath, targetUrl })).rejects.toThrow(
      'nonempty',
    );
    await expect(
      runAcceptanceSuite({ suitePath, targetUrl, timeoutMs: -1 }),
    ).rejects.toThrow('timeoutMs');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

describe('clock validation', () => {
  it.each(['2026-03-31T10:00:00Z', '2026-03-31T10:00:00.123Z'])(
    'accepts %s',
    (value) => expect(validateAsOf(value)).toBe(value),
  );
  it.each([
    '2026-02-30T10:00:00Z',
    'tomorrow',
    '2026-03-31',
    '2026-03-31T10:00:00+08:00',
  ])('rejects %s', (value) => expect(() => validateAsOf(value)).toThrow());
});
