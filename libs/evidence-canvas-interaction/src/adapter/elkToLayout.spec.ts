import type { ElkNode } from 'elkjs';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createFixtureDocument } from '../../tests/support/fixtureModel.js';
import { extractElkResultToLayout } from './elkToLayout.js';
import { relationshipEdgeId } from './domainToElk.js';

const relationshipId = 'relation.confirmation-references-request';
const graph = createDomainGraph(createFixtureDocument());
const rootOf = (): ElkNode => ({
  id: 'root',
  width: 800,
  height: 600,
  children: [
    {
      id: 'context.product-sourcing',
      x: 20,
      y: 30,
      width: 700,
      height: 500,
      children: [
        {
          id: 'context.product-procurement',
          x: 40,
          y: 60,
          width: 600,
          height: 400,
          children: [
            {
              id: 'evidence.delivery-request',
              x: 10,
              y: 20,
              width: 100,
              height: 60,
            },
            {
              id: 'evidence.delivery-confirmation',
              x: 200,
              y: 20,
              width: 100,
              height: 60,
            },
          ],
        },
      ],
    },
  ],
  edges: [
    {
      id: relationshipEdgeId(relationshipId),
      sources: ['evidence.delivery-confirmation'],
      targets: ['evidence.delivery-request'],
      container: 'context.product-procurement',
      // Sections may arrive out of order; links determine their traversal.
      sections: [
        {
          id: 'last',
          incomingSections: ['first'],
          startPoint: { x: 150, y: 50 },
          endPoint: { x: 110, y: 50 },
        },
        {
          id: 'first',
          outgoingSections: ['last'],
          startPoint: { x: 200, y: 50 },
          endPoint: { x: 150, y: 50 },
        },
      ],
    },
  ],
});

describe('ELK result extraction', () => {
  it('uses the edge container origin, orders all sections and removes duplicate joins', () => {
    const result = extractElkResultToLayout(rootOf(), graph);
    expect(result.nodeById.get('evidence.delivery-request')).toMatchObject({
      box: { x: 10, y: 20 },
      worldBox: { x: 70, y: 110 },
      contextId: 'context.product-procurement',
    });
    expect(
      result.contextGroupById.get('context.product-procurement'),
    ).toMatchObject({
      box: { x: 40, y: 60 },
      worldBox: { x: 60, y: 90 },
      depth: 1,
      parentContextId: 'context.product-sourcing',
    });
    expect(result.edgeById.get(relationshipId)?.points).toEqual([
      { x: 260, y: 140 },
      { x: 210, y: 140 },
      { x: 170, y: 140 },
    ]);
  });
  it('also extracts routes stored inside a nested node when no container is given', () => {
    const root = rootOf();
    const edge = root.edges?.[0];
    if (!edge) throw new Error('fixture missing edge');
    delete edge.container;
    const nested = root.children?.[0]?.children?.[0];
    if (!nested) throw new Error('fixture missing Context');
    nested.edges = [edge];
    root.edges = [];
    expect(extractElkResultToLayout(root, graph).edges[0]?.points[0]).toEqual({
      x: 260,
      y: 140,
    });
  });
  it('rejects incomplete routes rather than silently inventing geometry', () => {
    const root = rootOf();
    const edge = root.edges?.[0];
    if (!edge) throw new Error('fixture missing edge');
    edge.sections = [];
    expect(() => extractElkResultToLayout(root, graph)).toThrow(
      'ELK returned no route',
    );
  });
});
