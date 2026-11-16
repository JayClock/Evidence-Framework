import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeGraphLayout,
  rectContainsRect,
  type Point,
  type Rect,
} from '../index.js';
import { createFixtureDocument } from '../../tests/support/fixtureModel.js';

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

describe('responsibility swimlanes', () => {
  it('keeps every entity and local/world ownership without modifying the model', async () => {
    const model = createFixtureDocument();
    const before = JSON.stringify(model);
    const graph = createDomainGraph(model);
    const a = await computeGraphLayout(graph, { layoutMode: 'swimlane' });
    const b = await computeGraphLayout(graph, { layoutMode: 'swimlane' });
    expect(a).toEqual(b);
    expect(JSON.stringify(model)).toBe(before);
    expect(a.nodes.length + a.contextGroups.length).toBe(model.entities.length);
    expect(
      a.swimlaneRegions?.filter((r) => r.kind === 'phase').length,
    ).toBeGreaterThanOrEqual(4);
    for (const node of a.nodes) {
      const parent = node.contextId
        ? a.contextGroupById.get(node.contextId)
        : undefined;
      expect(node.worldBox.x).toBe(node.box.x + (parent?.worldBox.x ?? 0));
      expect(
        rectContainsRect(parent?.worldBox ?? a.bounds, node.worldBox),
      ).toBe(true);
      const lane = a.swimlaneRegions?.find(
        (r) => r.kind === 'lane' && rectContainsRect(r.box, node.worldBox),
      );
      expect(lane).toBeDefined();
      if (node.entity.category === 'evidence' && node.entity.responsibleRoleRef)
        expect(lane?.label).toBe(
          graph.getEntity(node.entity.responsibleRoleRef)?.label,
        );
    }
    expect(a.edges.length).toBe(graph.relationships().length);
    for (const edge of [...a.edges, ...a.fulfillmentPairs]) {
      for (let i = 1; i < edge.points.length; i++) {
        expect(
          edge.points[i]!.x === edge.points[i - 1]!.x ||
            edge.points[i]!.y === edge.points[i - 1]!.y,
        ).toBe(true);
        for (const node of a.nodes)
          expect(
            crosses(edge.points[i - 1]!, edge.points[i]!, node.worldBox),
          ).toBe(false);
      }
    }
  });
  it('handles empty models and preserves cycle rejection', async () => {
    const model = createFixtureDocument();
    model.entities = [];
    model.relationships = [];
    expect(
      (
        await computeGraphLayout(createDomainGraph(model), {
          layoutMode: 'swimlane',
        })
      ).bounds.width,
    ).toBe(0);
    const cyclic = createFixtureDocument();
    const context = cyclic.entities.find((e) => e.category === 'context')!;
    if (context.category === 'context') context.parentContextRef = context.id;
    await expect(
      computeGraphLayout(createDomainGraph(cyclic), { layoutMode: 'swimlane' }),
    ).rejects.toThrow('Cyclic Context');
  });
});
