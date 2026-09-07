import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  executeProcess,
  prepareFmSkill,
  readFmFixtureFiles,
} from './modeling-test-support.ts';
import { tmpdir } from 'node:os';
import {
  normalizeFmModelFiles,
  validateFmModel,
  type FmModelFile,
} from './modeling.ts';

let testRoot: string;
beforeAll(async () => {
  testRoot = await mkdtemp(join(tmpdir(), 'evidence-fm-scopes-'));
  await prepareFmSkill(testRoot);
});
afterAll(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

import {
  channel,
  domain,
  entity,
  manifest,
  source,
} from './modeling-scope-test-support.ts';

async function withModel(
  files: FmModelFile[],
  check: (
    modelDir: string,
    result: Awaited<ReturnType<typeof validateFmModel>>,
  ) => Promise<void>,
) {
  const root = testRoot;
  await mkdir(join(root, 'node_modules/.cache'), { recursive: true });
  const modelDir = await mkdtemp(
    join(root, 'node_modules/.cache/evidence-fm-scope-'),
  );
  try {
    for (const file of normalizeFmModelFiles(files)) {
      const path = join(modelDir, file.path);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, file.content);
    }
    const result = await validateFmModel({
      root,
      modelDir,
      pi: { exec: executeProcess },
      timeoutMs: 120_000,
    });
    await check(modelDir, result);
  } finally {
    await rm(modelDir, { recursive: true, force: true });
  }
}

describe('FM v3 scope validation', () => {
  it.each([
    { name: 'domain', files: domain },
    { name: 'channel', files: channel },
  ])(
    'compiles pure $name without invented contracts or simulation success',
    async ({ files }) => {
      await withModel(files, async (directory, result) => {
        expect(result.passed, JSON.stringify(result.items)).toBe(true);
        expect(result.machineValidated).toBe(true);
        expect(result.simulationPassed).toBeNull();
        expect(result.items).toContainEqual(
          expect.objectContaining({
            name: 'FM validation scenarios',
            status: 'pass',
          }),
        );
        const compiled = JSON.parse(
          await readFile(join(directory, 'generated/model.json'), 'utf8'),
        );
        expect(compiled.fulfillments).toEqual([]);
        expect(compiled.model.schemaVersion).toBe('3.0');
        for (const item of compiled.entities) {
          if (item.category !== 'evidence') continue;
          expect(item.attributes).toEqual(
            expect.arrayContaining(
              ['start_at', 'expired_at'].map((name) =>
                expect.objectContaining({
                  name,
                  valueType: 'timestamp',
                  required: true,
                  keyData: true,
                }),
              ),
            ),
          );
        }
        await expect(
          readFile(join(directory, 'generated/simulation.json')),
        ).rejects.toThrow();
      });
    },
    180_000,
  );

  it('rejects a channel source missing expired_at without injecting it into YAML or compiling', async () => {
    const files = channel.map((file) => {
      if (file.path !== 'entities/proposal--quote.yaml') return file;
      const document = JSON.parse(file.content);
      document.attributes = document.attributes.filter(
        (attribute: { name: string }) => attribute.name !== 'expired_at',
      );
      return source(file.path, document);
    });
    await withModel(files, async (directory, result) => {
      expect(result.passed).toBe(false);
      expect(result.machineValidated).toBe(false);
      expect(JSON.stringify(result.items)).toContain('expired_at');
      expect(
        await readFile(
          join(directory, 'entities/proposal--quote.yaml'),
          'utf8',
        ),
      ).toBe(
        files.find((file) => file.path === 'entities/proposal--quote.yaml')!
          .content + '\n',
      );
      await expect(
        readFile(join(directory, 'generated/model.json')),
      ).rejects.toThrow();
    });
  }, 180_000);

  it('rejects v2 and an orphan Request even when the fulfillment collection is empty', async () => {
    for (const files of [
      [
        source('model.yaml', { ...manifest, schemaVersion: '2.0' }),
        ...domain.slice(1),
      ],
      [
        ...domain,
        entity('request.orphan', 'evidence', 'fulfillment_request', {
          contextRef: 'context.sample',
          responsibleRoleRef: 'role.absent',
        }),
      ],
    ]) {
      await withModel(files, async (_directory, result) => {
        expect(result.passed).toBe(false);
      });
    }
  }, 180_000);

  it('rejects orphan validation instances instead of skipping an absent scenario directory', async () => {
    const files = (
      await readFmFixtureFiles('valid-traceable-subscription')
    ).filter((file) => !file.path.startsWith('validation/scenarios/'));
    await withModel(files, async (_directory, result) => {
      expect(result.machineValidated).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.simulationPassed).toBe(false);
      expect(result.items).toContainEqual(
        expect.objectContaining({
          name: 'FM scenario simulation',
          status: 'fail',
        }),
      );
    });
  }, 180_000);

  it('removes stale optional projections when rechecking a scope without their sources', async () => {
    await withModel(domain, async (directory, result) => {
      expect(result.passed).toBe(true);
      const stale = ['generated/simulation.json', '02-business-patterns.md'];
      for (const path of stale) await writeFile(join(directory, path), 'stale');
      const rerun = await validateFmModel({
        root: testRoot,
        modelDir: directory,
        pi: { exec: executeProcess },
        timeoutMs: 120_000,
      });
      expect(rerun.passed).toBe(true);
      expect(rerun.simulationPassed).toBeNull();
      for (const path of stale)
        await expect(readFile(join(directory, path))).rejects.toThrow();
    });
  }, 180_000);

  it('generates business patterns from mixed-model YAML rather than accepting hand-written projections', async () => {
    await withModel(
      await readFmFixtureFiles('valid-content-platform'),
      async (directory, result) => {
        expect(result.passed, JSON.stringify(result.items)).toBe(true);
        const document = await readFile(
          join(directory, '02-business-patterns.md'),
          'utf8',
        );
        expect(document).toContain(
          'Generated by build_fm_business_patterns.py',
        );
        const rerun = await validateFmModel({
          root: testRoot,
          modelDir: directory,
          pi: { exec: executeProcess },
          timeoutMs: 120_000,
        });
        expect(rerun.passed).toBe(true);
        expect(
          await readFile(join(directory, '02-business-patterns.md'), 'utf8'),
        ).toBe(document);
      },
    );
  }, 180_000);
});
