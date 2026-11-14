import { cp, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serializeModelBundle } from '@evidence-poc/evidence-model-core';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
import { workbenchFingerprint } from '@evidence-poc/evidence-visualization';
import { previewReview } from './reviewPreview';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const fixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'review-preview-'));
  roots.push(root);
  const source = path.join(root, '.evidence/fm');
  await cp(
    path.resolve(
      import.meta.dirname,
      '../../../../libs/evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
    ),
    source,
    { recursive: true },
  );
  return { root, document: (await readModelRoot(source)).bundle };
};

describe('live review preview', () => {
  it('reads validation inputs from a portable bundle without treating it as a directory', async () => {
    const { root, document } = await fixture();
    const file = path.join(root, 'snapshot.evidence.json');
    await writeFile(file, serializeModelBundle(document));
    const result = await previewReview({
      rootPath: file,
      document,
      revision: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data.counts.scenarios).toBeGreaterThan(0);
    expect(result.notice).toContain('已保存');
  });
  it('checks an unsaved snapshot without publishing files or overwriting sources', async () => {
    const { root, document } = await fixture();
    const before = await workbenchFingerprint(root);
    document.manifest.name = '未保存的审查标题';
    const result = await previewReview({
      rootPath: root,
      document,
      revision: 7,
    });
    expect(result.data.title).toBe('未保存的审查标题');
    expect(result.revision).toBe(7);
    expect(result.notice).toContain('未保存');
    expect(result.data.delivery?.services.length).toBeGreaterThan(0);
    expect(await workbenchFingerprint(root)).toBe(before);
    expect(await readdir(root)).toEqual(['.evidence']);
    expect(await readdir(path.join(root, '.evidence'))).toEqual(['fm']);
  });
  it('shows invalid authoring diagnostics instead of pretending the export gate passed', async () => {
    const { root, document } = await fixture();
    const evidence = document.entities.find(
      (entity) => entity.category === 'evidence',
    )!;
    evidence.label = '';
    const result = await previewReview({
      rootPath: root,
      document,
      revision: 1,
    });
    expect(result.data.validation.fm).toBe(false);
    expect(result.data.validation.consistent).toBe(false);
    expect(
      result.issues.some(
        (issue) =>
          issue.severity === 'block' && issue.targetNodeId === evidence.id,
      ),
    ).toBe(true);
  });
});
