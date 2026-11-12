import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runCli } from './cli.js';
import { checkReportFor, fullLifecycle, fullLifecycleIndex } from '../tests/support/fixtures.js';
import { buildProjection } from './projector.js';
import { renderOutputs } from './renderer/outputRenderer.js';
import { loadDesign } from './loader/apiLoader.js';
import { buildOpenApi } from './openapi/openapi.js';

/**
 * The end-to-end contract of the engine.
 *
 * A projection has to be reproducible: the same model, the same design and the
 * same digest produce the same bytes. The strongest way to say that is to compare
 * with the artifacts committed beside the model.
 */

const fixturePath = (name: string): string =>
  path.resolve(fullLifecycle().modelRoot, '..', name);

const withScratch = async (run: (directory: string) => Promise<void>): Promise<void> => {
  const directory = mkdtempSync(path.join(tmpdir(), 'evidence-api-'));

  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

/** Writes the check report the FM stage would have handed over. */
const checkFileFor = async (directory: string): Promise<string> => {
  const report = await checkReportFor(fullLifecycle().modelRoot, [
    'context.product-procurement',
  ]);
  const target = path.join(directory, 'fm-check.json');

  return (await import('node:fs')).writeFileSync(
    target,
    `${JSON.stringify(report, null, 2)}\n`,
  ), target;
};

describe('deliver command', () => {
  it('writes the contract, the topology and the limitations of a checked model', async () => {
    await withScratch(async (directory) => {
      const fmCheck = await checkFileFor(directory);
      const out = path.join(directory, 'delivery');
      const result = await runCli([
        'deliver',
        '--project-root',
        directory,
        '--fm',
        fullLifecycle().modelRoot,
        '--fm-check',
        fmCheck,
        '--out',
        out,
      ]);

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatchObject({
        modelId: 'product-procurement-full-lifecycle',
        out,
        serviceCount: 4,
      });
      expect(statSync(path.join(out, 'openapi.json')).isFile()).toBe(true);
      expect(
        JSON.parse(readFileSync(path.join(out, 'openapi.json'), 'utf8')),
      ).toMatchObject({ openapi: '3.1.0' });
      expect(
        JSON.parse(readFileSync(path.join(out, 'topology.json'), 'utf8')),
      ).toMatchObject({ modelId: 'product-procurement-full-lifecycle' });
    });
  });

  it('refuses a model whose check report no longer matches the sources', async () => {
    await withScratch(async (directory) => {
      const result = await runCli([
        'deliver',
        '--project-root',
        directory,
        '--fm',
        fullLifecycle().modelRoot,
        '--fm-check',
        path.join(directory, 'missing-check.json'),
      ]);

      expect(result.exitCode).toBe(1);
    });
  });
});

describe('projection of the full-lifecycle fixture', () => {
  it('writes the six generated documents', async () => {
    await withScratch(async (directory) => {
      const fmCheck = await checkFileFor(directory);
      const out = path.join(directory, 'generated');
      const result = await runCli([
        'project',
        '--project-root',
        directory,
        '--fm',
        fullLifecycle().modelRoot,
        '--fm-check',
        fmCheck,
        '--api',
        fullLifecycle().designPath,
        '--out',
        out,
      ]);

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatchObject({
        valid: true,
        complete: true,
        interfaceCount: 13,
        gapCount: 0,
        out,
      });

      for (const name of [
        'projection.json',
        'openapi.json',
        'http-journeys.json',
        'representation-examples.json',
        'e2e-test-vectors.json',
        'manifest.json',
      ]) {
        expect(statSync(path.join(out, name)).size).toBeGreaterThan(0);
      }
    });
  });

  it('renders the OpenAPI document the repository already carries', async () => {
    const index = await fullLifecycleIndex();
    const { design } = loadDesign(fullLifecycle().designPath);
    const { projection } = buildProjection({
      design: design as Record<string, unknown>,
      index,
      projectRoot: path.dirname(fullLifecycle().modelRoot),
      apiContent: readFileSync(fullLifecycle().designPath),
    });
    const rendered = renderOutputs(projection as unknown as Record<string, unknown>);

    expect(rendered['openapi.json']).toBe(
      readFileSync(fixturePath('openapi.json'), 'utf8'),
    );
  });

  it('keeps the manifest honest about the schemas and the runtime', async () => {
    const index = await fullLifecycleIndex();
    const { design } = loadDesign(fullLifecycle().designPath);
    const { projection } = buildProjection({
      design: design as Record<string, unknown>,
      index,
      projectRoot: path.dirname(fullLifecycle().modelRoot),
      apiContent: readFileSync(fullLifecycle().designPath),
    });
    const rendered = renderOutputs(projection as unknown as Record<string, unknown>);
    const manifest = JSON.parse(rendered['manifest.json'] as string) as {
      schemaVersion: string;
      tool: { name: string; version: string; schemas: Record<string, string> };
      runtime: { node: string; dependencies: Record<string, string> };
      outputs: Record<string, { sha256: string; bytes: number }>;
    };

    expect(manifest.schemaVersion).toBe('5.0');
    expect(manifest.tool).toMatchObject({ name: 'evidence-api', version: '5.0.0' });
    expect(Object.keys(manifest.tool.schemas).sort()).toEqual([
      'api-projection.schema.json',
      'api.schema.json',
    ]);
    expect(manifest.runtime.node).toBe(process.versions.node);
    expect(Object.keys(manifest.outputs)).toEqual([
      'e2e-test-vectors.json',
      'http-journeys.json',
      'openapi.json',
      'projection.json',
      'representation-examples.json',
    ]);
    // The digests describe the documents that were actually written.
    for (const [name, entry] of Object.entries(manifest.outputs)) {
      expect(Buffer.byteLength(rendered[name] as string, 'utf8')).toBe(entry.bytes);
    }
  });
});

describe('cli', () => {
  it('lists what the model offers without writing anything', async () => {
    await withScratch(async (directory) => {
      const fmCheck = await checkFileFor(directory);
      const result = await runCli([
        'inspect',
        '--project-root',
        directory,
        '--fm',
        fullLifecycle().modelRoot,
        '--fm-check',
        fmCheck,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.output).toMatchObject({ schemaVersion: '5.0' });
    });
  });

  it('refuses a relative path instead of guessing one', async () => {
    await withScratch(async (directory) => {
      const fmCheck = await checkFileFor(directory);
      const result = await runCli([
        'inspect',
        '--project-root',
        directory,
        '--fm',
        'tests/fixtures/full-lifecycle/fm',
        '--fm-check',
        fmCheck,
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe('PATH_NOT_ABSOLUTE: --fm 必须使用绝对路径');
    });
  });

  it('refuses an output directory outside the project', async () => {
    await withScratch(async (directory) => {
      const fmCheck = await checkFileFor(directory);
      const result = await runCli([
        'project',
        '--project-root',
        directory,
        '--fm',
        fullLifecycle().modelRoot,
        '--fm-check',
        fmCheck,
        '--api',
        fullLifecycle().designPath,
        '--out',
        path.join(fullLifecycle().modelRoot, 'generated'),
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.error).toBe(
        'OUTPUT_OUTSIDE_PROJECT: 输出目录必须位于项目根内',
      );
    });
  });

  it('refuses an output directory that overlaps an input', async () => {
    await withScratch(async (directory) => {
      const fmCheck = path.join(directory, 'fm-check.json');
      const modelRoot = path.join(directory, 'fm');
      const { cpSync } = await import('node:fs');

      cpSync(fullLifecycle().modelRoot, modelRoot, { recursive: true });
      (await import('node:fs')).writeFileSync(
        fmCheck,
        JSON.stringify(
          await checkReportFor(fullLifecycle().modelRoot, [
            'context.product-procurement',
          ]),
        ),
      );

      const result = await runCli([
        'project',
        '--project-root',
        directory,
        '--fm',
        modelRoot,
        '--fm-check',
        fmCheck,
        '--api',
        fullLifecycle().designPath,
        '--out',
        path.join(modelRoot, 'generated'),
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('OUTPUT_INPUT_CONFLICT');
    });
  });

  it('refuses a check report that does not prove the model', async () => {
    await withScratch(async (directory) => {
      const fmCheck = await checkFileFor(directory);
      const report = JSON.parse(readFileSync(fmCheck, 'utf8')) as Record<string, unknown>;
      (await import('node:fs')).writeFileSync(
        fmCheck,
        JSON.stringify({ ...report, modelDigest: 'sha256:stale' }),
      );

      const result = await runCli([
        'inspect',
        '--project-root',
        directory,
        '--fm',
        fullLifecycle().modelRoot,
        '--fm-check',
        fmCheck,
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.output).toMatchObject({
        valid: false,
        diagnostics: [expect.objectContaining({ code: 'FM_CHECK_STALE' })],
      });
    });
  });

  it('reports a usage error rather than throwing', async () => {
    const result = await runCli(['nonsense']);

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('usage: evidence-api');
    expect(result.output).toBeNull();
  });
});

describe('a second design against a second model', () => {
  it('projects the subscription API into the same documents', async () => {
    const { cpSync, writeFileSync } = await import('node:fs');
    const modelRoot = fileURLToPath(
      new URL(
        '../../evidence-model-core/tests/fixtures/models/valid-traceable-subscription',
        import.meta.url,
      ),
    );
    const designPath = fileURLToPath(
      new URL(
        '../tests/fixtures/subscription-api.json',
        import.meta.url,
      ),
    );

    await withScratch(async (directory) => {
      // The design quotes a business source, so the project root has to hold it.
      cpSync(
        fileURLToPath(
          new URL(
            '../tests/fixtures/source.md',
            import.meta.url,
          ),
        ),
        path.join(directory, 'source.md'),
      );
      const fmCheck = path.join(directory, 'fm-check.json');
      writeFileSync(
        fmCheck,
        JSON.stringify(
          await checkReportFor(modelRoot, ['context.content-subscription']),
        ),
      );

      const out = path.join(directory, 'generated');
      const result = await runCli([
        'project',
        '--project-root',
        directory,
        '--fm',
        modelRoot,
        '--fm-check',
        fmCheck,
        '--api',
        designPath,
        '--out',
        out,
      ]);

      expect(result.error).toBeUndefined();
      expect(result.exitCode).toBe(0);
      expect(result.output).toMatchObject({ complete: true, interfaceCount: 2 });

      const openapi = JSON.parse(
        readFileSync(path.join(out, 'openapi.json'), 'utf8'),
      ) as { paths: Record<string, unknown>; 'x-generated-from': string };

      expect(openapi['x-generated-from']).toBe('evidence-api projection.json');
      // The two routes this design licenses, neither more nor fewer.
      expect(Object.keys(openapi.paths).sort()).toEqual([
        '/payment-confirmations',
        '/subscriptions/{subscriptionId}/payments',
      ]);
    });
  });
});

describe('buildOpenApi', () => {
  it('groups a shared route into one operation with both actors', async () => {
    const index = await fullLifecycleIndex();
    const { design } = loadDesign(fullLifecycle().designPath);
    const { projection } = buildProjection({
      design: design as Record<string, unknown>,
      index,
      projectRoot: path.dirname(fullLifecycle().modelRoot),
      apiContent: readFileSync(fullLifecycle().designPath),
    });
    const document = buildOpenApi(projection as unknown as Record<string, unknown>);
    const paths = document['paths'] as Record<string, Record<string, unknown>>;
    const operation = paths['/products/{productId}']?.['get'] as Record<
      string,
      unknown
    >;

    expect(operation['x-actor-role-refs']).toEqual(['role.buyer', 'role.seller']);
    expect(operation['x-fm-capability-refs']).toEqual([
      'capability.read-product-as-buyer',
      'capability.read-product-as-seller',
    ]);
    expect(
      (document['components'] as { schemas: Record<string, unknown> }).schemas,
    ).toHaveProperty('representation_product-http');
  });
});
