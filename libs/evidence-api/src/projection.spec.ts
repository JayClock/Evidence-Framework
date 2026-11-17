import { readModelRoot } from '@evidence-poc/evidence-model-io';
import { fullLifecycle, fullLifecycleIndex } from './testing/fixtures.js';
import { buildDelivery, buildProjection } from './projector.js';
import { renderOutputs } from './renderer/outputRenderer.js';
import { validateProjection } from './loader/apiLoader.js';
import { digestBytes, loadFmFromDocument } from './adapter/fmAdapter.js';
import {
  procurementEvolution,
  addFulfillmentBranches,
} from './testing/procurement.js';
import { contractProblems } from './testing/openapi.js';
describe('model-driven snapshots', () => {
  it('keeps local overrides stable while new model branches flow through every exported contract', () => {
    const before = procurementEvolution()[2]!;
    const after = addFulfillmentBranches(before);
    const design = {
      routes: [
        {
          id: 'route.confirm.confirmation.payment',
          path: '/payments/{contractId}/receipt',
          summary: 'Payment receipt',
        },
      ],
    };
    const project = (document: typeof before) =>
      buildProjection({ index: loadFmFromDocument(document).index!, design })
        .projection;
    const baseline = project(before);
    const current = project(after);
    expect(current.diagnostics).toEqual([]);
    expect(current.routes).toHaveLength(baseline.routes.length + 8);
    const routeId = design.routes[0]!.id;
    expect(current.routes.find((route) => route.id === routeId)).toEqual(
      baseline.routes.find((route) => route.id === routeId),
    );
    expect(
      current.openapi.paths['/payments/{contractId}/receipt']!['post'],
    ).toMatchObject({ summary: 'Payment receipt' });
    const files = renderOutputs(current);
    const exported = JSON.parse(files['projection.json']!);
    expect(exported).toEqual(JSON.parse(JSON.stringify(current)));
    expect(contractProblems(current.openapi)).toEqual([]);
    expect(validateProjection(exported)).toEqual([]);
    const journey = current.journeys.find((step) => step.routeId === routeId)!;
    expect(journey.path).toBe('/payments/{contractId}/receipt');
    expect(journey.nextPossibleSteps).toHaveLength(2);
    expect(JSON.parse(files['http-journeys.json']!).journeys).toContainEqual(
      journey,
    );
  });
  it('uses the same contract for memory, indexed projection and delivery exports', async () => {
    const { bundle } = await readModelRoot(fullLifecycle().modelRoot);
    const memory = buildDelivery(bundle);
    const projected = buildProjection({
      index: loadFmFromDocument(bundle).index!,
    }).projection;
    expect(memory).toEqual(projected);
    expect(memory.schemaVersion).toBe('6.0');
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
