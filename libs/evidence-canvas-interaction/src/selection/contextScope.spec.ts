import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { describe, expect, it } from 'vitest';
import {
  computeContextScope,
  computeGraphLayout,
  rectContainsRect,
  toSerializableLayout,
} from '../index.js';
import {
  createFixtureDocument,
  createFixtureModel,
} from '../../tests/support/fixtureModel.js';

const { layout } = await createFixtureModel();

describe('computeContextScope', () => {
  it('includes descendants and one-hop neighbours without mutating the layout', () => {
    const before = JSON.stringify(toSerializableLayout(layout));
    const scope = computeContextScope(layout, 'context.product-sourcing')!;
    expect([...scope.subtreeContextIds].sort()).toEqual([
      'context.product-procurement',
      'context.product-sourcing',
    ]);
    expect(scope.nodeIds.has('participant.buyer')).toBe(true);
    expect(scope.nodeIds.has('participant.product')).toBe(true);
    expect(scope.nodeIds.has('role.inventory')).toBe(false);
    expect(scope.contextIds.has('context.product-catalog')).toBe(true);
    expect(scope.edgeIds.has('relation.request-references-product')).toBe(true);
    for (const id of scope.nodeIds)
      expect(
        rectContainsRect(scope.bounds, layout.nodeById.get(id)!.worldBox),
      ).toBe(true);
    expect(JSON.stringify(toSerializableLayout(layout))).toBe(before);
  });
  it('does not pull a parent Context’s objects into a child scope', () => {
    const scope = computeContextScope(layout, 'context.product-procurement')!;
    expect(scope.contextIds.has('context.product-sourcing')).toBe(true);
    expect(scope.subtreeContextIds.has('context.product-sourcing')).toBe(false);
    expect(scope.nodeIds.has('evidence.rfp')).toBe(false);
  });
  it('includes responsibility-only neighbours without inventing edges', async () => {
    const document = createFixtureDocument();
    const request = document.entities.find(
      (entity) => entity.id === 'evidence.delivery-request',
    )!;
    if (request.category === 'evidence')
      request.responsibleRoleRef = 'role.inventory';
    const scope = computeContextScope(
      await computeGraphLayout(createDomainGraph(document)),
      'context.product-procurement',
    )!;
    expect(scope.nodeIds.has('role.inventory')).toBe(true);
    expect(scope.edgeIds.size).toBe(document.relationships.length);
  });
  it('excludes unrelated edges between neighbours', async () => {
    const document = createFixtureDocument();
    document.relationships.push({
      type: 'relationship',
      id: 'unrelated',
      kind: 'references',
      sourceRef: 'participant.buyer',
      targetRef: 'participant.product',
      label: '外部关系',
    });
    const scope = computeContextScope(
      await computeGraphLayout(createDomainGraph(document)),
      'context.product-procurement',
    )!;
    expect(scope.edgeIds.has('unrelated')).toBe(false);
  });
  it('returns null for cleared, missing and non-Context ids', () => {
    for (const id of [null, 'deleted', 'evidence.delivery-request'])
      expect(computeContextScope(layout, id)).toBeNull();
  });
});
