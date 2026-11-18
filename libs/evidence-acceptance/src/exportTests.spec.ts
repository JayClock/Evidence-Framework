import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serializeModelBundle } from '@evidence-poc/evidence-model-core';
import { writeModelDirectory } from '@evidence-poc/evidence-model-io';
import { runCli } from './cli.js';
import { suiteManifest } from './renderer/brunoSuite.js';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';

let root: string, fm: string, out: string;
const args = () => [
  'export-tests',
  '--project-root',
  root,
  '--fm',
  fm,
  '--out',
  out,
];
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-acceptance-cli-'));
  fm = path.join(root, 'model.evidence.json');
  out = path.join(root, 'generated-tests');
  writeFileSync(fm, serializeModelBundle(createAcceptanceModel()));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('export-tests CLI', () => {
  it('exports a native Bruno collection deterministically from a bundle or source tree', async () => {
    expect((await runCli(args())).exitCode).toBe(0);
    expect(readdirSync(out).sort()).toEqual([
      'bruno.json',
      'collection.bru',
      'environments',
      suiteManifest,
      'flows',
    ]);
    const manifest = readFileSync(path.join(out, suiteManifest), 'utf8');
    expect(JSON.parse(manifest).projection.flows[0].steps).toHaveLength(3);
    fm = path.join(root, 'fm');
    await writeModelDirectory(fm, createAcceptanceModel());
    expect((await runCli(args())).exitCode).toBe(0);
    expect(readFileSync(path.join(out, suiteManifest), 'utf8')).toBe(manifest);
    expect(readdirSync(fm)).not.toContain('validation');
  });
  it.each([
    ['int', '1857392817294827136', '1857392817294827137'],
    ['uint', '18446744073709551614', '18446744073709551615'],
  ] as const)(
    'exports exact %s derived assertions without bigint or number rounding',
    async (type, quantity, expected) => {
      const model = createAcceptanceModel();
      const request = model.entities.find(
        (entity) => entity.id === 'request.payment',
      );
      const confirmation = model.entities.find(
        (entity) => entity.id === 'confirmation.payment',
      );
      const quantityField = request?.attributes?.find(
        (attribute) => attribute.name === 'quantity',
      );
      const amountField = confirmation?.attributes?.find(
        (attribute) => attribute.name === 'total_amount',
      );
      const requestExample = request?.examples?.[0];
      const confirmationExample = confirmation?.examples?.[0];
      const rule = model.rules.find((item) => item.id === 'rule.total-amount');
      if (
        !quantityField ||
        !amountField ||
        !requestExample ||
        !confirmationExample ||
        !rule
      ) {
        throw new Error('Incomplete acceptance fixture');
      }
      quantityField.valueType = type;
      requestExample.value.quantity = quantity;
      amountField.valueType = type;
      confirmationExample.value.total_amount = expected;
      rule.expression = `request.quantity + ${type === 'uint' ? '1u' : '1'}`;
      rule.resultType = type;
      writeFileSync(fm, serializeModelBundle(model));

      const result = await runCli(args());
      expect(result, JSON.stringify(result)).toMatchObject({ exitCode: 0 });
      const dir = path.join(out, 'flows/flow-001');
      const requests = readdirSync(dir)
        .filter((file) => /^\d/.test(file))
        .sort();
      expect(readFileSync(path.join(dir, requests[1]!), 'utf8')).toContain(
        `"quantity": "${quantity}"`,
      );
      expect(readFileSync(path.join(dir, requests[2]!), 'utf8')).toContain(
        `eq "${expected}"`,
      );
    },
  );

  it('replaces artifacts from earlier exports', async () => {
    await runCli(args());
    writeFileSync(path.join(out, 'acceptance.stepci.yml'), 'old');
    expect((await runCli(args())).exitCode).toBe(0);
    expect(readdirSync(out)).not.toContain('acceptance.stepci.yml');
  });
  it('keeps contract exports separate by default', async () => {
    expect(
      (await runCli(['export-tests', '--project-root', root, '--fm', fm]))
        .exitCode,
    ).toBe(0);
    expect(readdirSync(path.join(root, '.evidence/api/acceptance'))).toContain(
      'bruno.json',
    );
  });
  it('does not replace an existing suite when model validation fails', async () => {
    await runCli(args());
    const before = readFileSync(path.join(out, suiteManifest), 'utf8');
    const model = createAcceptanceModel();
    model.entities.find(
      (entity) => entity.id === 'confirmation.payment',
    )!.examples![0]!.value.total_amount = 501;
    writeFileSync(fm, serializeModelBundle(model));
    const result = await runCli(args());
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.output)).toContain('disagrees');
    expect(readFileSync(path.join(out, suiteManifest), 'utf8')).toBe(before);
  });
  it('refuses unknown fields, missing source, no executable examples and invalid formats', async () => {
    expect((await runCli([...args(), '--format', 'bruno'])).error).toContain(
      'unexpected argument',
    );
    expect((await runCli([...args(), '--api', '/unused'])).error).toContain(
      'unexpected argument',
    );
    expect(
      (await runCli(['export-tests', '--project-root', root])).exitCode,
    ).toBe(1);
    const model = createAcceptanceModel();
    for (const entity of model.entities) entity.examples = [];
    writeFileSync(fm, serializeModelBundle(model));
    expect(JSON.stringify((await runCli(args())).output)).toContain(
      'no examples with test metadata',
    );
  });
  it('protects input and out-of-project paths, including symlink ancestors', async () => {
    out = root;
    expect((await runCli(args())).error).toContain('OUTPUT_INPUT_CONFLICT');
    out = path.join(root, '..', 'outside-suite');
    expect((await runCli(args())).error).toContain('OUTPUT_OUTSIDE_PROJECT');
    fm = path.join(root, 'fm');
    await writeModelDirectory(fm, createAcceptanceModel());
    const link = path.join(root, 'model-link');
    symlinkSync(fm, link, 'dir');
    out = path.join(link, 'generated');
    expect((await runCli(args())).error).toContain('OUTPUT_INPUT_CONFLICT');
  });
  it('surfaces invalid JSON and does not create output directories', async () => {
    writeFileSync(fm, '{bad');
    expect((await runCli(args())).exitCode).toBe(1);
    expect(readdirSync(root)).toEqual(['model.evidence.json']);
  });
  it('refuses legacy test envelopes and leaves the exported suite untouched', async () => {
    await runCli(args());
    const file = path.join(out, suiteManifest);
    const before = readFileSync(file, 'utf8');
    const legacy = {
      ...JSON.parse(serializeModelBundle(createAcceptanceModel())),
      validation: { instances: [], scenarios: [] },
    };
    writeFileSync(fm, JSON.stringify(legacy));
    const result = await runCli(args());
    expect(result.exitCode).toBe(1);
    expect(JSON.stringify(result.output)).toContain('no longer supported');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
  it('documents the command through help', async () => {
    const result = await runCli(['export-tests', '--help']);
    expect(result.exitCode).toBe(0);
    expect(
      String(result.output)
        .split('\n')
        .find((line) => line.includes('export-tests')),
    ).not.toContain('--format');
  });
});
