import { describe, expect, it } from 'vitest';

import {
  computeContextScope,
  createGraphLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

import { summarizeCards } from './cardSummary';
import { boundsOf, convertLayoutToReactFlow } from './useReactFlowAdapter';

const document = createDesktopFixture();
const graph = createDomainGraph(document);
const layout = createGraphLayout(graph, { viewMode: 'standard' });
const summaries = summarizeCards(document);

const convert = (
  overrides: Partial<Parameters<typeof convertLayoutToReactFlow>[0]> = {},
) =>
  convertLayoutToReactFlow({
    layout,
    document,
    selection: { nodeId: null, attributeName: null },
    highlightedNodeIds: new Set<string>(),
    highlightedEdgeIds: new Set<string>(),
    highlightedContextIds: new Set<string>(),
    dimmed: false,
    scope: null,
    overlay: null,
    summaries,
    hoveredEdgeId: null,
    viewMode: 'standard',
    ...overrides,
  });

describe('convertLayoutToReactFlow', () => {
  it('lists every Context before the notes pinned to it', () => {
    const { nodes } = convert();
    const firstEntity = nodes.findIndex((node) => node.type === 'entityNode');

    expect(firstEntity).toBe(layout.contextGroups.length);
    expect(nodes.filter((node) => node.type === 'contextGroup')).toHaveLength(
      layout.contextGroups.length,
    );
    expect(nodes.filter((node) => node.type === 'entityNode')).toHaveLength(
      layout.nodes.length,
    );
  });

  it('folds a child position to its Context origin and keeps free nodes absolute', () => {
    const { nodes } = convert();
    const placed = layout.nodeById.get('evidence.contract')!;
    const group = layout.contextGroups.find(
      (candidate) => candidate.contextId === placed.contextId,
    )!;
    const node = nodes.find((candidate) => candidate.id === 'evidence.contract')!;

    expect(node.parentId).toBe(placed.contextId);
    expect(node.position).toEqual({
      x: placed.box.x - group.box.x,
      y: placed.box.y - group.box.y,
    });
    expect(node.style).toMatchObject({
      width: placed.box.width,
      height: placed.box.height,
    });

    const free = layout.nodes.find((candidate) => candidate.contextId === null);
    if (free !== undefined) {
      const freeNode = nodes.find((candidate) => candidate.id === free.nodeId)!;
      expect(freeNode.position).toEqual({ x: free.box.x, y: free.box.y });
      expect(freeNode.parentId).toBeUndefined();
    }
  });

  it('draws the card at its own origin so the wrapper owns the geometry', () => {
    const { nodes } = convert();
    const node = nodes.find((candidate) => candidate.id === 'evidence.contract')!;
    const data = node.data as { node: { box: { x: number; y: number } } };

    expect(data.node.box).toMatchObject({ x: 0, y: 0 });
  });

  it('binds each relationship to its two objects and keeps the route', () => {
    const { edges } = convert();
    const routed = layout.edges.find(
      (edge) => edge.relationshipId === 'relation.confirmation-references-request',
    )!;
    const edge = edges.find((candidate) => candidate.id === routed.relationshipId)!;

    expect(edge.source).toBe(routed.sourceRef);
    expect(edge.target).toBe(routed.targetRef);
    expect(edge.type).toBe('fulfillmentEdge');
    expect(
      (edge.data as { edge: { points: unknown } }).edge.points,
    ).toEqual(routed.points);
  });

  it('states a fulfillment pair as its own dashed edge', () => {
    const { edges } = convert();
    const pair = edges.filter((edge) => edge.type === 'pairLink');

    expect(pair.length).toBeGreaterThan(0);
    expect(pair[0]!.id.startsWith('pair:')).toBe(true);
    expect(pair[0]!.data).toMatchObject({ outOfScope: false });
  });

  it('skips an edge whose endpoints the layout did not place', () => {
    const narrowed = {
      ...layout,
      edges: [
        ...layout.edges,
        {
          ...layout.edges[0]!,
          relationshipId: 'relation.ghost',
          sourceRef: 'participant.ghost',
        },
      ],
      edgeById: layout.edgeById,
    };
    const { edges } = convert({ layout: narrowed });

    expect(edges.some((edge) => edge.id === 'relation.ghost')).toBe(false);
  });

  it('carries selection, highlights and scope into the nodes', () => {
    const { nodes } = convert({
      selection: { nodeId: 'evidence.contract', attributeName: null },
      highlightedNodeIds: new Set(['evidence.contract']),
    });
    const selected = nodes.find(
      (candidate) => candidate.id === 'evidence.contract',
    )!;
    const other = nodes.find((candidate) => candidate.id === 'evidence.request')!;

    expect(selected.data).toMatchObject({ selected: true, highlighted: true });
    expect(other.data).toMatchObject({ selected: false, highlighted: false });
    // A Context is paper: it must never paint over the notes it holds.
    expect(selected.style).toMatchObject({ zIndex: 2 });
    expect(
      nodes.find((candidate) => candidate.type === 'contextGroup')!.style,
    ).toMatchObject({ zIndex: 0 });
  });

  it('declares the anchors so an edge can render before anything is measured', () => {
    const { nodes } = convert();
    const node = nodes.find((candidate) => candidate.id === 'evidence.contract')!;

    expect(node.initialWidth).toBeGreaterThan(0);
    expect(node.handles?.map((handle) => handle.id)).toEqual([
      'source',
      'target',
    ]);
  });

  it('dims the parts of the model outside the focused Context', () => {
    const { nodes } = convert({
      scope: computeContextScope(layout, 'context.catalog'),
    });

    expect(
      nodes.find((candidate) => candidate.id === 'evidence.contract')!.data,
    ).toMatchObject({ outOfScope: true });
    expect(
      nodes.find((candidate) => candidate.id === 'role.inventory')!.data,
    ).toMatchObject({ outOfScope: false });
  });

  it('describes the box the stage must show', () => {
    expect(boundsOf(layout, null)).toEqual({
      x: layout.bounds.x,
      y: layout.bounds.y,
      width: layout.bounds.width,
      height: layout.bounds.height,
    });
  });
});
