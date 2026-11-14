import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MODEL_README_PATH } from '@evidence-poc/evidence-model-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  packModelDirectory,
  readModelBundle,
  unpackModelBundle,
  writeModelBundle,
  writeModelDirectory,
} from '../index.js';
import { createProcurementModel } from '@evidence-poc/evidence-model-core/testing';

describe('bundle files on disk', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'evidence-bundle-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('packs a directory into one file and unpacks it again', async () => {
    const modelRoot = join(root, '.evidence', 'fm');
    const document = createProcurementModel();
    const instancePath = join(
      modelRoot,
      'validation',
      'instances',
      'evidence-instance--a.json',
    );

    await writeModelDirectory(modelRoot, document);
    await writeFile(join(modelRoot, MODEL_README_PATH), '说明\n', 'utf8');
    await mkdir(dirname(instancePath), { recursive: true });
    await writeFile(
      instancePath,
      JSON.stringify({ id: 'evidence-instance.a', type: 'evidence_instance' }),
      'utf8',
    );

    const packed = await packModelDirectory(modelRoot);
    const bundlePath = join(root, 'procurement.evidence.json');

    await writeModelBundle(bundlePath, packed.bundle);

    const read = await readModelBundle(bundlePath);

    expect(read.issues).toEqual([]);
    expect(read.document.readme).toBe('说明\n');
    expect(read.document.validation?.instances).toHaveLength(1);

    const unpacked = await unpackModelBundle(
      bundlePath,
      join(root, 'restored'),
    );

    expect(unpacked.result.written).toEqual(
      expect.arrayContaining([
        'model.json',
        MODEL_README_PATH,
        'validation/instances/evidence-instance--a.json',
      ]),
    );
    expect(
      JSON.parse(await readFile(join(root, 'restored', 'model.json'), 'utf8')),
    ).toEqual(document.manifest);
  });

  it('does not rewrite a source tree whose objects already match', async () => {
    const modelRoot = join(root, '.evidence', 'fm');
    const document = createProcurementModel();
    const bundlePath = join(root, 'hand-formatted.evidence.json');
    const manifestPath = join(modelRoot, 'model.json');
    // A hand-written file keeps inline arrays the serializer would expand.
    const handWritten = `{
  "type": "fm_model",
  "schemaVersion": "5.0",
  "id": "procurement-core",
  "name": "采购履约核心模型",
  "version": "1.0.0",
  "ruleLanguage": "CEL",
  "entryContextRefs": ["context.procurement", "context.catalogue"]
}\n`;

    await writeModelDirectory(modelRoot, document);
    await writeModelBundle(bundlePath, document);
    await writeFile(manifestPath, handWritten, 'utf8');

    const unpacked = await unpackModelBundle(bundlePath, modelRoot);

    expect(await readFile(manifestPath, 'utf8')).toBe(handWritten);
    expect(unpacked.result.unchanged).toContain('model.json');
    expect(unpacked.result.written).toEqual([]);
  });

  it('leaves the bundle untouched when the bytes already match', async () => {
    const bundlePath = join(root, 'model.evidence.json');

    await writeModelBundle(bundlePath, createProcurementModel());

    expect(
      (await writeModelBundle(bundlePath, createProcurementModel())).written,
    ).toBe(false);
  });

  it('reports a missing bundle instead of throwing', async () => {
    const result = await readModelBundle(join(root, 'absent.evidence.json'));

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toContain('does not exist');
    expect(result.document.entities).toEqual([]);
  });
});
