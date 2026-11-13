import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as modelCore from '@evidence-poc/evidence-model-core';
import { vi } from 'vitest';

import {
  buildFmCheckReport,
  loadValidationSuite,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
  serializeModelBundle,
} from '@evidence-poc/evidence-model-core';

import {
  checkReportProblem,
  digestBytes,
  loadFm,
  loadFmFromDocument,
  partyRolesPlayedByParticipants,
} from './adapter/fmAdapter.js';
import { inspectSummary } from './inspect.js';

const fmRoot = fileURLToPath(
  new URL('../tests/fixtures/full-lifecycle/fm', import.meta.url),
);

/** The check report the FM stage would have handed over. */
const checkReportOf = async (root: string) => {
  const { bundle, files, issues } = await readModelRoot(root);
  const bytes = await readModelRootBytes(root);
  const { report } = buildFmCheckReport({
    model: bundle,
    suite: loadValidationSuite(files),
    sourceIssues: issues.map((issue) => `${issue.path}: ${issue.message}`),
    modelDigest: modelDigestOf(
      bytes.map((file) => ({ path: file.path, content: file.bytes })),
    ),
    scopeRefs: ['context.product-procurement'],
  });

  return report;
};

describe('digestBytes', () => {
  it('hashes the bytes without a prefix, unlike the model digest', () => {
    expect(digestBytes('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('checkReportProblem', () => {
  const ready = {
    checkVersion: 5,
    consistent: true,
    complete: true,
    valid: true,
    inputChanged: false,
    modelValidated: true,
    errors: [],
    modelDigest: 'sha256:abc',
  };

  it('accepts a report that proves a delivered scope', () => {
    expect(checkReportProblem(ready)).toBeNull();
  });

  it('refuses consistency without completeness or a digest', () => {
    expect(checkReportProblem(undefined)).toBeNull();
    expect(checkReportProblem(null)).toBeNull();
    for (const broken of [
      { ...ready, checkVersion: 4 },
      { ...ready, consistent: false },
      { ...ready, complete: false },
      { ...ready, inputChanged: true },
      { ...ready, modelValidated: false },
      { ...ready, errors: ['boom'] },
      { ...ready, modelDigest: undefined },
      {},
    ]) {
      expect(checkReportProblem(broken)).not.toBeNull();
    }
  });
});

describe('loadFm', () => {
  it('indexes the checked model and its validation inputs', async () => {
    const check = await checkReportOf(fmRoot);
    const { index, diagnostics } = await loadFm(fmRoot, check);

    expect(diagnostics).toEqual([]);
    expect(index?.compiled.entities.length).toBeGreaterThan(0);
    expect([...(index?.entities.keys() ?? [])][0]).toBe(
      [...(index?.entities.keys() ?? [])].sort()[0],
    );
    expect(index?.scenarios.size).toBeGreaterThan(0);
    expect(index?.instances.size).toBeGreaterThan(0);
    expect(Object.keys(index?.files ?? {}).length).toBe(77);
  });

  it('keeps the current model when its saved report is stale', async () => {
    const check = await checkReportOf(fmRoot);
    const { index, diagnostics } = await loadFm(fmRoot, {
      ...check,
      modelDigest: 'sha256:0000',
    });

    expect(index).not.toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FM_CHECK_STALE', severity: 'gap' }),
    ]);
  });

  it('refuses a directory that is not a model', async () => {
    const { index, diagnostics } = await loadFm(
      fileURLToPath(new URL('./fixtures-not-a-model', import.meta.url)),
      {},
    );

    expect(index).toBeNull();
    expect(diagnostics[0]?.code).toBe('FM_INVALID');
  });

  it('keeps an invalid report visible without treating it as a passing check', async () => {
    const { index, diagnostics } = await loadFm(fmRoot, { checkVersion: 5 });
    expect(index?.check).toEqual({ checkVersion: 5 });

    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FM_CHECK_INVALID', severity: 'gap' }),
    ]);
  });
});

describe('loadFmFromDocument', () => {
  it('indexes an in-memory document and its inline validation suite without a fake check', async () => {
    const { bundle } = await readModelRoot(fmRoot);
    const original = JSON.stringify(bundle);
    const { index, diagnostics } = loadFmFromDocument(bundle);
    expect(diagnostics).toEqual([]);
    expect(index?.check).toBeNull();
    expect(index?.entities.size).toBe(bundle.entities.length);
    expect(index?.scenarios.size).toBeGreaterThan(0);
    expect(index?.instances.size).toBeGreaterThan(0);
    expect(index?.modelDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(loadFmFromDocument(bundle).index?.modelDigest).toBe(
      index?.modelDigest,
    );
    expect(JSON.stringify(bundle)).toBe(original);
    const edited = {
      ...bundle,
      manifest: { ...bundle.manifest, name: 'Edited' },
    };
    expect(loadFmFromDocument(edited).index?.modelDigest).not.toBe(
      index?.modelDigest,
    );
  });

  it('reads directories and bundles without a check report', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'api-input-'));
    try {
      const { bundle } = await readModelRoot(fmRoot);
      const file = path.join(directory, 'model.evidence.json');
      writeFileSync(file, serializeModelBundle(bundle));
      const tree = await loadFm(fmRoot);
      const packed = await loadFm(file);
      expect(tree.diagnostics).toEqual([]);
      expect(packed.diagnostics).toEqual([]);
      expect(packed.index?.compiled).toEqual(tree.index?.compiled);
      expect(packed.index?.scenarios).toEqual(tree.index?.scenarios);
      expect(packed.index?.check).toBeNull();
      writeFileSync(file, '{');
      expect((await loadFm(file)).index).toBeNull();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('still refuses a source that changes during a read', async () => {
    const original = modelCore.readModelRootBytes;
    const spy = vi.spyOn(modelCore, 'readModelRootBytes');
    spy
      .mockImplementationOnce(original)
      .mockImplementationOnce(async (root) => [
        ...(await original(root)),
        { path: 'changed.txt', bytes: Buffer.from('changed') },
      ]);
    try {
      const result = await loadFm(fmRoot);
      expect(result.index).toBeNull();
      expect(result.diagnostics[0]?.code).toBe('SOURCE_CHANGED');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('partyRolesPlayedByParticipants', () => {
  it('counts only Party Roles an actual Participant Party plays', async () => {
    const { index } = await loadFm(fmRoot, await checkReportOf(fmRoot));
    const played = partyRolesPlayedByParticipants(
      index as NonNullable<typeof index>,
    );

    expect([...played].sort()).toEqual(['role.buyer', 'role.seller']);
  });
});

describe('inspectSummary', () => {
  it('reports the inventory inspect prints, with nulls kept visible', async () => {
    const { index } = await loadFm(fmRoot, await checkReportOf(fmRoot));
    const summary = inspectSummary(index as NonNullable<typeof index>);

    expect(summary.schemaVersion).toBe('5.0');
    expect(summary.contexts).toEqual([
      'context.product-catalog',
      'context.product-procurement',
      'context.product-sourcing',
      'context.wechat-payment',
    ]);
    expect(summary.roles).toHaveLength(5);
    expect(summary.resourceClues).toHaveLength(19);
    expect(summary.playedPartyRoles).toEqual(['role.buyer', 'role.seller']);
    expect(summary.unplayedPartyRoles).toEqual([
      'role.wechat-provider',
      'role.wechat-user',
    ]);
    // A Participant Party sits outside every Context, and the report says so.
    expect(
      summary.resourceClues.find((entry) => entry.id === 'party.buyer-agent'),
    ).toEqual({
      id: 'party.buyer-agent',
      label: '甲方采购员',
      kind: 'party',
      category: 'participant',
      contextRef: null,
    });
    // Roles print without a category: the list is already only roles.
    expect(summary.roles[0]).not.toHaveProperty('category');
    expect(summary.scenarios.map(([id]) => id)).toEqual([
      'scenario.product-procurement',
    ]);
  });
});
