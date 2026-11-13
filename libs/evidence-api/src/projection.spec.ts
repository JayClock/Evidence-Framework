import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  readModelRoot,
  serializeModelBundle,
} from '@evidence-poc/evidence-model-core';
import { runCli } from './cli.js';
import {
  fullLifecycle,
  fullLifecycleIndex,
  checkReportFor,
} from '../tests/support/fixtures.js';
import { buildDelivery, buildProjection } from './projector.js';
import { renderOutputs, writeOutput } from './renderer/outputRenderer.js';
import { validateProjection } from './loader/apiLoader.js';
import { digestBytes, loadFmFromDocument } from './adapter/fmAdapter.js';

const withScratch = async (
  run: (directory: string) => Promise<void>,
): Promise<void> => {
  const directory = mkdtempSync(path.join(tmpdir(), 'evidence-api-'));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const args = (command: string, directory: string): string[] => [
  command,
  '--project-root',
  directory,
  '--fm',
  fullLifecycle().modelRoot,
];

describe('model-driven snapshots', () => {
  it('uses the same contract for memory, indexed projection and delivery exports', async () => {
    const { bundle } = await readModelRoot(fullLifecycle().modelRoot);
    const memory = buildDelivery(bundle);
    const projected = buildProjection({
      index: loadFmFromDocument(bundle).index!,
    }).projection;
    expect(memory).toEqual(projected);
    expect(memory.schemaVersion).toBe('5.1');
    expect(memory.mode).toBe('draft');
    expect(memory.routes.length).toBeGreaterThan(0);
    expect(memory.journeys.length).toBeGreaterThan(0);
    expect(memory.diagnostics).toEqual([]);
    expect(memory.digests.checkReport).toBeUndefined();
    expect(validateProjection(memory)).toEqual([]);
    const outputs = renderOutputs(memory);
    expect(JSON.parse(outputs['openapi.json']!)).toEqual(memory.openapi);
    const manifest = JSON.parse(outputs['manifest.json']!);
    expect(manifest.inputs).toEqual(memory.digests);
    for (const [name, content] of Object.entries(outputs)) {
      if (name === 'manifest.json') continue;
      expect(manifest.outputs[name]).toEqual({
        sha256: digestBytes(content),
        bytes: Buffer.byteLength(content),
      });
    }
    expect(renderOutputs(projected)).toEqual(outputs);
  });

  it('updates one route without losing other generated routes or changing the model', async () => {
    const index = await fullLifecycleIndex();
    const original = JSON.stringify(index.document);
    const baseline = buildProjection({ index }).projection;
    const route = baseline.routes.find((item) => item.method === 'POST')!;
    const next = buildProjection({
      index,
      design: {
        routes: [
          {
            id: route.id,
            path: `/custom${route.path}`,
            summary: 'Custom summary',
          },
        ],
      },
    });
    expect(next.diagnostics).toEqual([]);
    expect(next.projection.routes).toHaveLength(baseline.routes.length);
    expect(
      next.projection.routes.find((item) => item.id === route.id),
    ).toMatchObject({
      path: `/custom${route.path}`,
      summary: 'Custom summary',
    });
    expect(
      next.projection.openapi.paths[`/custom${route.path}`]?.['post'],
    ).toMatchObject({ summary: 'Custom summary' });
    expect(
      next.projection.routes.filter((item) => item.id !== route.id),
    ).toEqual(baseline.routes.filter((item) => item.id !== route.id));
    expect(JSON.stringify(index.document)).toBe(original);
  });

  it('rejects dangling overrides, altered identity parameters and collisions', async () => {
    const index = await fullLifecycleIndex();
    const routes = buildProjection({ index }).projection.routes.filter(
      (route) => route.method === 'POST',
    );
    const a = routes[0]!;
    const b = routes.find(
      (route) =>
        route.path !== a.path &&
        route.path.match(/\{/g)?.length === a.path.match(/\{/g)?.length,
    )!;
    expect(
      buildProjection({ index, design: { routes: [{ id: 'missing' }] } })
        .diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'API_ROUTE_NOT_FOUND' }));
    const withParams = buildProjection({ index }).projection.routes.find(
      (route) => route.path.includes('{'),
    )!;
    expect(
      buildProjection({
        index,
        design: { routes: [{ id: withParams.id, path: '/without-identity' }] },
      }).diagnostics,
    ).toContainEqual(expect.objectContaining({ code: 'API_PATH_INVALID' }));
    const collision = buildProjection({
      index,
      design: { routes: [{ id: b.id, path: a.path }] },
    });
    expect(collision.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'API_ROUTE_COLLISION' }),
    );
  });

  it('allows explicit journey overrides and validates their references', async () => {
    const index = await fullLifecycleIndex();
    const route = buildProjection({ index }).projection.routes.find(
      (item) => item.purpose === 'sign',
    )!;
    const next = buildProjection({
      index,
      design: {
        journeys: [{ id: 'start', roleRef: 'role.buyer', routeId: route.id }],
      },
    });
    expect(next.diagnostics).toEqual([]);
    expect(next.projection.journeys).toEqual([
      {
        id: 'start',
        roleRef: 'role.buyer',
        routeId: route.id,
        path: route.path,
        method: route.method,
        purpose: route.purpose,
        nextPossibleSteps: [],
      },
    ]);
    const broken = buildProjection({
      index,
      design: {
        journeys: [
          {
            id: 'start',
            roleRef: 'role.buyer',
            routeId: route.id,
            nextPossibleSteps: ['missing'],
          },
        ],
      },
    });
    expect(broken.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'API_JOURNEY_STEP_NOT_FOUND' }),
    );
  });

  it('reports static errors instead of inventing passing validation evidence', async () => {
    const { bundle } = await readModelRoot(fullLifecycle().modelRoot);
    const broken = {
      ...bundle,
      entities: [...bundle.entities, bundle.entities[0]!],
    };
    expect(buildDelivery(broken).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'FM_INVALID', severity: 'error' }),
    );
  });
});

describe('live CLI', () => {
  it.each(['inspect', 'check', 'project', 'deliver'])(
    'runs %s without an offline report or design',
    async (command) => {
      await withScratch(async (directory) => {
        const out = path.join(directory, 'generated');
        const result = await runCli([
          ...args(command, directory),
          '--out',
          out,
        ]);
        expect(result.error).toBeUndefined();
        expect(result.exitCode).toBe(0);
        expect(result.output).toMatchObject({
          status: 'FM_LIVE_INSPECTED',
          valid: true,
          mode: 'draft',
        });
        expect(existsSync(out)).toBe(
          command === 'project' || command === 'deliver',
        );
        if (existsSync(out)) {
          const snapshot = JSON.parse(
            readFileSync(path.join(out, 'projection.json'), 'utf8'),
          );
          expect(validateProjection(snapshot)).toEqual([]);
          expect(snapshot.digests.checkReport).toBeUndefined();
          expect(
            JSON.parse(readFileSync(path.join(out, 'openapi.json'), 'utf8')),
          ).toEqual(snapshot.openapi);
        }
      });
    },
  );

  it('projects a bundle using the same model-derived routes', async () => {
    await withScratch(async (directory) => {
      const { bundle } = await readModelRoot(fullLifecycle().modelRoot);
      const file = path.join(directory, 'model.evidence.json');
      writeFileSync(file, serializeModelBundle(bundle));
      const result = await runCli([
        'check',
        '--project-root',
        directory,
        '--fm',
        file,
      ]);
      expect(result.exitCode).toBe(0);
      expect(
        (result.output as { projection: { routes: unknown } }).projection
          .routes,
      ).toEqual(buildDelivery(bundle).routes);
    });
  });

  it('writes a current draft with stale-check gaps rather than hiding it', async () => {
    await withScratch(async (directory) => {
      const check = await checkReportFor(fullLifecycle().modelRoot, [
        'context.product-procurement',
      ]);
      const report = path.join(directory, 'check.json');
      writeFileSync(
        report,
        JSON.stringify({ ...check, modelDigest: 'sha256:old' }),
      );
      const out = path.join(directory, 'generated');
      const result = await runCli([
        ...args('project', directory),
        '--fm-check',
        report,
        '--out',
        out,
      ]);
      expect(result.exitCode).toBe(3);
      expect(result.output).toMatchObject({
        valid: true,
        complete: false,
        diagnostics: [
          expect.objectContaining({ code: 'FM_CHECK_STALE', severity: 'gap' }),
        ],
      });
      expect(existsSync(path.join(out, 'projection.json'))).toBe(true);
    });
  });

  it('accepts empty and partial overlay files', async () => {
    await withScratch(async (directory) => {
      const overlay = path.join(directory, 'api.json');
      const route = (await fullLifecycleIndex()).document;
      for (const input of [
        {},
        {
          routes: [
            { id: buildDelivery(route).routes[0]!.id, summary: 'New title' },
          ],
        },
      ]) {
        writeFileSync(overlay, JSON.stringify(input));
        expect(
          (await runCli([...args('check', directory), '--api', overlay]))
            .exitCode,
        ).toBe(0);
      }
    });
  });

  it('does not replace an existing export when an overlay is malformed', async () => {
    await withScratch(async (directory) => {
      const out = path.join(directory, 'generated');
      writeOutput(out, { 'keep.txt': 'previous' });
      const overlay = path.join(directory, 'api.json');
      for (const input of [
        '{"routes":null}',
        '{"routes":[{"id":"missing"}]}',
        '{',
      ]) {
        writeFileSync(overlay, input);
        const result = await runCli([
          ...args('project', directory),
          '--api',
          overlay,
          '--out',
          out,
        ]);
        expect(result.exitCode).toBe(1);
        expect(readFileSync(path.join(out, 'keep.txt'), 'utf8')).toBe(
          'previous',
        );
      }
    });
  });

  it('fails explicitly supplied unreadable reports instead of throwing', async () => {
    await withScratch(async (directory) => {
      const result = await runCli([
        ...args('project', directory),
        '--fm-check',
        path.join(directory, 'missing.json'),
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.output).toMatchObject({
        diagnostics: [expect.objectContaining({ code: 'FM_CHECK_INVALID' })],
      });
    });
  });

  it('protects inputs even when no optional report was supplied', async () => {
    await withScratch(async (directory) => {
      const fm = path.join(directory, 'fm');
      cpSync(fullLifecycle().modelRoot, fm, { recursive: true });
      const result = await runCli([
        'deliver',
        '--project-root',
        directory,
        '--fm',
        fm,
        '--out',
        path.join(fm, 'generated'),
      ]);
      expect(result.error).toContain('OUTPUT_INPUT_CONFLICT');
      const relative = await runCli([
        'inspect',
        '--project-root',
        directory,
        '--fm',
        'relative',
      ]);
      expect(relative.error).toContain('PATH_NOT_ABSOLUTE');
    });
  });

  it('protects source trees reached through output symlinks', async () => {
    await withScratch(async (directory) => {
      const fm = path.join(directory, 'fm');
      cpSync(fullLifecycle().modelRoot, fm, { recursive: true });
      const alias = path.join(directory, 'alias');
      symlinkSync(fm, alias, 'dir');
      const manifest = readFileSync(path.join(fm, 'model.json'), 'utf8');
      const result = await runCli([
        'project',
        '--project-root',
        directory,
        '--fm',
        fm,
        '--out',
        path.join(alias, 'new-output'),
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.error).toContain('OUTPUT_INPUT_CONFLICT');
      expect(readFileSync(path.join(fm, 'model.json'), 'utf8')).toBe(manifest);
      expect(existsSync(path.join(fm, 'new-output'))).toBe(false);
    });
  });

  it('rejects output aliases that escape the project', async () => {
    await withScratch(async (directory) => {
      await withScratch(async (outside) => {
        const alias = path.join(directory, 'external');
        symlinkSync(outside, alias, 'dir');
        const result = await runCli([
          ...args('deliver', directory),
          '--out',
          path.join(alias, 'output'),
        ]);
        expect(result.exitCode).toBe(1);
        expect(result.error).toContain('OUTPUT_OUTSIDE_PROJECT');
        expect(existsSync(path.join(outside, 'output'))).toBe(false);
      });
    });
  });

  it('reports unknown commands and malformed options', async () => {
    expect((await runCli(['unknown'])).error).toContain('usage: evidence-api');
    expect(
      (await runCli(['check', '--fm', '--out', '/tmp/out'])).error,
    ).toContain('needs a value');
    expect((await runCli(['check', '--unknown', 'x'])).error).toContain(
      'unexpected argument',
    );
  });
});
