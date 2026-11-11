import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  readModelDirectory,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-core';
import {
  createEmptyDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDesktopFixture } from '../renderer/test-support/modelFixture';
import {
  BRANCH_DIRECTORY,
  BRANCH_SESSION_FILE,
  BRANCH_TRACE_PATH,
  CHECKOUT_DIRECTORY,
  createBranchStore,
} from './branchStore';

const modelRootOf = (rootPath: string): string =>
  path.join(rootPath, CHECKOUT_DIRECTORY);

const documentWithLabel = (label: string): DomainModelDocument => {
  const document = structuredClone(createDesktopFixture());

  return {
    ...document,
    entities: document.entities.map((entity) =>
      entity.id === 'evidence.contract' ? { ...entity, label } : entity,
    ),
  };
};

const traceOf = (contextRef: string) => ({
  schemaVersion: '1.0',
  modelId: 'desktop-fixture',
  traces: [
    {
      traceId: 'trace-1',
      timestamp: '2026-11-11T08:00:00.000Z',
      focus: { contextRef, evidenceRef: 'evidence.contract' },
      narrative: { judgment: '采购付款须凭签收凭证', story: '买方签收后才成立付款义务' },
      qa: [],
      userInput: { rawText: '按签收回执确认', confirmedFacts: [] },
      targetBindings: [],
    },
  ],
});

const sessionLines = (): readonly string[] => [
  JSON.stringify({
    type: 'session',
    version: 3,
    id: 'session-main',
    timestamp: '2026-11-11T08:00:00.000Z',
    cwd: '/workspace/project',
  }),
  JSON.stringify({
    type: 'message',
    id: 'm1',
    parentId: null,
    timestamp: '2026-11-11T08:00:00.000Z',
    message: { role: 'user', content: '澄清采购付款' },
  }),
  JSON.stringify({
    type: 'message',
    id: 'm2',
    parentId: 'm1',
    timestamp: '2026-11-11T08:05:00.000Z',
    message: { role: 'assistant', content: '需要签收回执' },
  }),
  JSON.stringify({
    type: 'message',
    id: 'm3',
    parentId: 'm2',
    timestamp: '2026-11-11T08:10:00.000Z',
    message: { role: 'user', content: '也考虑月结' },
  }),
];

describe('branchStore', () => {
  let tempRoot: string;
  let projectRoot: string;

  const store = () =>
    createBranchStore({
      now: () => new Date('2026-11-11T09:00:00.000Z'),
      createId: (name) => name.trim().toLowerCase().replaceAll(/\s+/g, '-'),
    });

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'evidence-branches-'));
    projectRoot = path.join(tempRoot, 'repo');
    await writeModelDirectory(
      modelRootOf(projectRoot),
      createEmptyDomainModel() as DomainModelDocument,
    );
    await writeModelDirectory(modelRootOf(projectRoot), createDesktopFixture());
    await mkdir(path.dirname(path.join(projectRoot, BRANCH_TRACE_PATH)), {
      recursive: true,
    });
    await writeFile(
      path.join(projectRoot, BRANCH_TRACE_PATH),
      `${JSON.stringify(traceOf('context.procurement'), null, 2)}\n`,
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('starts with a single main branch mirroring the checkout', async () => {
    const result = await store().list(projectRoot);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.activeBranchId).toBe('main');
    expect(result.branches).toEqual([
      expect.objectContaining({
        id: 'main',
        isActive: true,
        parentBranchId: null,
        entityCount: createDesktopFixture().entities.length,
      }),
    ]);
  });

  it('forks a branch without touching the checkout', async () => {
    const branches = store();
    const created = await branches.create({
      rootPath: projectRoot,
      name: '月度对账',
      description: '假设B：按月集中对账',
    });

    expect(created.success).toBe(true);

    if (!created.success) {
      return;
    }

    expect(created.branch).toEqual(
      expect.objectContaining({
        id: '月度对账',
        name: '月度对账',
        parentBranchId: 'main',
        isActive: false,
        status: 'open',
      }),
    );

    const checkout = await readModelDirectory(modelRootOf(projectRoot));

    expect(checkout.document.entities).toHaveLength(
      createDesktopFixture().entities.length,
    );

    const listed = await branches.list(projectRoot);

    expect(listed.success && listed.branches.map(({ id }) => id)).toEqual([
      'main',
      '月度对账',
    ]);
  });

  it('forks the interview transcript at the chosen checkpoint', async () => {
    const sourceSession = path.join(
      projectRoot,
      BRANCH_DIRECTORY,
      'main',
      BRANCH_SESSION_FILE,
    );

    await store().list(projectRoot);
    await writeFile(sourceSession, `${sessionLines().join('\n')}\n`, 'utf8');

    const created = await store().create({
      rootPath: projectRoot,
      name: '月结假设',
      sourceEntryId: 'm2',
    });

    expect(created.success).toBe(true);

    if (!created.success) {
      return;
    }

    const forked = await readFile(
      path.join(
        projectRoot,
        BRANCH_DIRECTORY,
        created.branch.id,
        BRANCH_SESSION_FILE,
      ),
      'utf8',
    );
    const parsed = forked
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(parsed[0]).toEqual(
      expect.objectContaining({ parentSession: 'session-main' }),
    );
    expect(parsed.map((item) => item.id)).toEqual([
      parsed[0].id,
      'm1',
      'm2',
    ]);
    expect(created.branch.sessionEntryCount).toBe(2);
  });

  it('saves the checkout back before switching branches', async () => {
    const branches = store();

    await branches.create({ rootPath: projectRoot, name: 'alternate' });
    await writeModelDirectory(
      modelRootOf(projectRoot),
      documentWithLabel('主干改名后的合同'),
    );

    const switched = await branches.switchTo({
      rootPath: projectRoot,
      branchId: 'alternate',
    });

    expect(switched.success).toBe(true);

    if (!switched.success) {
      return;
    }

    expect(switched.savedPrevious).toBe(true);
    expect(
      switched.document.entities.find(
        (entity) => entity.id === 'evidence.contract',
      )?.label,
    ).toBe('采购协议（Procurement Contract）');

    const mainSnapshot = await readModelDirectory(
      path.join(projectRoot, BRANCH_DIRECTORY, 'main', 'fm'),
    );

    expect(
      mainSnapshot.document.entities.find(
        (entity) => entity.id === 'evidence.contract',
      )?.label,
    ).toBe('主干改名后的合同');
  });

  it('round-trips an edit made on either branch', async () => {
    const branches = store();

    await branches.create({ rootPath: projectRoot, name: 'alternate' });

    const toAlternate = await branches.switchTo({
      rootPath: projectRoot,
      branchId: 'alternate',
    });

    expect(toAlternate.success).toBe(true);

    await writeModelDirectory(
      modelRootOf(projectRoot),
      documentWithLabel('备选分支的合同'),
    );

    await branches.switchTo({ rootPath: projectRoot, branchId: 'main' });

    const main = await readModelDirectory(modelRootOf(projectRoot));

    expect(
      main.document.entities.find((entity) => entity.id === 'evidence.contract')
        ?.label,
    ).toBe('采购协议（Procurement Contract）');

    await branches.switchTo({ rootPath: projectRoot, branchId: 'alternate' });

    const alternate = await readModelDirectory(modelRootOf(projectRoot));

    expect(
      alternate.document.entities.find(
        (entity) => entity.id === 'evidence.contract',
      )?.label,
    ).toBe('备选分支的合同');
  });

  it('merges a branch into the checkout and marks it merged', async () => {
    const branches = store();

    await branches.create({ rootPath: projectRoot, name: 'monthly' });
    await branches.switchTo({ rootPath: projectRoot, branchId: 'monthly' });
    await writeModelDirectory(
      modelRootOf(projectRoot),
      documentWithLabel('月结模式合同'),
    );

    const merged = await branches.merge({
      rootPath: projectRoot,
      sourceBranchId: 'monthly',
    });

    expect(merged.success).toBe(true);

    if (!merged.success) {
      return;
    }

    expect(merged.branch).toEqual(
      expect.objectContaining({ id: 'monthly', status: 'merged' }),
    );

    const checkout = await readModelDirectory(modelRootOf(projectRoot));

    expect(
      checkout.document.entities.find(
        (entity) => entity.id === 'evidence.contract',
      )?.label,
    ).toBe('月结模式合同');

    const listed = await branches.list(projectRoot);

    expect(listed.success && listed.activeBranchId).toBe('main');
    expect(
      listed.success
        ? listed.branches.find(({ id }) => id === 'monthly')?.status
        : undefined,
    ).toBe('merged');
  });

  it('refuses to remove main or the checked-out branch', async () => {
    const branches = store();

    await branches.create({ rootPath: projectRoot, name: 'keep-me' });
    await branches.switchTo({ rootPath: projectRoot, branchId: 'keep-me' });

    expect(
      await branches.remove({ rootPath: projectRoot, branchId: 'main' }),
    ).toEqual({ success: false, error: '主干不能删除。' });
    expect(
      await branches.remove({ rootPath: projectRoot, branchId: 'keep-me' }),
    ).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('当前检出的分支不能删除'),
      }),
    );
  });

  it('removes a branch that is not checked out', async () => {
    const branches = store();

    await branches.create({ rootPath: projectRoot, name: 'discard-me' });

    const removed = await branches.remove({
      rootPath: projectRoot,
      branchId: 'discard-me',
    });

    expect(removed).toEqual({
      success: true,
      removedBranchId: 'discard-me',
    });

    const listed = await branches.list(projectRoot);

    expect(listed.success && listed.branches.map(({ id }) => id)).toEqual([
      'main',
    ]);
  });

  it('compares two snapshots without switching the checkout', async () => {
    const branches = store();

    await branches.create({ rootPath: projectRoot, name: 'alternate' });
    await writeModelDirectory(
      path.join(projectRoot, BRANCH_DIRECTORY, 'alternate', 'fm'),
      documentWithLabel('备选分支的合同'),
    );

    const compared = await branches.compare({
      rootPath: projectRoot,
      baseBranchId: 'main',
      targetBranchId: 'alternate',
    });

    expect(compared.success).toBe(true);

    if (!compared.success) {
      return;
    }

    expect(compared.comparison.diff.summary.modifiedCount).toBeGreaterThan(0);
    expect(compared.comparison.baseDocument.manifest.id).toBe('desktop-fixture');

    const listed = await branches.list(projectRoot);

    expect(listed.success && listed.activeBranchId).toBe('main');
  });

  it('reports the transcript the active branch owns', async () => {
    const branches = store();

    expect(await branches.activeSessionFile(projectRoot)).toBeNull();

    await branches.list(projectRoot);
    await writeFile(
      path.join(projectRoot, BRANCH_DIRECTORY, 'main', BRANCH_SESSION_FILE),
      `${sessionLines().join('\n')}\n`,
      'utf8',
    );

    expect(await branches.activeSessionFile(projectRoot)).toBe(
      path.join(projectRoot, BRANCH_DIRECTORY, 'main', BRANCH_SESSION_FILE),
    );
  });
});
