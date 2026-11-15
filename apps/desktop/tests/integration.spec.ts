import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createModelSession,
  updateEntityMutator,
} from '@evidence-poc/evidence-model-core';
import {
  readModelDirectory,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import {
  computeHighlight,
  computeGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';

import { createProjectStore } from '../src/main/projectStore';

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  '../../../libs/evidence-schema/tests/fixtures/product-procurement',
);

const withFixtureCopy = async <T>(
  work: (temporaryRoot: string) => Promise<T>,
): Promise<T> => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'evidence-desktop-e2e-'),
  );
  const modelRoot = path.join(temporaryRoot, '.evidence', 'fm');

  await cp(FIXTURE_ROOT, modelRoot, { recursive: true });

  try {
    return await work(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

describe('product-procurement end to end', () => {
  it('loads the industrial fixture without parse or FM issues', async () => {
    const parsed = await readModelDirectory(FIXTURE_ROOT);

    expect(parsed.issues).toEqual([]);
    expect(parsed.document.manifest.id).toBe(
      'product-procurement-full-lifecycle',
    );
    expect(parsed.document.entities.length).toBeGreaterThan(10);
    expect(strictValidateDomainModel(parsed.document).valid).toBe(true);
  });

  it('lays out every modeled object without empty context shells', async () => {
    const parsed = await readModelDirectory(FIXTURE_ROOT);
    const session = createModelSession({ document: parsed.document });
    const graph = session.getGraph();
    const layout = await computeGraphLayout(graph);
    const contextCount = parsed.document.entities.filter(
      (entity) => entity.category === 'context',
    ).length;

    expect(layout.contextGroups).toHaveLength(contextCount);
    expect(layout.nodes.length).toBe(
      parsed.document.entities.length - contextCount,
    );
    expect(layout.fulfillmentPairs.length).toBe(
      graph
        .fulfillmentPairs()
        .reduce(
          (count, pair) =>
            count + pair.confirmations.length + pair.proofs.length,
          0,
        ),
    );
    expect(
      layout.fulfillmentPairs.every((pair) => pair.points.length >= 2),
    ).toBe(true);
  });

  it('highlights the neighbours of a hovered request', async () => {
    const parsed = await readModelDirectory(FIXTURE_ROOT);
    const session = createModelSession({ document: parsed.document });
    const graph = session.getGraph();
    const layout = await computeGraphLayout(graph);
    const requestId = layout.fulfillmentPairs[0]!.requestId;
    const highlight = computeHighlight({
      graph,
      layout,
      activeNodeId: requestId,
    });

    expect(highlight.dimmed).toBe(true);
    expect(highlight.nodeIds.has(requestId)).toBe(true);
    expect(highlight.edgeIds.size).toBeGreaterThan(0);
    expect(highlight.contextIds.size).toBeGreaterThan(0);
  });

  it('saves the tree idempotently and keeps it re-parseable', async () => {
    await withFixtureCopy(async (projectRoot) => {
      const store = createProjectStore({
        recentProjectsFile: path.join(projectRoot, 'recent-projects.json'),
      });
      const opened = await store.open(projectRoot);

      expect(opened.success).toBe(true);

      if (!opened.success) {
        return;
      }

      const first = await store.save(projectRoot, opened.document);

      expect(first.success).toBe(true);

      const second = await store.save(projectRoot, opened.document);

      expect(second.success).toBe(true);

      if (second.success) {
        expect(second.written).toEqual([]);
        expect(second.removed).toEqual([]);
      }

      const reparsed = await readModelDirectory(
        path.join(projectRoot, '.evidence', 'fm'),
      );

      expect(reparsed.issues).toEqual([]);
      expect(reparsed.document).toEqual(opened.document);
    });
  });

  it('keeps the document consistent across 50 edits and 50 undos', async () => {
    const parsed = await readModelDirectory(FIXTURE_ROOT);
    const session = createModelSession({ document: parsed.document });
    const contractId = parsed.document.entities.find(
      (entity) => entity.category === 'evidence' && entity.kind === 'contract',
    )!.id;

    for (let index = 0; index < 50; index += 1) {
      session.mutate(
        (draft) =>
          updateEntityMutator(draft, contractId, {
            label: `采购协议 v${index}（Procurement Contract）`,
          }),
        'update-entity',
      );
    }

    expect(session.canUndo()).toBe(true);

    for (let index = 0; index < 50; index += 1) {
      expect(session.undo()).toBe(true);
    }

    expect(session.canUndo()).toBe(false);
    expect(session.getDocument()).toEqual(parsed.document);
    expect(strictValidateDomainModel(session.getDocument()).valid).toBe(true);
  });

  it('commits the edited tree with the same bytes on a second save', async () => {
    await withFixtureCopy(async (projectRoot) => {
      const modelRoot = path.join(projectRoot, '.evidence', 'fm');
      const parsed = await readModelDirectory(modelRoot);
      const session = createModelSession({ document: parsed.document });
      const contract = parsed.document.entities.find(
        (entity) =>
          entity.category === 'evidence' && entity.kind === 'contract',
      )!;

      session.mutate(
        (draft) =>
          updateEntityMutator(draft, contract.id, {
            label: '采购协议（Procurement Contract, v2）',
          }),
        'update-entity',
      );

      const first = await writeModelDirectory(modelRoot, session.getDocument());

      expect(first.written.length).toBeGreaterThan(0);

      const second = await writeModelDirectory(
        modelRoot,
        session.getDocument(),
      );

      expect(second.written).toEqual([]);
      expect(second.removed).toEqual([]);

      const reparsed = await readModelDirectory(modelRoot);

      expect(
        reparsed.document.entities.find(({ id }) => id === contract.id)?.label,
      ).toBe('采购协议（Procurement Contract, v2）');
      expect(strictValidateDomainModel(reparsed.document).valid).toBe(true);
    });
  });
});
