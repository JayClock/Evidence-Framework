import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeGraphLayout,
  rectContainsRect,
  type Point,
  type Rect,
} from '@evidence-poc/evidence-canvas-interaction';
import { fullSpectrumModel } from '../tests/support/fullSpectrumModel.js';

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;
const crosses = (a: Point, b: Point, box: Rect) =>
  a.x === b.x
    ? a.x > box.x &&
      a.x < box.x + box.width &&
      Math.max(a.y, b.y) > box.y &&
      Math.min(a.y, b.y) < box.y + box.height
    : a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width;

describe('business journey geometric acceptance', () => {
  it.each(['standard', 'expanded'] as const)(
    'has zero AABB collisions, correct responsibility lanes and unobstructed routes (%s)',
    async (viewMode) => {
      const model = fullSpectrumModel();
      const before = JSON.stringify(model);
      const graph = createDomainGraph(model);
      const layout = await computeGraphLayout(graph, {
        viewMode,
        layoutMode: 'swimlane',
      });
      expect(layout.nodes.length).toBeGreaterThanOrEqual(30);
      expect(layout.nodes.length + layout.contextGroups.length).toBe(
        model.entities.length,
      );
      expect(layout.edges.length).toBe(model.relationships.length);
      const collisions: string[] = [];
      for (const [i, node] of layout.nodes.entries()) {
        for (const other of layout.nodes.slice(i + 1))
          if (overlap(node.worldBox, other.worldBox))
            collisions.push(`${node.nodeId}/${other.nodeId}`);
        expect(
          [
            node.worldBox.x,
            node.worldBox.y,
            node.worldBox.width,
            node.worldBox.height,
          ].every(Number.isFinite),
        ).toBe(true);
        expect(rectContainsRect(layout.bounds, node.worldBox)).toBe(true);
        const parent = node.contextId
          ? layout.contextGroupById.get(node.contextId)
          : undefined;
        if (parent) {
          expect(rectContainsRect(parent.worldBox, node.worldBox)).toBe(true);
          expect(node.box.x + parent.worldBox.x).toBe(node.worldBox.x);
          expect(node.box.y + parent.worldBox.y).toBe(node.worldBox.y);
        }
        const lane = layout.swimlaneRegions!.find(
          (r) =>
            r.kind === 'lane' &&
            r.contextId === node.contextId &&
            rectContainsRect(r.box, node.worldBox),
        );
        expect(lane, node.nodeId).toBeDefined();
        if (
          node.entity.category === 'evidence' &&
          node.entity.responsibleRoleRef
        )
          expect(lane?.roleId, node.nodeId).toBe(
            node.entity.responsibleRoleRef,
          );
        if (node.journey?.corridor === 'remedy_corridor') {
          const primaryLanes = layout.swimlaneRegions!.filter(
            (r) =>
              r.kind === 'lane' &&
              r.contextId === node.contextId &&
              r.corridorKind === 'primary_track',
          );
          expect(node.worldBox.y).toBeGreaterThanOrEqual(
            Math.max(0, ...primaryLanes.map((r) => r.box.y + r.box.height)),
          );
        }
      }
      expect(collisions).toEqual([]);
      for (const context of layout.contextGroups) {
        const owner = context.parentContextId
          ? layout.contextGroupById.get(context.parentContextId)!.worldBox
          : layout.bounds;
        expect(
          rectContainsRect(owner, context.worldBox),
          context.contextId,
        ).toBe(true);
      }
      const crossings: string[] = [];
      for (const edge of [...layout.edges, ...layout.fulfillmentPairs]) {
        const id = 'relationshipId' in edge ? edge.relationshipId : edge.id;
        expect(edge.points.length).toBeGreaterThanOrEqual(2);
        for (const [i, point] of edge.points.entries()) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(
            true,
          );
          expect(
            point.x >= 0 &&
              point.x <= layout.bounds.width &&
              point.y >= 0 &&
              point.y <= layout.bounds.height,
          ).toBe(true);
          if (!i) continue;
          const previous = edge.points[i - 1]!;
          expect(previous.x === point.x || previous.y === point.y, id).toBe(
            true,
          );
          for (const node of layout.nodes)
            if (crosses(previous, point, node.worldBox))
              crossings.push(`${id}/${node.nodeId}`);
        }
      }
      expect(crossings).toEqual([]);
      const corridor = layout.swimlaneRegions!.find((r) =>
        r.id.endsWith(':remedy-routing'),
      )!;
      const bottom = Math.max(
        ...layout.nodes.map((n) => n.worldBox.y + n.worldBox.height),
      );
      expect(corridor.box.y).toBeGreaterThan(bottom);
      for (const edge of layout.edges.filter(
        (e) => e.flowKind && e.flowKind !== 'primary',
      )) {
        const horizontalTrunks = edge.points
          .slice(1, -1)
          .filter(
            (p, i, points) =>
              i > 0 && p.y === points[i - 1]!.y && p.x !== points[i - 1]!.x,
          );
        // Same-column attachments can be entirely vertical; they must still
        // visit the lower band. Only endpoint connectors may leave that band.
        expect(
          edge.points.some((p) => p.y >= corridor.box.y),
          edge.relationshipId,
        ).toBe(true);
        expect(
          horizontalTrunks.every((p) => p.y >= corridor.box.y),
          edge.relationshipId,
        ).toBe(true);
      }
      expect(JSON.stringify(model)).toBe(before);
    },
  );

  it('still opens the same golden model in the ELK technical fallback', async () => {
    const model = fullSpectrumModel();
    const layout = await computeGraphLayout(createDomainGraph(model), {
      layoutMode: 'topology',
    });
    expect(layout.nodes.length + layout.contextGroups.length).toBe(
      model.entities.length,
    );
    expect(layout.edges.length).toBe(model.relationships.length);
    expect(layout.swimlaneRegions).toBeUndefined();
    expect(layout.bounds.width).toBeGreaterThan(0);
  });
});
