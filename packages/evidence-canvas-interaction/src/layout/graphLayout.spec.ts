import {
  CONTEXT_PADDING,
  NODE_WIDTH,
  createGraphLayout,
  measureNodeHeight,
  rectContainsRect,
  routeEdge,
} from '../index.js';
import {
  createFixtureDocument,
  createFixtureModel,
} from '../../tests/support/fixtureModel.js';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';

describe('createGraphLayout', () => {
  it('is deterministic for the same document', () => {
    const document = createFixtureDocument();

    expect(createGraphLayout(createDomainGraph(document))).toEqual(
      createGraphLayout(createDomainGraph(document)),
    );
  });

  it('measures node height from label lines and attribute rows', () => {
    expect(measureNodeHeight({ label: '短名称' })).toBe(64);
    expect(
      measureNodeHeight({
        label: '很长的业务对象名称需要折行显示',
        attributes: [
          {
            name: 'a',
            label: 'A',
            meaning: '第一条属性',
          },
          { name: 'b', label: 'B', meaning: '第二条属性' },
        ],
      }),
    ).toBe(64 + 18 + 32);
  });

  it('places every non-context entity exactly once', () => {
    const { document, layout } = createFixtureModel();
    const placed = new Set(layout.nodes.map(({ nodeId }) => nodeId));

    for (const entity of document.entities) {
      if (entity.category === 'context') {
        continue;
      }

      expect(placed.has(entity.id)).toBe(true);
    }

    expect(new Set(layout.nodes.map(({ nodeId }) => nodeId)).size).toBe(
      layout.nodes.length,
    );
  });

  it('keeps free participants outside every context card', () => {
    const { layout } = createFixtureModel();
    const free = layout.nodes.filter((node) => node.contextId === null);

    expect(free.map(({ nodeId }) => nodeId).sort()).toEqual([
      'participant.buyer',
      'participant.supplier',
    ]);
    expect(layout.freeNodeIds).toEqual([
      'participant.buyer',
      'participant.supplier',
    ]);
  });

  it('nests a child context inside its parent boundary', () => {
    const { layout } = createFixtureModel();
    const parent = layout.contextGroupById.get('context.product-sourcing')!;
    const child = layout.contextGroupById.get('context.product-procurement')!;

    expect(child.depth).toBe(1);
    expect(child.parentContextId).toBe('context.product-sourcing');
    expect(parent.childContextIds).toEqual(['context.product-procurement']);
    expect(rectContainsRect(parent.box, child.box)).toBe(true);
  });

  it('gives every owned object a context and keeps it inside the card', () => {
    const { layout } = createFixtureModel();

    for (const group of layout.contextGroups) {
      for (const nodeId of group.nodeIds) {
        const node = layout.nodeById.get(nodeId)!;

        expect(node.contextId).toBe(group.contextId);
        expect(rectContainsRect(group.box, node.box)).toBe(true);
        expect(node.box.width).toBe(NODE_WIDTH);
      }
    }
  });

  it('pairs the request, confirmation and proof in one fulfillment group', () => {
    const { layout } = createFixtureModel();
    const group = layout.fulfillmentGroupByRequest.get(
      'evidence.delivery-request',
    )!;

    expect(group.confirmationIds).toEqual(['evidence.delivery-confirmation']);
    expect(group.proofIds).toEqual(['evidence.delivery-note']);
    expect(group.contractId).toBe('evidence.procurement-contract');

    for (const id of [
      group.requestId,
      ...group.confirmationIds,
      ...group.proofIds,
    ]) {
      expect(rectContainsRect(group.box, layout.nodeById.get(id)!.box)).toBe(
        true,
      );
    }
  });

  it('routes edges and marks cross-context and plays_role lines', () => {
    const { layout } = createFixtureModel();
    const playsRole = layout.edgeById.get('relation.buyer-plays-role')!;
    const crossContext = layout.edgeById.get(
      'relation.request-references-product',
    )!;
    const inside = layout.edgeById.get(
      'relation.confirmation-references-request',
    )!;

    expect(playsRole.arrow).toBe(true);
    expect(playsRole.dashed).toBe(true);
    expect(crossContext.crossContext).toBe(true);
    expect(crossContext.dashed).toBe(true);
    expect(crossContext.arrow).toBe(false);
    expect(inside.crossContext).toBe(false);
    expect(inside.dashed).toBe(false);
    expect(inside.points.length).toBeGreaterThanOrEqual(2);
  });

  it('derives responsibility links from explicit fields only', () => {
    const { layout } = createFixtureModel();

    expect(layout.responsibilityLinks).toEqual(
      expect.arrayContaining([
        {
          sourceRef: 'evidence.procurement-contract',
          roleId: 'role.buyer',
          kind: 'contract_party',
        },
        {
          sourceRef: 'evidence.delivery-request',
          roleId: 'role.supplier',
          kind: 'responsibility',
        },
      ]),
    );
  });

  it('refuses to draw an empty context shell', () => {
    const document = createFixtureDocument();
    document.entities.push({
      type: 'entity',
      id: 'context.empty',
      category: 'context',
      kind: 'domain',
      label: '空壳上下文（Empty）',
      rootRefs: [],
    });
    const layout = createGraphLayout(createDomainGraph(document));

    expect(layout.omittedContextIds).toEqual(['context.empty']);
    expect(layout.contextGroupById.has('context.empty')).toBe(false);
  });

  it('bounds the layout around free nodes and context cards', () => {
    const { layout } = createFixtureModel();

    expect(layout.bounds.x).toBe(0);
    expect(layout.bounds.y).toBe(0);
    expect(layout.bounds.width).toBeGreaterThan(0);
    expect(layout.bounds.height).toBeGreaterThan(layout.bounds.width);
    expect(CONTEXT_PADDING).toBeGreaterThan(0);
  });
});

describe('routeEdge', () => {
  it('draws a straight line for horizontally aligned boxes', () => {
    expect(
      routeEdge(
        { x: 0, y: 0, width: 100, height: 50 },
        { x: 200, y: 0, width: 100, height: 50 },
      ),
    ).toEqual([
      { x: 100, y: 25 },
      { x: 200, y: 25 },
    ]);
  });

  it('draws three segments for offset boxes', () => {
    const points = routeEdge(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 300, y: 200, width: 100, height: 50 },
    );

    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 100, y: 25 });
    expect(points[3]).toEqual({ x: 300, y: 225 });
  });

  it('routes backwards to the left and vertically when stacked', () => {
    const backwards = routeEdge(
      { x: 300, y: 0, width: 100, height: 50 },
      { x: 0, y: 0, width: 100, height: 50 },
    );
    const stacked = routeEdge(
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 200, width: 100, height: 50 },
    );

    expect(backwards[0]).toEqual({ x: 300, y: 25 });
    expect(backwards.at(-1)).toEqual({ x: 100, y: 25 });
    expect(stacked[0]).toEqual({ x: 50, y: 50 });
    expect(stacked.at(-1)).toEqual({ x: 50, y: 200 });
  });
});
