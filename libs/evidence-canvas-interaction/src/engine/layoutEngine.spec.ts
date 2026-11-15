import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import {
  computeGraphLayout,
  rectContainsRect,
  toSerializableLayout,
  type Rect,
  type Point,
} from '../index.js';
import { createFixtureDocument } from '../../tests/support/fixtureModel.js';

const graph = () => createDomainGraph(createFixtureDocument());
const layout = await computeGraphLayout(graph());
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
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

describe('computeGraphLayout (headless ELK)', () => {
  it('is deterministic and leaves source records untouched', async () => {
    const subject = graph();
    const before = JSON.stringify(subject.document);
    expect(toSerializableLayout(await computeGraphLayout(subject))).toEqual(
      toSerializableLayout(layout),
    );
    expect(JSON.stringify(subject.document)).toBe(before);
  });
  it('places every entity once, contains children and exposes correct local coordinates', () => {
    expect(
      new Set([
        ...layout.nodes.map((node) => node.nodeId),
        ...layout.contextGroups.map((group) => group.contextId),
      ]).size,
    ).toBe(graph().entities().length);
    for (const node of layout.nodes) {
      const parent =
        node.contextId === null
          ? undefined
          : layout.contextGroupById.get(node.contextId);
      expect(node.worldBox.x).toBe(node.box.x + (parent?.worldBox.x ?? 0));
      expect(node.worldBox.y).toBe(node.box.y + (parent?.worldBox.y ?? 0));
      expect(
        rectContainsRect(parent?.worldBox ?? layout.bounds, node.worldBox),
      ).toBe(true);
      for (const other of layout.nodes)
        if (other !== node)
          expect(overlaps(node.worldBox, other.worldBox)).toBe(false);
    }
    for (const group of layout.contextGroups) {
      const parent =
        group.parentContextId === null
          ? undefined
          : layout.contextGroupById.get(group.parentContextId);
      expect(group.worldBox.x).toBe(group.box.x + (parent?.worldBox.x ?? 0));
      expect(
        rectContainsRect(parent?.worldBox ?? layout.bounds, group.worldBox),
      ).toBe(true);
      expect(group.worldBox.height).toBeGreaterThan(group.titleBox.height);
    }
  });
  it('routes all relationships and fulfillment pairs orthogonally without crossing cards', () => {
    expect(layout.edges).toHaveLength(graph().relationships().length);
    expect(layout.fulfillmentPairs.length).toBeGreaterThan(0);
    expect(layout.edges.some((edge) => edge.route.bendPoints.length > 0)).toBe(
      true,
    );
    for (const route of [...layout.edges, ...layout.fulfillmentPairs]) {
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1]!;
        const b = route.points[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
        for (const node of layout.nodes)
          expect(crosses(a, b, node.worldBox)).toBe(false);
      }
    }
  });
  it('supports every density and concurrent layout requests', async () => {
    const results = await Promise.all(
      (['simplified', 'standard', 'expanded'] as const).map((viewMode) =>
        computeGraphLayout(graph(), { viewMode }),
      ),
    );
    expect(results.map((result) => result.nodes[0]!.box.height)).toEqual([
      82, 156, 200,
    ]);
  });
  it('handles empty drawings, empty Contexts, missing owners and dangling edges', async () => {
    const document = createFixtureDocument();
    document.entities = [];
    document.relationships = [];
    expect(
      (await computeGraphLayout(createDomainGraph(document))).bounds,
    ).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    document.entities.push({
      type: 'entity',
      category: 'context',
      id: 'empty',
      kind: 'domain',
      label: '空上下文',
    });
    expect(
      (await computeGraphLayout(createDomainGraph(document))).contextGroups.map(
        (group) => group.contextId,
      ),
    ).toEqual(['empty']);
    const original = createFixtureDocument();
    original.entities = original.entities.filter(
      (entity) => entity.category !== 'context',
    );
    original.relationships.push({
      type: 'relationship',
      id: 'dangling',
      kind: 'references',
      label: '',
      sourceRef: 'missing',
      targetRef: 'also-missing',
    });
    const result = await computeGraphLayout(createDomainGraph(original));
    expect(result.nodes.every((node) => node.contextId === null)).toBe(true);
    expect(result.edgeById.has('dangling')).toBe(false);
  });
  it('places shared results once while routing every fulfillment claim', async () => {
    const document = createFixtureDocument();
    const request = document.entities.find(
      (entity) => entity.id === 'evidence.delivery-request',
    );
    if (!request) throw new Error('fixture missing request');
    document.entities.push({ ...request, id: 'evidence.second-request' });
    document.relationships.push({
      type: 'relationship',
      id: 'relation.shared-result',
      kind: 'references',
      label: 'shared confirmation',
      sourceRef: 'evidence.delivery-confirmation',
      targetRef: 'evidence.second-request',
    });
    const result = await computeGraphLayout(createDomainGraph(document));
    expect(
      result.nodes.filter(
        (node) => node.nodeId === 'evidence.delivery-confirmation',
      ),
    ).toHaveLength(1);
    expect(
      result.fulfillmentPairs.filter(
        (pair) => pair.confirmationId === 'evidence.delivery-confirmation',
      ),
    ).toHaveLength(2);
  });

  it('rejects Context cycles with an actionable error', async () => {
    const document = createFixtureDocument();
    const context = document.entities.find(
      (entity) => entity.category === 'context',
    )!;
    if (context.category === 'context') context.parentContextRef = context.id;
    await expect(
      computeGraphLayout(createDomainGraph(document)),
    ).rejects.toThrow('Cyclic Context hierarchy');
  });
});
