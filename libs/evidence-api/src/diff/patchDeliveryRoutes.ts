import type {
  DomainModelDocument,
  EntityAST,
} from '@evidence-poc/evidence-schema';
import type { ModelDiff } from '@evidence-poc/evidence-model-core';
import { canonicalJson } from '../canonicalJson.js';
import {
  buildDeliveryRoutes,
  compareRoutes,
  type DeliveryRoute,
} from '../delivery/routes.js';
import { createSegmentAllocator } from '../delivery/segments.js';

/** Rebuild affected Contexts; unchanged route objects retain their identity. */
export const patchDeliveryRoutes = (
  currentRoutes: readonly DeliveryRoute[],
  diff: ModelDiff,
  targetDocument: DomainModelDocument,
): DeliveryRoute[] => {
  const entities = [...diff.contexts, ...diff.entities];
  const matches = <T extends { id: string }>(
    items: readonly { target?: T }[],
    actual: readonly T[],
  ) =>
    canonicalJson(
      items
        .flatMap((item) => (item.target === undefined ? [] : [item.target]))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ) === canonicalJson([...actual].sort((a, b) => a.id.localeCompare(b.id)));
  if (
    diff.targetModelId !== targetDocument.manifest.id ||
    diff.baseModelId !== diff.targetModelId ||
    !matches(entities, targetDocument.entities) ||
    !matches(diff.relationships, targetDocument.relationships) ||
    !matches(diff.rules, targetDocument.rules)
  )
    throw new Error('API_PATCH_TARGET_MISMATCH: 模型差异与目标快照不一致');
  const allEntities = entities.flatMap((item) =>
    [item.base, item.target].filter(
      (value): value is EntityAST => value !== undefined,
    ),
  );
  const affected = new Set<string>();
  const touch = (ref: string) => {
    for (const entity of allEntities.filter((item) => item.id === ref)) {
      if (entity.category === 'context') affected.add(entity.id);
      else if ('contextRef' in entity && entity.contextRef !== undefined)
        affected.add(entity.contextRef);
    }
  };
  for (const item of entities)
    if (item.changeType !== 'unchanged') touch(item.id);
  for (const item of diff.relationships)
    if (item.changeType !== 'unchanged') {
      for (const edge of [item.base, item.target])
        if (edge !== undefined) {
          touch(edge.sourceRef);
          touch(edge.targetRef);
        }
    }
  for (const item of diff.rules)
    if (item.changeType !== 'unchanged') {
      for (const rule of [item.base, item.target])
        if (rule !== undefined) {
          affected.add(rule.contextRef);
          if (rule.target !== undefined) touch(rule.target.entityRef);
          for (const binding of Object.values(rule.bindings))
            if ('ref' in binding) touch(binding.ref);
        }
    }
  // Global segment allocation can rename a route outside the edited Context.
  const before = createSegmentAllocator(
    entities.flatMap((item) => (item.base === undefined ? [] : [item.id])),
  );
  const after = createSegmentAllocator(
    targetDocument.entities.map((entity) => entity.id),
  );
  for (const entity of targetDocument.entities)
    if (before.segmentOf(entity.id) !== after.segmentOf(entity.id))
      touch(entity.id);
  // Player changes also change the contextual roles they play.
  for (const edge of diff.relationships.flatMap((item) => [
    item.base,
    item.target,
  ]))
    if (
      edge?.kind === 'plays_role' &&
      entities.some(
        (item) => item.id === edge.sourceRef && item.changeType !== 'unchanged',
      )
    )
      touch(edge.targetRef);
  // Pre-contract callers inherit their parent Contract's role boundary.
  let previousSize = -1;
  while (previousSize !== affected.size) {
    previousSize = affected.size;
    for (const entity of allEntities)
      if (
        entity.category === 'context' &&
        entity.parentContextRef !== undefined &&
        affected.has(entity.parentContextRef)
      )
        affected.add(entity.id);
  }
  const old = new Map(currentRoutes.map((route) => [route.id, route]));
  const rebuilt = buildDeliveryRoutes(targetDocument, affected).map((route) => {
    const existing = old.get(route.id);
    return existing !== undefined &&
      canonicalJson(existing) === canonicalJson(route)
      ? existing
      : route;
  });
  return [
    ...currentRoutes.filter((route) => !affected.has(route.contextRef)),
    ...rebuilt,
  ].sort(compareRoutes);
};
