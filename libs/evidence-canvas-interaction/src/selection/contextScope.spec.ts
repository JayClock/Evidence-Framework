import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { describe, expect, it } from 'vitest';
import {
  computeContextScope,
  createGraphLayout,
  rectContainsRect,
  toSerializableLayout,
} from '../index.js';
import {
  createFixtureDocument,
  createFixtureModel,
} from '../../tests/support/fixtureModel.js';

describe('computeContextScope', () => {
  it('includes descendants and explicit one-hop neighbours, not their other neighbours', () => {
    const { layout } = createFixtureModel();
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
      expect(rectContainsRect(scope.bounds, layout.nodeById.get(id)!.box)).toBe(
        true,
      );
    expect(JSON.stringify(toSerializableLayout(layout))).toBe(before);
  });
  it('does not pull a parent Context’s objects into a child scope', () => {
    const { layout } = createFixtureModel();
    const scope = computeContextScope(layout, 'context.product-procurement')!;
    expect(scope.contextIds.has('context.product-sourcing')).toBe(true);
    expect(scope.subtreeContextIds.has('context.product-sourcing')).toBe(false);
    expect(scope.nodeIds.has('evidence.rfp')).toBe(false);
  });
  it('includes responsibility-only neighbours without inventing relationship edges', () => {
    const document = createFixtureDocument();
    const request = document.entities.find(
      (entity) => entity.id === 'evidence.delivery-request',
    )!;
    if (request.category === 'evidence')
      request.responsibleRoleRef = 'role.inventory';
    const scope = computeContextScope(
      createGraphLayout(createDomainGraph(document)),
      'context.product-procurement',
    )!;
    expect(scope.nodeIds.has('role.inventory')).toBe(true);
    expect(scope.edgeIds.size).toBe(document.relationships.length);
  });
  it('only returns relevant edges even when both endpoints happen to be one-hop neighbours', () => {
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
      createGraphLayout(createDomainGraph(document)),
      'context.product-procurement',
    )!;
    expect(scope.edgeIds.has('unrelated')).toBe(false);
  });
  it('falls back to the whole model for cleared, missing and omitted Contexts', () => {
    const { layout } = createFixtureModel();
    expect(computeContextScope(layout, null)).toBeNull();
    expect(computeContextScope(layout, 'deleted')).toBeNull();
    expect(computeContextScope(layout, 'evidence.delivery-request')).toBeNull();
  });
  it('terminates on malformed Context hierarchy cycles', () => {
    const { layout } = createFixtureModel();
    const root = layout.contextGroupById.get('context.product-sourcing')!;
    const child = layout.contextGroupById.get('context.product-procurement')!;
    child.childContextIds = [root.contextId];
    root.parentContextId = child.contextId;
    expect(
      computeContextScope(layout, root.contextId)!.subtreeContextIds.size,
    ).toBe(2);
  });
});
