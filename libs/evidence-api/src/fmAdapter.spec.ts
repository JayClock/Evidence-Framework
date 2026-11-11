import { fileURLToPath } from 'node:url';

import {
  buildFmCheckReport,
  loadValidationSuite,
  modelDigestOf,
  readModelRoot,
  readModelRootBytes,
} from '@evidence-poc/evidence-model-core';

import {
  checkReportProblem,
  digestBytes,
  loadFm,
  partyRolesPlayedByParticipants,
} from './adapter/fmAdapter.js';
import { inspectSummary } from './inspect.js';

const fmRoot = fileURLToPath(
  new URL(
    '../../../.agents/skills/evidence-api/tests/fixtures/full-lifecycle/fm',
    import.meta.url,
  ),
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
    for (const broken of [
      { ...ready, checkVersion: 4 },
      { ...ready, consistent: false },
      { ...ready, complete: false },
      { ...ready, inputChanged: true },
      { ...ready, modelValidated: false },
      { ...ready, errors: ['boom'] },
      { ...ready, modelDigest: undefined },
      {},
      null,
    ]) {
      expect(checkReportProblem(broken)).toBe(
        '需要 FM 阶段实际通过且输入未变化的检查结果',
      );
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

  it('refuses a model that changed after its check', async () => {
    const check = await checkReportOf(fmRoot);
    const { index, diagnostics } = await loadFm(fmRoot, {
      ...check,
      modelDigest: 'sha256:0000',
    });

    expect(index).toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FM_CHECK_STALE' }),
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

  it('refuses a report that is not a passing one', async () => {
    const { diagnostics } = await loadFm(fmRoot, { checkVersion: 5 });

    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'FM_CHECK_INVALID' }),
    ]);
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
