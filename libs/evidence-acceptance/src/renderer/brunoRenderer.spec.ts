import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';
import { parseModelBundleText } from '@evidence-poc/evidence-model-core';
import { projectAcceptanceTests } from '../delivery/scenarioProjector.js';
import { renderBruno } from './brunoRenderer.js';

// Bruno's official parser currently ships no TypeScript declarations.
const { bruToJsonV2, bruToEnvJsonV2, collectionBruToJson } = createRequire(
  import.meta.url,
)('@usebruno/lang') as {
  bruToJsonV2(source: string): { body: { json: string }; tests?: string };
  bruToEnvJsonV2(source: string): unknown;
  collectionBruToJson(source: string): unknown;
};

it('renders a deterministic native collection with ordered requests, tags and isolated captures', () => {
  const projection = projectAcceptanceTests(createAcceptanceModel());
  const flow = projection.flows[0]!;
  flow.tags = ['smoke-test', 'regression'];
  flow.steps[2]!.asOf = '2026-06-01T00:03:00Z';
  projection.flows.push({ ...structuredClone(flow), id: 'another flow' });
  const files = renderBruno(projection);
  expect(renderBruno(projection)).toEqual(files);
  expect(JSON.parse(files['bruno.json']!)).toEqual({
    version: '1',
    name: `${projection.modelId} acceptance`,
    type: 'collection',
  });
  expect(collectionBruToJson(files['collection.bru']!)).toMatchObject({
    docs: expect.stringContaining('Test environment only'),
  });
  expect(bruToEnvJsonV2(files['environments/test.bru']!)).toMatchObject({
    variables: expect.arrayContaining([
      expect.objectContaining({ name: 'host', value: 'http://localhost:8080' }),
      expect.objectContaining({
        name: 'asOf_2',
        value: '2026-06-01T00:03:00Z',
      }),
    ]),
  });
  for (const directory of ['flow-001', 'flow-002']) {
    const prefix = `flows/${directory}/`;
    expect(collectionBruToJson(files[`${prefix}folder.bru`]!)).toMatchObject({
      meta: {
        seq: directory === 'flow-001' ? '1' : '2',
        tags: ['regression', 'smoke-test'],
      },
    });
    const requests = Object.keys(files)
      .filter(
        (path) => path.startsWith(prefix) && !path.endsWith('/folder.bru'),
      )
      .sort();
    expect(requests).toHaveLength(3);
    const [request, confirm] = requests
      .slice(1)
      .map((path) => bruToJsonV2(files[path]!));
    const flowNumber = directory === 'flow-001' ? 1 : 2;
    expect(request).toMatchObject({
      vars: {
        res: [
          {
            name: `capture_${flowNumber}_2_1`,
            value: 'res.body?.id',
            enabled: true,
          },
        ],
      },
    });
    expect(confirm).toMatchObject({
      meta: { name: flow.steps[2]!.ref, seq: '3' },
      http: {
        method: 'post',
        url: `{{host}}/agreements/{{capture_${flowNumber}_1_1}}/payments/{{capture_${flowNumber}_2_1}}/confirmation`,
      },
      headers: expect.arrayContaining([
        expect.objectContaining({
          name: 'x-evidence-role',
          value: flow.steps[2]!.actingRoleRef,
        }),
        expect.objectContaining({
          name: 'x-evidence-asof',
          value: '{{asOf_2}}',
        }),
      ]),
      assertions: expect.arrayContaining([
        expect.objectContaining({ name: 'res.status', value: 'eq 201' }),
        expect.objectContaining({
          name: 'res.body?.total_amount',
          value: 'eq 500',
        }),
      ]),
      settings: { followRedirects: false, timeout: 5000 },
    });
  }
});

it('renders deep equality, literal strings, 202 Location and exact decimal values without coercion', () => {
  const projection = projectAcceptanceTests(createAcceptanceModel());
  const step = projection.flows[0]!.steps[0]!;
  step.status = 202;
  step.inputs = { wide: '18446744073709551615', note: 'a\n}' };
  step.assertions = {
    '$.wide': step.inputs.wide,
    '$.enabled': false,
    '$.nullable': null,
    '$["foo:bar"][0]': { list: [2, 1] },
    "$.values['say\\'hi']": '${literal}`\\',
  };
  const files = renderBruno(projection);
  const request = bruToJsonV2(
    files[
      Object.keys(files).find((key) => key.startsWith('flows/flow-001/001-'))!
    ]!,
  );
  expect(JSON.parse(request.body.json)).toEqual(step.inputs);
  expect(request).toMatchObject({
    assertions: expect.arrayContaining([
      expect.objectContaining({ name: 'res.status', value: 'eq 202' }),
      expect.objectContaining({
        name: 'res.body?.wide',
        value: 'eq "18446744073709551615"',
      }),
      expect.objectContaining({ name: 'res.body?.enabled', value: 'eq false' }),
      expect.objectContaining({ name: 'res.body?.nullable', value: 'eq null' }),
    ]),
  });
  expect(request.tests).toContain(
    'expect(res.body?.["foo:bar"]?.[0]).to.deep.equal(',
  );
  expect(request.tests).toContain(
    'expect(res.body?.values?.["say\'hi"]).to.equal(',
  );
  expect(request.tests).toContain(
    'expect(res.getHeader("location")).to.be.a("string").and.match(/\\S/)',
  );
});

it.each([
  'agile-sprint',
  'b2b-escrow',
  'digital-advertising',
  'shared-settlement',
])('renders all %s acceptance requests as native Bru syntax', (example) => {
  const path = new URL(
    `../../../../examples/${example}/model/${example}.evidence.json`,
    import.meta.url,
  );
  const { document, issues } = parseModelBundleText(readFileSync(path, 'utf8'));
  expect(issues).toEqual([]);
  const projection = projectAcceptanceTests(document);
  const requests = Object.entries(renderBruno(projection)).filter(
    ([name]) => name.startsWith('flows/') && !name.endsWith('/folder.bru'),
  );
  expect(requests).toHaveLength(
    projection.flows.flatMap(({ steps }) => steps).length,
  );
  for (const [, request] of requests) bruToJsonV2(request);
});

it('fails closed on unsafe model literals and unsupported JSONPath', () => {
  const projection = projectAcceptanceTests(createAcceptanceModel());
  const step = projection.flows[0]!.steps[0]!;
  step.inputs = { id: '{{host}}' };
  expect(() => renderBruno(projection)).toThrow('TEST_TEMPLATE_UNSUPPORTED');
  step.inputs = { id: Number.MAX_SAFE_INTEGER + 1 };
  expect(() => renderBruno(projection)).toThrow('unsafe numeric literal');
  step.inputs = {};
  step.assertions = { '$..id': 'foo' };
  expect(() => renderBruno(projection)).toThrow('single-node JSONPath');
  step.assertions = {};
  projection.flows[0]!.tags = ['not a native tag'];
  expect(() => renderBruno(projection)).toThrow('invalid Bru tag');
});
