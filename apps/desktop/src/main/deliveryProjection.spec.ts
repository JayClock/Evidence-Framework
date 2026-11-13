import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readModelRoot,
  serializeModelBundle,
} from '@evidence-poc/evidence-model-core';
import { deliveryFilesOf, readDelivery } from './deliveryProjection';

const modelRoot = path.resolve(
  import.meta.dirname,
  '../../../../libs/evidence-api/tests/fixtures/full-lifecycle/fm',
);

describe('live delivery inputs', () => {
  it('exports the same snapshot from a directory or a portable bundle', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'desktop-api-'));
    try {
      const { bundle } = await readModelRoot(modelRoot);
      const file = path.join(directory, 'model.evidence.json');
      await writeFile(file, serializeModelBundle(bundle));
      const tree = await readDelivery(modelRoot);
      const packed = await readDelivery(file);
      expect(packed.routes).toEqual(tree.routes);
      expect(packed.openapi).toEqual(tree.openapi);
      const files = deliveryFilesOf(packed);
      const snapshot = JSON.parse(
        files.find((item) => item.path === 'projection.json')!.content,
      );
      expect(snapshot.schemaVersion).toBe('5.1');
      expect(snapshot.mode).toBe('draft');
      expect(snapshot.digests.model).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(snapshot.digests.checkReport).toBeUndefined();
      expect(snapshot.diagnostics).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not export malformed or statically inconsistent model inputs', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'desktop-api-invalid-'),
    );
    try {
      const file = path.join(directory, 'model.evidence.json');
      await writeFile(file, '{');
      await expect(readDelivery(file)).rejects.toThrow();
      const { bundle } = await readModelRoot(modelRoot);
      bundle.entities.push(structuredClone(bundle.entities[0]!));
      await writeFile(file, serializeModelBundle(bundle));
      await expect(readDelivery(file)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
