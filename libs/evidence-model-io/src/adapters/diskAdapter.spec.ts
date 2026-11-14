import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serializeDomainModel } from '@evidence-poc/evidence-model-core';
import { createProcurementModel } from '@evidence-poc/evidence-model-core/testing';

import { readModelDirectory, writeModelDirectory } from '../index.js';

const canonical = (document: ReturnType<typeof createProcurementModel>) => ({
  ...document,
  entities: [...document.entities].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  relationships: [...document.relationships].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
  rules: [...document.rules].sort((left, right) =>
    left.id.localeCompare(right.id),
  ),
});

const readAll = async (root: string) => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
};

describe('writeModelDirectory', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'evidence-model-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes the manifest and the three source trees', async () => {
    const result = await writeModelDirectory(root, createProcurementModel());

    expect(result.written).toContain('model.json');
    expect(result.written).toContain(
      'entities/evidence-contract--procurement.json',
    );
    expect(result.written).toContain(
      'relationships/relation--request-references-contract.json',
    );
    expect(result.written).toContain('rules/rule--payment-completed.json');
    expect(result.removed).toEqual([]);
    expect((await readAll(root)).some((path) => path.includes('.tmp-'))).toBe(
      false,
    );
  });

  it('reads back an equivalent document', async () => {
    const model = createProcurementModel();

    await writeModelDirectory(root, model);

    const parsed = await readModelDirectory(root);

    expect(parsed.issues).toEqual([]);
    expect(canonical(parsed.document)).toEqual(canonical(model));
  });

  it('is idempotent: a second write touches nothing', async () => {
    const model = createProcurementModel();

    await writeModelDirectory(root, model);

    const second = await writeModelDirectory(root, model);

    expect(second.written).toEqual([]);
    expect(second.removed).toEqual([]);
    expect(second.unchanged.length).toBe(serializeDomainModel(model).length);
  });

  it('only rewrites the file that changed', async () => {
    const model = createProcurementModel();

    await writeModelDirectory(root, model);

    const edited = createProcurementModel();

    edited.entities.find((entity) => entity.id === 'request.payment')!.label =
      '付款申请';

    const result = await writeModelDirectory(root, edited);

    expect(result.written).toEqual([
      'entities/evidence-fulfillment-request--payment.json',
    ]);
    expect(
      JSON.parse(
        await readFile(
          join(root, 'entities/evidence-fulfillment-request--payment.json'),
          'utf8',
        ),
      ).label,
    ).toBe('付款申请');
  });

  it('removes files of deleted objects', async () => {
    const model = createProcurementModel();

    await writeModelDirectory(root, model);

    const reduced = createProcurementModel();

    reduced.entities = reduced.entities.filter(
      (entity) => entity.id !== 'party.seller-sales',
    );
    reduced.relationships = reduced.relationships.filter(
      (relationship) =>
        relationship.sourceRef !== 'party.seller-sales' &&
        relationship.targetRef !== 'party.seller-sales',
    );

    const result = await writeModelDirectory(root, reduced);

    expect(result.removed).toEqual([
      'entities/participant-party--seller-sales.json',
    ]);
  });

  it('never touches trees owned by other skills', async () => {
    await writeModelDirectory(root, createProcurementModel());
    await mkdir(join(root, 'validation'), { recursive: true });
    await writeFile(join(root, 'validation', 'suite.json'), '{}');

    const reduced = createProcurementModel();

    reduced.entities = reduced.entities.filter(
      (entity) => entity.id !== 'party.seller-sales',
    );
    reduced.relationships = reduced.relationships.filter(
      (relationship) =>
        relationship.sourceRef !== 'party.seller-sales' &&
        relationship.targetRef !== 'party.seller-sales',
    );

    const result = await writeModelDirectory(root, reduced);

    expect(result.removed).not.toContain('validation/suite.json');
    expect(await readFile(join(root, 'validation', 'suite.json'), 'utf8')).toBe(
      '{}',
    );
  });

  it('sorts keys when requested', async () => {
    await writeModelDirectory(root, createProcurementModel(), {
      sortKeys: true,
    });

    const manifest = JSON.parse(
      await readFile(join(root, 'model.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(Object.keys(manifest)).toEqual([
      'entryContextRefs',
      'id',
      'name',
      'ruleLanguage',
      'schemaVersion',
      'type',
      'version',
    ]);
  });

  it('reports a missing source tree instead of throwing', async () => {
    await rm(root, { recursive: true, force: true });
    root = await mkdtemp(join(tmpdir(), 'evidence-model-'));

    const parsed = await readModelDirectory(root);

    expect(parsed.document.entities).toEqual([]);
    expect(parsed.issues.map((issue) => issue.message)).toEqual([
      'model.json is required at the model root.',
      'model must contain at least one entity.',
    ]);
  });
});
