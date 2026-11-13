import { createDomainGraph } from '@evidence-poc/evidence-model-core';

import { createFixtureDocument } from '../../tests/support/fixtureModel.js';
import {
  EMPTY_GRAPH_LAYOUT,
  createGraphLayout,
  toSerializableLayout,
} from '../index.js';

const layout = () =>
  createGraphLayout(createDomainGraph(createFixtureDocument()));

describe('toSerializableLayout', () => {
  it('places the objects without carrying the records behind them', () => {
    const computed = layout();
    const persisted = toSerializableLayout(computed);

    expect(persisted.nodes).toHaveLength(computed.nodes.length);
    expect(persisted.nodes[0]).toEqual({
      nodeId: computed.nodes[0]?.nodeId,
      box: computed.nodes[0]?.box,
      contextId: computed.nodes[0]?.contextId,
    });
    expect(persisted.nodes[0]).not.toHaveProperty('entity');
    expect(persisted.contextGroups[0]).not.toHaveProperty('entity');
  });

  it('drops the id indexes the canvas looks up', () => {
    const persisted = toSerializableLayout(layout());

    expect(persisted).not.toHaveProperty('nodeById');
    expect(persisted).not.toHaveProperty('edgeById');
    expect(persisted).not.toHaveProperty('contextGroupById');
    expect(persisted).not.toHaveProperty('fulfillmentGroupByRequest');
  });

  it('survives a round trip through JSON', () => {
    const persisted = toSerializableLayout(layout());
    const restored = JSON.parse(JSON.stringify(persisted)) as typeof persisted;

    expect(restored).toEqual(persisted);
    expect(restored.nodes.length).toBeGreaterThan(0);
    expect(restored.edges.length).toBeGreaterThan(0);
    expect(restored.contextGroups.length).toBeGreaterThan(0);
  });

  it('keeps every routed edge and its polyline', () => {
    const computed = layout();

    expect(toSerializableLayout(computed).edges).toEqual(computed.edges);
  });

  it('describes a model with nothing to draw as an empty drawing', () => {
    expect(EMPTY_GRAPH_LAYOUT.nodes).toEqual([]);
    expect(EMPTY_GRAPH_LAYOUT.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
