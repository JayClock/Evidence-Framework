import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createEmptyDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import {
  readModelBundle,
  writeModelBundle,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
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

describe('projectStore with a single-file model', () => {
  let tempRoot: string;
  let bundlePath: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'evidence-bundle-project-'),
    );
    bundlePath = path.join(tempRoot, 'desktop-project.evidence.json');
    await writeModelBundle(bundlePath, domainModel());
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const store = () =>
    createProjectStore({
      recentProjectsFile: path.join(tempRoot, RECENT_PROJECTS_FILE),
      now: () => new Date('2026-11-11T08:00:00.000Z'),
    });

  it('opens a bundle file and points modelRoot at the file', async () => {
    const result = await store().open(bundlePath);

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.project.kind).toBe('file');
    expect(result.project.modelRoot).toBe(path.resolve(bundlePath));
    expect(result.project.entityCount).toBe(2);
    expect(result.issues).toEqual([]);
  });

  it('saves back into the same file without adding a source tree', async () => {
    const projectStore = store();
    const opened = await projectStore.open(bundlePath);

    if (!opened.success) {
      throw new Error(opened.error);
    }

    const saved = await projectStore.save(bundlePath, {
      ...opened.document,
      entities: opened.document.entities.map((entity) =>
        entity.id === 'evidence.contract'
          ? { ...entity, label: '采购合同（Procurement Contract）' }
          : entity,
      ),
    });

    expect(saved.success).toBe(true);

    const reread = await readModelBundle(bundlePath);

    expect(reread.issues).toEqual([]);
    expect(
      reread.document.entities.find(
        (entity) => entity.id === 'evidence.contract',
      )?.label,
    ).toBe('采购合同（Procurement Contract）');
    // Saving a bundle never materializes a neighbouring source tree.
    await expect(
      readFile(path.join(tempRoot, '.evidence', 'fm', 'model.json'), 'utf8'),
    ).rejects.toThrow();
  });

  it('keeps bundle extras the renderer hands back', async () => {
    const projectStore = store();
    const opened = await projectStore.open(bundlePath);

    if (!opened.success) {
      throw new Error(opened.error);
    }

    const withExtras = {
      ...opened.document,
      validation: { instances: [], scenarios: [] },
      readme: '范围说明\n',
    };

    await projectStore.save(bundlePath, withExtras);

    const reread = await readModelBundle(bundlePath);

    expect(reread.document.readme).toBe('范围说明\n');
    expect(reread.document.validation).toEqual({
      instances: [],
      scenarios: [],
    });
  });

  it('fingerprints the file so an external write is detectable', async () => {
    const projectStore = store();
    const before = await projectStore.fingerprint(bundlePath);

    expect(before).not.toBeNull();

    await writeModelBundle(bundlePath, {
      ...domainModel(),
      entities: domainModel().entities.map((entity) => ({
        ...entity,
        label: `${entity.label} v2`,
      })),
    });

    expect(await projectStore.fingerprint(bundlePath)).not.toBe(before);
  });
});

describe('projectStore.create', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'evidence-desktop-create-'));
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const store = () =>
    createProjectStore({
      recentProjectsFile: path.join(tempRoot, RECENT_PROJECTS_FILE),
      now: () => new Date('2026-11-11T08:00:00.000Z'),
    });

  it('writes a starter source tree and remembers it', async () => {
    const projectRoot = path.join(tempRoot, 'procurement-model');
    const projectStore = store();
    const result = await projectStore.create({
      targetPath: projectRoot,
      name: '采购履约模型',
      modelId: 'procurement-demo',
      templateId: 'procurement',
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    expect(result.project).toMatchObject({
      name: '采购履约模型',
      modelId: 'procurement-demo',
      kind: 'directory',
      entityCount: result.document.entities.length,
      lastOpenedAt: '2026-11-11T08:00:00.000Z',
    });
    expect(result.project.modelRoot).toBe(modelRootFor(projectRoot));

    const manifest = JSON.parse(
      await readFile(
        path.join(modelRootFor(projectRoot), 'model.json'),
        'utf8',
      ),
    );

    expect(manifest.id).toBe('procurement-demo');
    expect(result.document.entities.length).toBeGreaterThan(0);

    const [recent] = await projectStore.listRecent();

    expect(recent?.rootPath).toBe(path.resolve(projectRoot));

    const reopened = await projectStore.open(projectRoot);

    expect(reopened.success).toBe(true);

    if (reopened.success) {
      expect(reopened.document.entities.map(({ id }) => id).sort()).toEqual(
        result.document.entities.map(({ id }) => id).sort(),
      );
    }
  });

  it('derives the manifest id when the caller names none', async () => {
    const result = await store().create({
      targetPath: path.join(tempRoot, 'unnamed'),
      name: 'Procurement',
      templateId: 'blank',
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.project.modelId).toBe('procurement');
    }
  });

  it('refuses a folder that already holds a model', async () => {
    const projectRoot = path.join(tempRoot, 'taken');

    await writeModelDirectory(modelRootFor(projectRoot), domainModel());

    const result = await store().create({
      targetPath: projectRoot,
      name: '采购履约模型',
      templateId: 'procurement',
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toContain('已有模型');
    }
  });

  it('writes a single-file bundle and adds the suffix', async () => {
    const targetPath = path.join(tempRoot, 'mailed-model');
    const projectStore = store();
    const result = await projectStore.create({
      targetPath,
      name: '订阅履约模型',
      templateId: 'subscription',
      kind: 'file',
    });

    expect(result.success).toBe(true);

    if (!result.success) {
      return;
    }

    const bundlePath = `${targetPath}.evidence.json`;

    expect(result.project).toMatchObject({
      rootPath: path.resolve(bundlePath),
      modelRoot: path.resolve(bundlePath),
      kind: 'file',
    });

    const bundle = JSON.parse(await readFile(bundlePath, 'utf8'));

    expect(bundle.type).toBe('fm_bundle');
    expect(bundle.manifest.name).toBe('订阅履约模型');

    const reopened = await projectStore.open(bundlePath);

    expect(reopened.success).toBe(true);
  });

  it('refuses to overwrite an existing bundle file', async () => {
    const bundlePath = path.join(tempRoot, 'again.evidence.json');

    await writeModelBundle(bundlePath, domainModel());

    const result = await store().create({
      targetPath: bundlePath,
      name: '订阅履约模型',
      kind: 'file',
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error).toContain('已存在');
    }
  });

  it('opens a blank start instead of calling it a broken tree', async () => {
    const projectRoot = path.join(tempRoot, 'blank-model');
    const projectStore = store();

    await projectStore.create({
      targetPath: projectRoot,
      name: '空白模型',
      templateId: 'blank',
    });

    const result = await projectStore.open(projectRoot);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.document.entities).toEqual([]);
      expect(result.issues.map(({ code }) => code)).toContain('model.empty');
    }
  });
});
