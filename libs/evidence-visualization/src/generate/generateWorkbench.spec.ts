import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectWorkbench, workbenchFingerprint } from './collectWorkbench.js';
import { generateWorkbench, reviewPagePath } from './generateWorkbench.js';
import { serializeModelBundle } from '@evidence-poc/evidence-model-core';
import { readModelRoot } from '@evidence-poc/evidence-model-io';
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

describe('baseline review generation', () => {
  it('exports a portable snapshot and detects edits to that exact input before publishing', async () => {
    await withProject(async (root) => {
      const source = path.join(root, '.evidence/fm');
      const baseline = (await readModelRoot(source)).bundle;
      const current = structuredClone(baseline);
      current.entities[0]!.label += '（修订）';
      const bundlePath = path.join(root, 'current.evidence.json');
      await writeFile(bundlePath, serializeModelBundle(current));
      const output = path.join(root, 'diff-review.html');
      const generated = await generateWorkbench({
        projectRoot: root,
        modelRoot: bundlePath,
        output,
        baselineDocument: baseline,
      });
      expect(generated.data.diff?.counts.modified).toBe(1);
      const html = await readFile(output, 'utf8');
      expect(html).toContain('baselineFingerprint');
      await expect(
        generateWorkbench({
          projectRoot: root,
          modelRoot: bundlePath,
          output,
          baselineDocument: baseline,
          render: () => {
            // Fingerprinting after rendering must cover the bundle, not a neighbouring tree.
            return 'unused';
          },
          fingerprint: (() => {
            let calls = 0;
            return async () => (++calls < 4 ? 'old' : 'new');
          })(),
        }),
      ).rejects.toThrow('输入变化');
      expect(await readFile(output, 'utf8')).toBe(html);
    });
  });
});

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

  it('carries the delivery boundaries of the checked model', async () => {
    await withProject(async (root) => {
      const { data } = await collectWorkbench({
        projectRoot: root,
        scopeRefs: [SCOPE],
      });

      expect(data.delivery?.services.length).toBeGreaterThan(0);
      expect(data.nodes.filter((node) => node.group === 'service').length).toBe(
        data.delivery?.services.length,
      );
      expect(
        data.delivery?.services.every((service) => service.routes.length > 0),
      ).toBe(true);
    });
  });

  it('carries the placement of the objects it lists', async () => {
    await withProject(async (root) => {
      const { data } = await collectWorkbench({
        projectRoot: root,
        scopeRefs: [SCOPE],
      });

      const listed = new Set(data.nodes.map((node) => node.id));

      expect(data.layout.nodes.length).toBeGreaterThan(0);
      expect(data.layout.bounds.width).toBeGreaterThan(0);
      expect(
        data.layout.contextGroups.map((group) => group.contextId),
      ).toContain(SCOPE);
      // A placement only describes objects the page also lists; a node that no
      // other section knows about would be a drawing of something else.
      expect(data.layout.nodes.every((node) => listed.has(node.nodeId))).toBe(
        true,
      );
      expect(
        data.layout.nodes.every(
          (node) => Number.isFinite(node.box.x) && Number.isFinite(node.box.y),
        ),
      ).toBe(true);
      expect(JSON.parse(JSON.stringify(data.layout))).toEqual(data.layout);
      // A placement says where an object is, not what the document holds about
      // it: the reader is already given the parts of the record it may see.
      expect(data.layout.nodes.every((node) => !('entity' in node))).toBe(true);
      expect(
        data.layout.contextGroups.every((group) => !('entity' in group)),
      ).toBe(true);
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

  it('builds a model-driven API review without requiring an overlay file', async () => {
    await withProject(async (root) => {
      const result = await collectWorkbench({
        projectRoot: root,
        requireApi: true,
        scopeRefs: [SCOPE],
      });
      expect(result.projection?.schemaVersion).toBe('5.1');
      expect(result.projection?.routes.length).toBeGreaterThan(0);
      expect(result.data.counts.capabilities).toBe(
        result.projection?.routes.length,
      );
      await expect(
        collectWorkbench({ projectRoot: root, requireApi: true }),
      ).rejects.toThrow(/联合审核需要显式 --scope/);
    });
  });

  it('reviews portable inputs and applies the same route overlay to API and delivery views', async () => {
    await withProject(async (root) => {
      const bundle = (await readModelRoot(path.join(root, '.evidence/fm')))
        .bundle;
      const modelRoot = path.join(root, 'review.evidence.json');
      await writeFile(modelRoot, serializeModelBundle(bundle));
      const before = await collectWorkbench({
        projectRoot: root,
        modelRoot,
        scopeRefs: [SCOPE],
        requireApi: true,
      });
      const route = before.projection!.routes[0]!;
      await mkdir(path.join(root, '.evidence/api'), { recursive: true });
      const overlay = path.join(root, '.evidence/api/api.json');
      await writeFile(
        overlay,
        JSON.stringify({
          routes: [{ id: route.id, summary: 'Reviewed operation' }],
        }),
      );
      const after = await collectWorkbench({
        projectRoot: root,
        modelRoot,
        scopeRefs: [SCOPE],
        requireApi: true,
      });
      expect(
        after.projection!.routes.find((item) => item.id === route.id)?.summary,
      ).toBe('Reviewed operation');
      expect(after.projection!.digests.design).toMatch(/^[a-f0-9]{64}$/);
      expect(
        after.data.delivery?.services
          .flatMap((service) => service.routes)
          .some((item) => item.summary === 'Reviewed operation'),
      ).toBe(true);
      await writeFile(overlay, '{"routes":null}');
      await expect(
        collectWorkbench({
          projectRoot: root,
          modelRoot,
          scopeRefs: [SCOPE],
          requireApi: true,
        }),
      ).rejects.toThrow(/API 设计不可用/);
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

      expect(await readFile(page, 'utf8')).toBe(
        `${WORKBENCH_MARKER}\nprevious`,
      );
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
