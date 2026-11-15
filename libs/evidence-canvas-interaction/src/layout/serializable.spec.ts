import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createFixtureDocument } from '../../tests/support/fixtureModel.js';
import {
  EMPTY_GRAPH_LAYOUT,
  computeGraphLayout,
  toSerializableLayout,
} from '../index.js';

const computed = await computeGraphLayout(
  createDomainGraph(createFixtureDocument()),
);

describe('toSerializableLayout', () => {
  it('preserves local and absolute geometry without records or indexes', () => {
    const persisted = toSerializableLayout(computed);
    expect(persisted.nodes).toHaveLength(computed.nodes.length);
    const node = computed.nodes[0]!;
    expect(persisted.nodes[0]).toEqual({
      nodeId: node.nodeId,
      box: node.box,
      worldBox: node.worldBox,
      contextId: node.contextId,
    });
    expect(persisted.nodes[0]).not.toHaveProperty('entity');
    expect(persisted.contextGroups[0]).not.toHaveProperty('entity');
    expect(persisted).not.toHaveProperty('nodeById');
    expect(persisted).not.toHaveProperty('edgeById');
    expect(persisted).not.toHaveProperty('contextGroupById');
  });
  it('survives JSON and preserves every relationship and pair route', () => {
    const persisted = toSerializableLayout(computed);
    expect(JSON.parse(JSON.stringify(persisted))).toEqual(persisted);
    expect(persisted.edges).toEqual(computed.edges);
    expect(persisted.fulfillmentPairs).toEqual(computed.fulfillmentPairs);
  });
  it('has zero extent when empty', () => {
    expect(EMPTY_GRAPH_LAYOUT.nodes).toEqual([]);
    expect(EMPTY_GRAPH_LAYOUT.bounds).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});
