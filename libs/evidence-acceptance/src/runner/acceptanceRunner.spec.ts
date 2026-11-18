import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeOutput } from '@evidence-poc/evidence-api';
import type {
  SuiteProjection,
  SuiteStep,
} from '../delivery/scenarioProjector.js';
import { renderAcceptanceSuite } from '../renderer/brunoSuite.js';
import { runAcceptanceSuite, validateAsOf } from './acceptanceRunner.js';

function request(overrides: Partial<SuiteStep> = {}): SuiteStep {
  return {
    ref: 'receipt',
    route: { method: 'POST', path: '/receipts' },
    asOf: '2026-01-01T00:00:00Z',
    actingRoleRef: 'role.buyer',
    status: 200,
    inputs: {},
    assertions: {},
    parameters: {},
    captures: {},
    ...overrides,
  };
}

async function fixture(
  steps: SuiteStep[],
  handler: RequestListener,
  test: (
    params: { suitePath: string; targetUrl: string },
    projection: SuiteProjection,
  ) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'acceptance-bruno-test-'));
  const suitePath = path.join(root, 'suite');
  const projection: SuiteProjection = {
    modelId: 'smoke',
    flows: [{ id: 'flow', steps }],
  };
  const server = createServer(handler);
  try {
    writeOutput(suitePath, renderAcceptanceSuite(projection));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    await test(
      {
        suitePath,
        targetUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      },
      projection,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

it('keeps default and strict schema validation blocking, with opt-in advisory drift', async () => {
  let payload = '{"amount":500,"secret":true}';
  await fixture(
    [
      request({
        assertions: { '$.amount': 500 },
        responseSchema: {
          type: 'object',
          required: ['amount'],
          additionalProperties: false,
          properties: { amount: { type: 'number' } },
        },
      }),
    ],
    (_req, res) =>
      res.setHeader('Content-Type', 'application/json').end(payload),
    async (options) => {
      expect((await runAcceptanceSuite(options)).passed).toBe(false);
      const advisory = await runAcceptanceSuite({
        ...options,
        detectDrift: true,
      });
      expect(advisory.passed).toBe(true);
      expect(advisory.steps[0]?.driftIssues).toContainEqual(
        expect.objectContaining({ path: '/secret', type: 'extraneous_field' }),
      );
      expect(
        (await runAcceptanceSuite({ ...options, strictDrift: true })).passed,
      ).toBe(false);
      payload = '{"amount":501,"secret":true}';
      expect(
        (await runAcceptanceSuite({ ...options, detectDrift: true })).passed,
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
    },
  );
}, 15_000);

it('uses Bruno for ordered captures, exact literals, clocks, Location and deep equality', async () => {
  let location: string | undefined = '/receipts/receipt-01';
  let ids = ['quarter', 'year'];
  let wide: string | number = '18446744073709551615';
  const seen: Pick<SuiteStep, 'asOf'>[] = [];
  const paths: string[] = [];
  const steps = [
    request({
      status: 202,
      assertions: { '$.amount': wide, '$.ids': ids },
      captures: { captured: '$.id' },
    }),
    request({
      ref: 'details',
      route: { method: 'GET', path: '/receipts/{id}' },
      asOf: '2026-01-02T00:00:00Z',
      parameters: { id: 'captured' },
    }),
  ];
  await fixture(
    steps,
    (req, res) => {
      seen.push({ asOf: String(req.headers['x-evidence-asof']) });
      paths.push(req.url!);
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') {
        if (location) res.setHeader('Location', location);
        res
          .writeHead(202)
          .end(JSON.stringify({ amount: wide, ids, id: 'receipt-01' }));
      } else res.end('{}');
    },
    async (options) => {
      const report = await runAcceptanceSuite(options);
      expect(report.passed, JSON.stringify(report)).toBe(true);
      expect(paths).toEqual(['/receipts', '/receipts/receipt-01']);
      expect(seen).toEqual(steps.map(({ asOf }) => ({ asOf })));
      const asOf = '2026-03-31T10:00:00Z';
      expect((await runAcceptanceSuite({ ...options, asOf })).passed).toBe(
        true,
      );
      expect(seen.slice(-2)).toEqual([{ asOf }, { asOf }]);
      wide = Number(wide);
      location = undefined;
      ids = ['year'];
      const broken = await runAcceptanceSuite(options);
      expect(broken.passed).toBe(false);
      expect(
        broken.steps[0]!.assertions.filter(({ passed }) => !passed),
      ).toHaveLength(3);
      expect(broken.steps[1]).toMatchObject({ skipped: true, passed: false });
    },
  );
}, 15_000);

it('runs baseline flows, skips an unchanged DoD without probing, and refuses edited artifacts', async () => {
  await fixture(
    [request({ assertions: { '$.amount': 500 } })],
    (_req, res) =>
      res.setHeader('Content-Type', 'application/json').end('{"amount":501}'),
    async (options, projection) => {
      const preflight = vi.fn(async () => undefined);
      expect(
        await runAcceptanceSuite({
          ...options,
          gate: 'dod',
          baseline: projection,
          preflight,
        }),
      ).toMatchObject({
        passed: true,
        selectedFlowCount: 0,
        steps: [],
        emptyReason: expect.any(String),
      });
      expect(preflight).not.toHaveBeenCalled();
      const baseline = structuredClone(projection);
      baseline.flows[0]!.steps[0]!.assertions['$.amount'] = 501;
      expect(
        (await runAcceptanceSuite({ ...options, gate: 'regression', baseline }))
          .passed,
      ).toBe(true);
      const dod = await runAcceptanceSuite({
        ...options,
        gate: 'dod',
        baseline,
      });
      expect(dod.steps[0]?.assertions).toContainEqual({
        path: 'jsonpath.$.amount',
        expected: 500,
        actual: 501,
        passed: false,
      });
      await expect(
        runAcceptanceSuite({ ...options, filter: 'missing' }),
      ).rejects.toThrow('No acceptance flows');
      await expect(
        runAcceptanceSuite({ ...options, timeoutMs: -1 }),
      ).rejects.toThrow('timeoutMs');
      await writeFile(
        path.join(options.suitePath, 'flows/flow-001/001-receipt.bru'),
        'modified',
      );
      await expect(
        runAcceptanceSuite({ ...options, preflight }),
      ).rejects.toThrow('Modified Bruno artifact');
      expect(preflight).not.toHaveBeenCalled();
    },
  );
});

it('reports timeouts as execution errors and does not follow redirects', async () => {
  const hits: string[] = [];
  await fixture(
    [
      request({ route: { method: 'GET', path: '/redirect' }, status: 302 }),
      request({ ref: 'slow', route: { method: 'GET', path: '/slow' } }),
    ],
    (req, res) => {
      hits.push(req.url!);
      if (req.url === '/redirect')
        res.writeHead(302, { Location: '/wrong' }).end();
    },
    async (options) => {
      const report = await runAcceptanceSuite({ ...options, timeoutMs: 300 });
      expect(report.steps[0]).toMatchObject({ passed: true, status: 302 });
      expect(report.steps[1]).toMatchObject({ passed: false, errored: true });
      expect(hits).toEqual(['/redirect', '/slow']);
    },
  );
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
