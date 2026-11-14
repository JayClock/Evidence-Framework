import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runEvidenceModelCommand } from './cli.js';

const FIXTURE = fileURLToPath(
  new URL(
    '../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
    import.meta.url,
  ),
);

describe('derived document commands', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'evidence-derived-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  const read = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(path.join(root, name), 'utf8')) as Record<
      string,
      unknown
    >;

  it('compiles a checked model into one sorted document', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(
      await runEvidenceModelCommand([
        'compile',
        FIXTURE,
        '--out',
        path.join(root, 'model.json'),
      ]),
    ).toBe(0);

    const compiled = await read('model.json');
    const ids = (compiled['entities'] as { id: string }[]).map((item) => item.id);

    expect(ids).toEqual([...ids].sort());
    expect(compiled['schemaVersion']).toBe('5.0');
  });

  it('writes lineage, timeline and simulation reports', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    expect(
      await runEvidenceModelCommand([
        'lineage',
        FIXTURE,
        '--out',
        path.join(root, 'traceability.json'),
      ]),
    ).toBe(0);
    expect(
      await runEvidenceModelCommand([
        'timeline',
        FIXTURE,
        '--out',
        path.join(root, 'timeline.json'),
      ]),
    ).toBe(0);
    expect(
      await runEvidenceModelCommand([
        'simulate',
        FIXTURE,
        '--out',
        path.join(root, 'simulation.json'),
      ]),
    ).toBe(0);

    expect((await read('traceability.json'))['edges']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleRef: 'rule.payment-request-amount' }),
      ]),
    );
    expect((await read('timeline.json'))['instances']).toHaveLength(6);
    expect((await read('simulation.json'))['scenarioResults']).toHaveLength(3);
  });

  it('stops a derived command when the model does not pass its check', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const broken = path.join(root, 'broken');
    const { mkdir, cp } = await import('node:fs/promises');

    await mkdir(broken, { recursive: true });
    await cp(FIXTURE, broken, { recursive: true });
    await writeFile(path.join(broken, 'model.json'), '{}\n', 'utf8');

    expect(
      await runEvidenceModelCommand([
        'compile',
        broken,
        '--out',
        path.join(root, 'model.json'),
      ]),
    ).toBe(1);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      '已中止',
    );
  });

  it('writes a role-play packet to disk and refuses to overwrite it', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const out = path.join(root, 'pack');

    expect(
      await runEvidenceModelCommand([
        'role-play',
        FIXTURE,
        'scenario.successful-payment',
        '--out',
        out,
      ]),
    ).toBe(0);
    expect(
      await readFile(path.join(out, 'facilitator.md'), 'utf8'),
    ).toContain('Facilitator');

    expect(
      await runEvidenceModelCommand([
        'role-play',
        FIXTURE,
        'scenario.successful-payment',
        '--out',
        out,
      ]),
    ).toBe(1);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain(
      '使用 --force',
    );

    expect(
      await runEvidenceModelCommand([
        'role-play',
        FIXTURE,
        'scenario.successful-payment',
        '--out',
        out,
        '--force',
      ]),
    ).toBe(0);
  });
});
