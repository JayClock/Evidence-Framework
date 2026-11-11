import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createEmptyDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import { writeModelDirectory } from '@evidence-poc/evidence-model-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createProjectStore,
  modelRootFor,
  RECENT_PROJECTS_FILE,
} from './projectStore';

const domainModel = (): DomainModelDocument => ({
  ...createEmptyDomainModel({
    id: 'desktop-project',
    name: '桌面端项目（Desktop Project）',
    entryContextRefs: ['context.procurement'],
  }),
  entities: [
    {
      type: 'entity',
      id: 'context.procurement',
      category: 'context',
      kind: 'contract',
      label: '采购（Procurement）',
      rootRefs: ['evidence.contract'],
    },
    {
      type: 'entity',
      id: 'evidence.contract',
      category: 'evidence',
      kind: 'contract',
      label: '采购协议（Procurement Contract）',
      contextRef: 'context.procurement',
      attributes: [
        {
          name: 'signed_at',
          label: '签署时间（Signed At）',
          meaning: '双方签署后由采购方登记。',
          valueType: 'timestamp',
          required: true,
          keyData: true,
        },
      ],
    },
  ],
});

describe('projectStore', () => {
  let tempRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'evidence-desktop-'));
    projectRoot = path.join(tempRoot, 'repo');
    await writeModelDirectory(modelRootFor(projectRoot), domainModel());
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const store = () =>
    createProjectStore({
      recentProjectsFile: path.join(tempRoot, RECENT_PROJECTS_FILE),
      now: () => new Date('2026-11-11T08:00:00.000Z'),
    });

  it('opens a model source tree and remembers the project', async () => {
    const projectStore = store();
    const result = await projectStore.open(projectRoot);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.project).toMatchObject({
      name: '桌面端项目（Desktop Project）',
      modelId: 'desktop-project',
      entityCount: 2,
      relationshipCount: 0,
      ruleCount: 0,
      lastOpenedAt: '2026-11-11T08:00:00.000Z',
    });
    expect(result.project.modelRoot).toBe(modelRootFor(projectRoot));
    expect(result.issues).toEqual([]);

    const recent = await projectStore.listRecent();

    expect(recent.map(({ rootPath }) => rootPath)).toEqual([
      path.resolve(projectRoot),
    ]);

    const persisted = JSON.parse(
      await readFile(path.join(tempRoot, RECENT_PROJECTS_FILE), 'utf8'),
    );

    expect(persisted).toHaveLength(1);
  });

  it('refuses a folder without .evidence/fm/model.json', async () => {
    const empty = path.join(tempRoot, 'empty');

    await writeModelDirectory(empty, createEmptyDomainModel());

    const result = await store().open(empty);

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toContain('.evidence/fm');
    }
  });

  it('writes only changed files and stays idempotent', async () => {
    const projectStore = store();
    const document = domainModel();
    const first = await projectStore.save(projectRoot, document);

    expect(first.success).toBe(true);

    if (!first.success) {
      return;
    }

    expect(first.written).toEqual([]);

    const second = await projectStore.save(projectRoot, document);

    expect(second.success).toBe(true);

    if (second.success) {
      expect(second.written).toEqual([]);
      expect(second.removed).toEqual([]);
      expect(second.unchanged).toContain(
        'entities/evidence-contract--contract.json',
      );
    }

    const renamed: DomainModelDocument = {
      ...document,
      entities: document.entities.map((entity) =>
        entity.id === 'evidence.contract'
          ? { ...entity, label: '采购合同（Procurement Contract）' }
          : entity,
      ),
    };
    const third = await projectStore.save(projectRoot, renamed);

    expect(third.success).toBe(true);

    if (third.success) {
      expect(third.written).toEqual([
        'entities/evidence-contract--contract.json',
      ]);
      expect(third.unchanged).toEqual(
        expect.arrayContaining([
          'model.json',
          'entities/context-contract--procurement.json',
        ]),
      );

      const contents = await readFile(
        path.join(
          modelRootFor(projectRoot),
          'entities/evidence-contract--contract.json',
        ),
        'utf8',
      );

      expect(contents).toContain('采购合同（Procurement Contract）');
    }
  });

  it('fingerprints the source tree so external writes are detectable', async () => {
    const projectStore = store();

    expect(await projectStore.fingerprint(projectRoot)).not.toBeNull();

    const entityFile = path.join(
      modelRootFor(projectRoot),
      'entities/evidence-contract--contract.json',
    );
    const before = await projectStore.fingerprint(projectRoot);
    const contents = await readFile(entityFile, 'utf8');

    await writeFile(entityFile, contents.replace('采购协议', '采购协议 v2'));

    expect(await projectStore.fingerprint(projectRoot)).not.toBe(before);
    expect(
      await projectStore.fingerprint(path.join(tempRoot, 'missing')),
    ).toBeNull();
  });
});
