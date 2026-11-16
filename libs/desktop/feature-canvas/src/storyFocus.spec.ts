import { describe, expect, it } from 'vitest';
import { computeGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { summarizeCards } from './cardSummary';
import { convertLayoutToReactFlow } from './useReactFlowAdapter';
import { applyStoryFocus, type CanvasStoryFocus } from './storyFocus';

const document = createDesktopFixture();
const layout = await computeGraphLayout(createDomainGraph(document));
const canvas = convertLayoutToReactFlow({
  layout,
  document,
  selection: { nodeId: 'role.inventory', attributeName: null },
  highlightedNodeIds: new Set(['role.inventory']),
  highlightedContextIds: new Set(),
  highlightedEdgeIds: new Set(),
  dimmed: true,
  scope: null,
  overlay: null,
  summaries: summarizeCards(document),
  hoveredEdgeId: null,
  viewMode: 'standard',
});
const focus: CanvasStoryFocus = {
  activeEntityId: 'evidence.confirmation',
  dependencyEntityIds: ['evidence.request'],
  relatedEntityIds: ['role.buyer'],
  focusKey: 'flow:step-3',
};

describe('story canvas projection', () => {
  it('pulses the active document, keeps dependencies and roles readable, and dims unrelated nodes to .35', () => {
    const result = applyStoryFocus(canvas, focus);
    const node = (id: string) => result.nodes.find((node) => node.id === id);
    expect(node('evidence.confirmation')?.className).toBe(
      'evidence-story-active',
    );
    expect(node('evidence.confirmation')?.style?.opacity).toBe(1);
    expect(node('evidence.request')?.style?.opacity).toBe(1);
    expect(node('role.buyer')?.style?.opacity).toBe(1);
    expect(node('role.inventory')?.style?.opacity).toBe(0.35);
    expect(node('role.inventory')?.data.dimmed).toBe(false);
    expect(node('context.procurement')?.data.highlighted).toBe(true);
    expect(
      result.nodes.map(({ id, position, parentId }) => ({
        id,
        position,
        parentId,
      })),
    ).toEqual(
      canvas.nodes.map(({ id, position, parentId }) => ({
        id,
        position,
        parentId,
      })),
    );
  });

  it('animates only existing dependency routes, including fulfillment pairs, toward the active document', () => {
    const result = applyStoryFocus(canvas, focus);
    const animated = result.edges.filter((edge) => edge.data?.storyActive);
    expect(animated).toHaveLength(2);
    expect(animated.map(({ type }) => type).sort()).toEqual([
      'fulfillmentEdge',
      'pairLink',
    ]);
    const reference = animated.find(({ type }) => type === 'fulfillmentEdge');
    expect(reference?.data?.storyReversed).toBe(true);
    const pair = animated.find(({ type }) => type === 'pairLink');
    expect(pair?.data?.storyReversed).toBe(false);
    expect(result.edges).toHaveLength(canvas.edges.length);
    expect(
      result.edges.find((edge) => edge.id === 'relation.buyer-plays-role')?.data
        ?.storyActive,
    ).not.toBe(true);
  });

  it('does not mutate the topology projection and is a no-op when inactive or the entity disappeared', () => {
    const original = structuredClone(canvas);
    applyStoryFocus(canvas, focus);
    expect(canvas).toEqual(original);
    expect(applyStoryFocus(canvas, null)).toBe(canvas);
    expect(
      applyStoryFocus(canvas, { ...focus, activeEntityId: 'deleted' }),
    ).toBe(canvas);
  });
});
