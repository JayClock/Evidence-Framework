import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectWorkbench,
  workbenchFingerprint,
} from './collectWorkbench.js';
import { generateWorkbench, reviewPagePath } from './generateWorkbench.js';
import { WORKBENCH_MARKER } from '../render/workbenchRenderer.js';

/**
 * The verified fixture the rest of the workspace checks against: a subscription
 * model with instances, three scenarios and a passing check.
 */
const FIXTURE = fileURLToPath(
  new URL(
    '../../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
    import.meta.url,
  ),
);

const SCOPE = 'context.content-subscription';

/** A throwaway project whose `.evidence/fm` is a copy of the fixture. */
const withProject = async (
  run: (projectRoot: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbench-project-'));

  try {
    await mkdir(path.join(root, '.evidence'), { recursive: true });
    await cp(FIXTURE, path.join(root, '.evidence', 'fm'), { recursive: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

describe('workbenchFingerprint', () => {
  it('ignores generated output but notices a real input', async () => {
    await withProject(async (root) => {
      const before = await workbenchFingerprint(root);

      await mkdir(path.join(root, '.evidence', 'fm', 'generated'), {
        recursive: true,
      });
      await writeFile(
        path.join(root, '.evidence', 'fm', 'generated', 'timeline.json'),
        '{"changed":true}',
        'utf8',
      );

      expect(await workbenchFingerprint(root)).toBe(before);

      await writeFile(
        path.join(root, '.evidence', 'fm', 'notes.md'),
        'changed business explanation',
        'utf8',
      );

      expect(await workbenchFingerprint(root)).not.toBe(before);

      await rm(path.join(root, '.evidence', 'fm', 'notes.md'));
      expect(await workbenchFingerprint(root)).toBe(before);

      const modelPath = path.join(root, '.evidence', 'fm', 'model.json');
      const model = JSON.parse(await readFile(modelPath, 'utf8')) as Record<
        string,
        unknown
      >;

      await writeFile(
        modelPath,
        JSON.stringify({ ...model, name: '另一个名称' }),
        'utf8',
      );

      expect(await workbenchFingerprint(root)).not.toBe(before);
    });
  });

  it('refuses a symbolic link instead of following it', async () => {
    await withProject(async (root) => {
      await symlink(
        path.join(root, '.evidence', 'fm', 'model.json'),
        path.join(root, '.evidence', 'fm', 'linked.json'),
      );

      await expect(workbenchFingerprint(root)).rejects.toThrow(
        /输入不能链接到项目外部或使用符号链接/,
      );
    });
  });
});

describe('collectWorkbench', () => {
  it('projects a checked model with its scenarios', async () => {
    await withProject(async (root) => {
      const { data, check } = await collectWorkbench({
        projectRoot: root,
        scopeRefs: [SCOPE],
        generatedAt: '2026-11-12T00:00:00.000Z',
      });

      expect(check.valid).toBe(true);
      expect(data.title).toBe('可追溯内容订阅履约模型');
      expect(data.counts).toMatchObject({ contracts: 1, scenarios: 3 });
      expect(data.validation.complete).toBe(true);
      expect(data.validation.simulation).toBe(true);
      expect(
        data.nodes.filter((node) => node.group === 'scenario'),
      ).toHaveLength(3);
      expect(data.generatedAt).toBe('2026-11-12T00:00:00.000Z');
    });
  });

  it('stops before rendering when the model does not check', async () => {
    await withProject(async (root) => {
      await rm(
        path.join(
          root,
          '.evidence',
          'fm',
          'entities',
          'evidence-fulfillment-confirmation--content-payment.json',
        ),
      );

      await expect(
        collectWorkbench({ projectRoot: root, scopeRefs: [SCOPE] }),
      ).rejects.toThrow(/FM 未通过，不生成视图/);
    });
  });

  it('refuses a joint review without the API design it promises', async () => {
    await withProject(async (root) => {
      await expect(
        collectWorkbench({ projectRoot: root, requireApi: true }),
      ).rejects.toThrow(/联合审核需要当前 \.evidence\/api\/api\.json/);
    });
  });

  it('refuses an API review that does not name its scope', async () => {
    await withProject(async (root) => {
      await mkdir(path.join(root, '.evidence', 'api'), { recursive: true });
      await writeFile(
        path.join(root, '.evidence', 'api', 'api.json'),
        JSON.stringify({ id: 'api.test' }),
        'utf8',
      );

      await expect(collectWorkbench({ projectRoot: root })).rejects.toThrow(
        /联合审核需要显式 --scope/,
      );
    });
  });

  it('refuses to hand back data built from inputs that moved', async () => {
    await withProject(async (root) => {
      let reads = 0;

      await expect(
        collectWorkbench({
          projectRoot: root,
          scopeRefs: [SCOPE],
          fingerprint: async (projectRoot) => {
            reads += 1;

            // The second read is the one taken after the work is done.
            return reads === 1 ? 'before' : `after-${reads}`;
          },
        }),
      ).rejects.toThrow(/输入在生成期间变化，保留已有视图/);
    });
  });
});

describe('generateWorkbench', () => {
  it('writes the page inside the project and reports it', async () => {
    await withProject(async (root) => {
      const generated = await generateWorkbench({
        projectRoot: root,
        output: reviewPagePath(root),
        scopeRefs: [SCOPE],
      });

      const html = await readFile(generated.output, 'utf8');

      expect(generated.output).toBe(reviewPagePath(root));
      expect(html.startsWith(WORKBENCH_MARKER)).toBe(true);
      expect(html).toContain("connect-src 'none'");
      expect(html).toContain('id="workbench-data"');
    });
  });

  it('keeps the existing page when the input moves while rendering', async () => {
    await withProject(async (root) => {
      const page = reviewPagePath(root);

      await mkdir(path.dirname(page), { recursive: true });
      await writeFile(page, `${WORKBENCH_MARKER}\nprevious`, 'utf8');

      let reads = 0;

      await expect(
        generateWorkbench({
          projectRoot: root,
          output: page,
            scopeRefs: [SCOPE],
          fingerprint: async () => {
            reads += 1;

            return reads === 1 ? 'before' : 'after';
          },
          render: () => `${WORKBENCH_MARKER}\nnew page`,
        }),
      ).rejects.toThrow(/发布前输入变化，保留已有视图/);

      expect(await readFile(page, 'utf8')).toBe(`${WORKBENCH_MARKER}\nprevious`);
    });
  });

  it('refuses to overwrite a file it did not write', async () => {
    await withProject(async (root) => {
      const page = path.join(root, '.evidence', 'views', 'index.html');

      await mkdir(path.dirname(page), { recursive: true });
      await writeFile(page, 'unrelated', 'utf8');

      await expect(
        generateWorkbench({
          projectRoot: root,
          output: page,
            scopeRefs: [SCOPE],
        }),
      ).rejects.toThrow(/拒绝覆盖非工作台文件或符号链接/);

      expect(await readFile(page, 'utf8')).toBe('unrelated');
    });
  });
});
