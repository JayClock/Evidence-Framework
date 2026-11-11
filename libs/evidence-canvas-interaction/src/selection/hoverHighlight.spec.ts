import {
  computeHighlight,
  emptyHighlight,
  isContextDimmed,
  isEdgeDimmed,
  isNodeDimmed,
} from '../index.js';
import { createFixtureModel } from '../../tests/support/fixtureModel.js';

describe('computeHighlight', () => {
  const { graph, layout } = createFixtureModel();

  it('returns an empty, undimmed result without a target', () => {
    const highlight = computeHighlight({ graph, layout });

    expect(highlight.nodeIds.size).toBe(0);
    expect(highlight.dimmed).toBe(false);
    expect(isNodeDimmed(highlight, 'evidence.delivery-request')).toBe(false);
    expect(emptyHighlight().dimmed).toBe(false);
  });

  it('emphasises one hop from a hovered node', () => {
    const highlight = computeHighlight({
      graph,
      layout,
      activeNodeId: 'evidence.delivery-request',
    });

    expect(highlight.dimmed).toBe(true);
    expect([...highlight.nodeIds].sort()).toEqual([
      'evidence.delivery-confirmation',
      'evidence.delivery-request',
      'participant.product',
      'role.supplier',
    ]);
    expect([...highlight.edgeIds].sort()).toEqual([
      'relation.confirmation-references-request',
      'relation.request-references-product',
    ]);
    expect([...highlight.contextIds]).toEqual([
      'context.product-sourcing',
      'context.product-procurement',
    ]);
    expect(isNodeDimmed(highlight, 'evidence.rfp')).toBe(true);
    expect(
      isEdgeDimmed(highlight, 'relation.note-references-confirmation'),
    ).toBe(true);
  });

  it('treats a responsibility badge as the role it points at', () => {
    const highlight = computeHighlight({
      graph,
      layout,
      activeNodeId: 'role.buyer',
    });

    expect(highlight.nodeIds.has('participant.buyer')).toBe(true);
    expect(highlight.nodeIds.has('evidence.procurement-contract')).toBe(true);
  });

  it('emphasises an edge with both endpoints', () => {
    const highlight = computeHighlight({
      graph,
      layout,
      activeEdgeId: 'relation.note-references-confirmation',
    });

    expect([...highlight.nodeIds].sort()).toEqual([
      'evidence.delivery-confirmation',
      'evidence.delivery-note',
    ]);
    expect([...highlight.edgeIds]).toEqual([
      'relation.note-references-confirmation',
    ]);
    expect(highlight.contextIds.has('context.product-procurement')).toBe(true);
    expect(highlight.contextIds.has('context.product-sourcing')).toBe(true);
  });

  it('emphasises a context subtree and only its internal edges', () => {
    const highlight = computeHighlight({
      graph,
      layout,
      activeContextId: 'context.product-catalog',
    });

    expect([...highlight.contextIds]).toEqual(['context.product-catalog']);
    expect([...highlight.nodeIds].sort()).toEqual([
      'participant.product',
      'role.inventory',
    ]);
    expect(highlight.edgeIds.size).toBe(0);
    expect(isContextDimmed(highlight, 'context.product-procurement')).toBe(
      true,
    );
  });

  it('degrades gracefully for unknown ids', () => {
    expect(
      computeHighlight({ graph, layout, activeNodeId: 'missing' }).nodeIds.size,
    ).toBe(0);
    expect(
      computeHighlight({ graph, layout, activeEdgeId: 'missing' }).dimmed,
    ).toBe(false);
    expect(
      computeHighlight({ graph, layout, activeContextId: 'missing' }).dimmed,
    ).toBe(false);
  });
});
