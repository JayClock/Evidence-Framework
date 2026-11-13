import {
  strictValidateDomainModel,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import {
  digestBytes,
  loadFmFromDocument,
  type FmIndex,
} from './adapter/fmAdapter.js';
import { canonicalJson } from './canonicalJson.js';
import {
  buildModelDelivery,
  buildDeliveryContract,
  buildDeliveryDeployment,
} from './delivery/modelDelivery.js';
import {
  errorDiagnostic,
  hasErrors,
  normalizeDiagnostics,
  type Diagnostic,
} from './diagnostics.js';
import {
  loadDesign,
  type DesignDocument,
  type JourneyOverlay,
  type RouteOverlay,
} from './loader/apiLoader.js';
import type { ApiJourneyStep, EvidenceApiSnapshot } from './types.js';
import { deriveJourneys, weaveHypermedia } from './http/hateoasWeaver.js';

export type Projection = EvidenceApiSnapshot;

export interface BuildProjectionInput {
  index: FmIndex;
  design?: DesignDocument;
}

export interface BuildProjectionResult {
  projection: EvidenceApiSnapshot;
  diagnostics: readonly Diagnostic[];
}

const parametersOf = (uri: string): string[] =>
  [...uri.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!).sort();

/** Model-derived baseline plus explicitly validated, route-keyed local overrides. */
export const buildProjection = ({
  index,
  design,
}: BuildProjectionInput): BuildProjectionResult => {
  const model = index.document;
  const baseline = buildModelDelivery(model);
  const diagnostics: Diagnostic[] = [...index.diagnostics];
  const checked = strictValidateDomainModel({
    manifest: model.manifest,
    entities: model.entities,
    relationships: model.relationships,
    rules: model.rules,
  });
  for (const issue of checked.issues) {
    diagnostics.push(
      errorDiagnostic('FM_INVALID', issue.message, undefined, issue.path),
    );
  }
  const loaded = loadDesign('overlay.json', canonicalJson(design ?? {}));
  diagnostics.push(...loaded.diagnostics);
  const overlay = loaded.diagnostics.length === 0 ? loaded.design : null;
  const overrides = new Map(
    ((overlay?.['routes'] ?? []) as RouteOverlay[]).map((route) => [
      route.id,
      route,
    ]),
  );
  const routeIds = new Set(baseline.routes.map((route) => route.id));
  for (const id of overrides.keys()) {
    if (!routeIds.has(id))
      diagnostics.push(
        errorDiagnostic('API_ROUTE_NOT_FOUND', '覆盖引用的模型路由不存在', id),
      );
  }
  const routes = baseline.routes.map((route) => {
    const override = overrides.get(route.id);
    if (override === undefined) return route;
    const path = override.path ?? route.path;
    if (
      JSON.stringify(parametersOf(path)) !==
        JSON.stringify(parametersOf(route.path)) ||
      path.includes('//') ||
      /[{}]/.test(path.replace(/\{[^{}]+\}/g, ''))
    ) {
      diagnostics.push(
        errorDiagnostic(
          'API_PATH_INVALID',
          '覆盖路径必须保留原路由的路径参数且不能包含空段或未配对花括号',
          route.id,
        ),
      );
      return route;
    }
    return {
      ...route,
      path,
      itemPath: `${path}${route.itemPath.slice(route.path.length)}`,
      summary: override.summary ?? route.summary,
    };
  });
  const occupied = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path.replace(/\{[^{}]+\}/g, '{}')}`;
    if (occupied.has(key))
      diagnostics.push(
        errorDiagnostic('API_ROUTE_COLLISION', `重复路由: ${key}`, route.id),
      );
    occupied.add(key);
  }

  const hypermedia = weaveHypermedia(model, routes);
  const declared = (overlay?.['journeys'] ?? []) as JourneyOverlay[];
  const stepIds = new Set(declared.map((step) => step.id));
  const journeys: ApiJourneyStep[] = [];
  for (const step of declared) {
    const route = routes.find((item) => item.id === step.routeId);
    const role = index.entities.get(step.roleRef);
    if (route === undefined) {
      diagnostics.push(
        errorDiagnostic('API_ROUTE_NOT_FOUND', '旅程引用的路由不存在', step.id),
      );
      continue;
    }
    if (
      role?.category !== 'role' ||
      role.kind !== 'party' ||
      !route.allowedPartyRoleRefs.includes(step.roleRef)
    ) {
      diagnostics.push(
        errorDiagnostic(
          'API_ROLE_INVALID',
          '旅程调用方必须是 Party Role',
          step.id,
        ),
      );
      continue;
    }
    for (const next of step.nextPossibleSteps ?? []) {
      if (!stepIds.has(next))
        diagnostics.push(
          errorDiagnostic(
            'API_JOURNEY_STEP_NOT_FOUND',
            `旅程后继步骤不存在: ${next}`,
            step.id,
          ),
        );
    }
    journeys.push({
      ...step,
      method: route.method,
      path: route.path,
      purpose: route.purpose,
      nextPossibleSteps: [...(step.nextPossibleSteps ?? [])],
    });
  }
  const sorted = normalizeDiagnostics(diagnostics);
  const projection: EvidenceApiSnapshot = {
    ...baseline,
    schemaVersion: '5.1',
    apiId: typeof overlay?.['id'] === 'string' ? overlay['id'] : 'default-api',
    mode: 'draft',
    routes,
    hypermedia,
    journeys:
      declared.length === 0 ? deriveJourneys(routes, hypermedia) : journeys,
    openapi: buildDeliveryContract(model, routes, baseline.services),
    deployment: buildDeliveryDeployment(
      model,
      routes,
      baseline.services,
      baseline.links,
    ),
    diagnostics: sorted,
    digests: {
      model: index.modelDigest,
      ...(design === undefined
        ? {}
        : { design: digestBytes(canonicalJson(design)) }),
      ...(index.check == null
        ? {}
        : { checkReport: digestBytes(canonicalJson(index.check)) }),
    },
  };
  return { projection, diagnostics: sorted };
};

/** Synchronous authoring entry point used by desktop and agent previews. */
export const buildDelivery = (
  document: DomainModelDocument,
): EvidenceApiSnapshot => {
  const { index } = loadFmFromDocument(document);
  return buildProjection({ index: index! }).projection;
};

/** Complete here means no API findings; it never means release authorization. */
export const isComplete = (projection: EvidenceApiSnapshot): boolean =>
  !hasErrors(projection.diagnostics) && projection.diagnostics.length === 0;
