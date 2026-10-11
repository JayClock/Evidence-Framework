import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const sandbox = vm.createContext({});
vm.runInContext(
  readFileSync(new URL('../assets/business-graph.js', import.meta.url), 'utf8'),
  sandbox,
);
const build = (data, options = {}) => sandbox.buildBusinessGraph(data, options);
const fixture = () => ({
  nodes: [
    { id: 'a', group: 'context', kind: 'contract', label: '合同边界' },
    {
      id: 'contract',
      group: 'evidence',
      kind: 'contract',
      parent: 'a',
      label: '合同',
    },
    { id: 'party', group: 'role', kind: 'party', parent: 'a', label: '责任方' },
    {
      id: 'f',
      group: 'fulfillment',
      kind: 'fulfillment',
      parent: 'a',
      label: '付款',
      requests: ['request'],
      confirmations: [],
      proofRoles: ['proof'],
    },
    {
      id: 'request',
      group: 'evidence',
      kind: 'fulfillment_request',
      parent: 'f',
      label: '请求',
    },
    {
      id: 'proof',
      group: 'role',
      kind: 'evidence',
      parent: 'f',
      label: '证明角色',
    },
    { id: 'b', group: 'context', kind: 'contract', label: '外部合同' },
    {
      id: 'player',
      group: 'evidence',
      kind: 'fulfillment_confirmation',
      parent: 'b',
      label: '具体凭证',
    },
    { id: 'thing', group: 'participant', kind: 'thing', label: '独立标的' },
    {
      id: 'use',
      group: 'relationship',
      kind: 'references',
      sourceRef: 'request',
      targetRef: 'proof',
      label: '采信',
      sourceCardinality: '1',
      targetCardinality: 'N',
    },
    {
      id: 'play',
      group: 'relationship',
      kind: 'plays_role',
      sourceRef: 'player',
      targetRef: 'proof',
      label: '扮演',
    },
    {
      id: 'basis',
      group: 'relationship',
      kind: 'references',
      sourceRef: 'request',
      targetRef: 'contract',
      label: '合同依据',
    },
    {
      id: 'request#started_at',
      group: 'attribute',
      parent: 'request',
      name: 'started_at',
      label: '开始',
    },
    ...['rule', 'instance', 'scenario', 'capability'].map((group) => ({
      id: group,
      group,
      parent: 'a',
    })),
  ],
  edges: [
    { from: 'request', to: 'party', label: '凭证责任方' },
    { from: 'contract', to: 'party', label: '合同责任角色' },
  ],
});

test('legend uses only present object kinds, real examples and explicit responsibility', () => {
  const data = fixture(),
    before = JSON.stringify(data);
  const legend = sandbox.buildBusinessLegend(build(data));
  const get = (key) => legend.find((n) => n.key === key);
  assert.equal(get('evidence.contract').example.id, 'contract');
  assert.equal(
    get('evidence.fulfillment_request').example.responsibleRef,
    'party',
  );
  assert.equal(get('role.evidence').example.id, 'proof');
  assert.equal(get('role.evidence').example.responsibleRef, undefined);
  assert.equal(get('fulfillment.fulfillment').example.parent, 'a');
  assert.equal(get('line.plays_role').example.from, 'player');
  assert.equal(get('line.plays_role').example.to, 'proof');
  assert.equal(get('line.plays_role').example.arrow, true);
  assert.equal(get('participant.party'), undefined);
  assert.equal(JSON.stringify(data), before);
});
test('legend distinguishes cross-boundary lines from role arrows and handles empty models', () => {
  assert.equal(
    sandbox.buildBusinessLegend(build({ nodes: [], edges: [] })).length,
    0,
  );
  const data = fixture();
  data.nodes.push({
    id: 'external',
    group: 'relationship',
    kind: 'references',
    sourceRef: 'request',
    targetRef: 'thing',
    label: '外部引用',
  });
  const legend = sandbox.buildBusinessLegend(build(data));
  const cross = legend.find((n) => n.key === 'line.cross');
  assert.equal(cross.example.id, 'external');
  assert.equal(cross.example.arrow, false);
  assert.equal(cross.example.dashed, true);
  assert.ok(legend.find((n) => n.key === 'line.local').example.arrow === false);
});

test('one global canvas contains every concrete object and actual relationship endpoint', () => {
  const data = fixture(),
    graph = build(data);
  assert.deepEqual(
    Array.from(graph.boxes, (b) => b.id).sort(),
    data.nodes
      .filter((n) => ['evidence', 'role', 'participant'].includes(n.group))
      .map((n) => n.id)
      .sort(),
  );
  assert.equal(graph.edges.length, 3);
  assert.ok(
    graph.edges.every((e) => e.from === e.sourceRef && e.to === e.targetRef),
  );
  assert.equal(new Set(graph.boxes.map((b) => b.id)).size, graph.boxes.length);
});
test('contract spine aligns requests and proofs without fabricating confirmations', () => {
  const graph = build(fixture());
  const box = (id) => graph.boxes.find((b) => b.id === id);
  assert.ok(box('contract').x < box('request').x);
  assert.ok(box('request').x < box('proof').x);
  assert.equal(box('request').y, box('proof').y);
  assert.equal(box('request').responsibleRef, 'party');
  assert.equal(box('proof').responsibleRef, undefined);
  assert.ok(box('player'));
  assert.ok(
    graph.roleLinks.some((e) => e.from === 'contract' && e.to === 'party'),
  );
  assert.deepEqual(Array.from(box('request').timeFields), ['started_at']);
  assert.ok(!graph.boxes.some((b) => b.group === 'attribute'));
});
test('external players retain original ownership and point to evidence role', () => {
  const graph = build(fixture());
  const player = graph.boxes.find((b) => b.id === 'player');
  assert.equal(player.parent, 'b');
  assert.equal(player.owner, 'b');
  const edge = graph.edges.find((e) => e.id === 'play');
  assert.equal(edge.crossBoundary, true);
  assert.equal(edge.arrow, true);
  assert.equal(edge.dashed, true);
  const use = graph.edges.find((e) => e.id === 'use');
  assert.equal(use.crossBoundary, false);
  assert.equal(use.arrow, false);
  assert.equal(use.dashed, false);
  assert.equal(graph.edges.find((e) => e.id === 'basis').arrow, false);
});
test('shared confirmation is one node, not copied for each request', () => {
  const data = fixture();
  data.nodes.push({
    id: 'confirmation',
    group: 'evidence',
    kind: 'fulfillment_confirmation',
    parent: 'f',
    label: '共享确认',
  });
  data.nodes.find((n) => n.id === 'f').confirmations = ['confirmation'];
  data.nodes.push({
    id: 'f2',
    group: 'fulfillment',
    kind: 'fulfillment',
    parent: 'a',
    label: '另一履约',
    requests: ['r2'],
    confirmations: ['confirmation'],
  });
  data.nodes.push({
    id: 'r2',
    group: 'evidence',
    kind: 'fulfillment_request',
    parent: 'f2',
    label: '另一请求',
  });
  const graph = build(data, { scope: 'a' });
  assert.equal(graph.boxes.filter((b) => b.id === 'confirmation').length, 1);
  assert.ok(graph.boxes.some((b) => b.id === 'proof'));
});
test('cross-boundary line style is independent of relation kind; missing cardinalities stay absent', () => {
  const data = fixture();
  data.nodes.push({
    id: 'ref',
    group: 'relationship',
    kind: 'references',
    sourceRef: 'request',
    targetRef: 'thing',
    label: '引用',
  });
  const graph = build(data, { scope: 'a' });
  const edge = graph.edges.find((e) => e.id === 'ref');
  assert.equal(edge.dashed, true);
  assert.equal(edge.arrow, false);
  assert.equal(edge.sourceCardinality, undefined);
  assert.equal(graph.edges.find((e) => e.id === 'use').targetCardinality, 'N');
});
test('parallel relations, self references, unknown kinds and missing targets remain reviewable', () => {
  const data = fixture();
  data.nodes.push({
    id: 'self',
    group: 'relationship',
    kind: 'custom',
    sourceRef: 'request',
    targetRef: 'request',
    label: '自身',
  });
  data.nodes.push({
    id: 'parallel',
    group: 'relationship',
    kind: 'custom',
    sourceRef: 'request',
    targetRef: 'proof',
    label: '另一关联',
  });
  data.nodes.push({
    id: 'missing',
    group: 'relationship',
    kind: 'references',
    sourceRef: 'request',
    targetRef: 'absent',
    label: '缺失',
  });
  const graph = build(data, { scope: 'a' });
  assert.ok(graph.edges.some((e) => e.id === 'self'));
  assert.ok(graph.edges.some((e) => e.id === 'parallel' && e.arrow === false));
  assert.equal(graph.unresolved.length, 1);
  assert.ok(graph.relations.some((e) => e.id === 'missing'));
});
test('empty, domain-only and cyclic models terminate; layout does not mutate input', () => {
  assert.equal(build({ nodes: [], edges: [] }).boxes.length, 0);
  const data = fixture();
  const before = JSON.stringify(data);
  assert.equal(
    JSON.stringify(build(data, { scope: 'a' })),
    JSON.stringify(build(data, { scope: 'a' })),
  );
  assert.equal(JSON.stringify(data), before);
  data.nodes.find((n) => n.id === 'a').parent = 'f';
  assert.ok(build(data).warnings.length > 0);
  const domain = {
    nodes: [
      { id: 'd', group: 'context', kind: 'domain', label: '领域' },
      {
        id: 't',
        group: 'participant',
        kind: 'thing',
        parent: 'd',
        label: '标的',
      },
    ],
    edges: [],
  };
  assert.equal(build(domain, { scope: 'd' }).boxes[0].id, 't');
});
const contains = (outer, inner) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;

test('context boundaries enclose actual owners and nest fulfillment within contract', () => {
  const data = fixture();
  data.nodes.push(
    { id: 'd', group: 'context', kind: 'domain', label: '领域' },
    {
      id: 't',
      group: 'participant',
      kind: 'thing',
      parent: 'd',
      label: '标的',
    },
  );
  for (const mode of ['simple', 'standard']) {
    const graph = build(data, { mode });
    assert.deepEqual(Array.from(graph.boundaries || [], (b) => b.id).sort(), [
      'a',
      'b',
      'd',
      'f',
    ]);
    const boundary = (id) => graph.boundaries.find((b) => b.id === id);
    const box = (id) => graph.boxes.find((b) => b.id === id);
    assert.ok(contains(boundary('a'), boundary('f')));
    assert.equal(boundary('f').parent, 'a');
    for (const [context, id] of [
      ['a', 'contract'],
      ['a', 'party'],
      ['f', 'request'],
      ['f', 'proof'],
      ['b', 'player'],
      ['d', 't'],
    ])
      assert.ok(contains(boundary(context), box(id)), `${context} owns ${id}`);
    assert.ok(!contains(boundary('a'), box('player')));
    assert.ok(!graph.boundaries.some((b) => contains(b, box('thing'))));
    for (const b of graph.boundaries)
      assert.ok(
        contains({ x: 0, y: 0, width: graph.width, height: graph.height }, b),
      );
  }
});

test('empty contexts stay visible and shared confirmation stays inside its declared owner', () => {
  const data = fixture();
  data.nodes.push({
    id: 'empty',
    group: 'context',
    kind: 'domain',
    label: '空领域',
  });
  data.nodes.find((n) => n.id === 'f').confirmations = ['player'];
  const graph = build(data);
  assert.ok(
    graph.boundaries?.some(
      (b) => b.id === 'empty' && b.width > 0 && b.height > 0,
    ),
  );
  const player = graph.boxes.find((b) => b.id === 'player');
  assert.equal(graph.boxes.filter((b) => b.id === 'player').length, 1);
  assert.ok(
    contains(
      graph.boundaries.find((b) => b.id === 'b'),
      player,
    ),
  );
  assert.ok(
    !contains(
      graph.boundaries.find((b) => b.id === 'f'),
      player,
    ),
  );
  // A reference to a sibling's confirmation must not determine its placement.
  data.nodes.push({
    id: 'peer',
    group: 'fulfillment',
    kind: 'fulfillment',
    parent: 'a',
    label: '另一履约',
  });
  data.nodes.find((n) => n.id === 'player').parent = 'peer';
  const shared = build(data);
  const sharedPlayer = shared.boxes.find((b) => b.id === 'player');
  assert.ok(
    contains(
      shared.boundaries.find((b) => b.id === 'peer'),
      sharedPlayer,
    ),
  );
  assert.ok(
    !contains(
      shared.boundaries.find((b) => b.id === 'f'),
      sharedPlayer,
    ),
  );
});

test('object highlighting follows one visible hop, not transitive dependencies', () => {
  const graph = build(fixture()),
    before = JSON.stringify(graph);
  const h = sandbox.businessGraphHighlight(graph, {
    type: 'node',
    id: 'proof',
  });
  assert.deepEqual(Array.from(h.nodes).sort(), ['player', 'proof', 'request']);
  assert.deepEqual(Array.from(h.edges).sort(), ['play', 'use']);
  assert.deepEqual(Array.from(h.boundaries).sort(), ['a', 'f']);
  assert.equal(h.primaryNode, 'proof');
  assert.equal(JSON.stringify(graph), before);
  const isolated = sandbox.businessGraphHighlight(graph, {
    type: 'node',
    id: 'thing',
  });
  assert.deepEqual(Array.from(isolated.nodes), ['thing']);
  assert.equal(isolated.edges.size, 0);
});
test('context highlighting stays inside the exact context and includes descendants', () => {
  const graph = build(fixture());
  const h = sandbox.businessGraphHighlight(graph, {
    type: 'boundary',
    id: 'f',
  });
  assert.deepEqual(Array.from(h.nodes).sort(), ['proof', 'request']);
  assert.deepEqual(Array.from(h.edges), ['use']);
  assert.deepEqual(Array.from(h.boundaries), ['f']);
  const root = sandbox.businessGraphHighlight(graph, {
    type: 'boundary',
    id: 'a',
  });
  assert.deepEqual(Array.from(root.nodes).sort(), [
    'contract',
    'party',
    'proof',
    'request',
  ]);
  assert.ok(!root.edges.has('play'));
  assert.equal(root.edges.size, 3); // includes the explicit contract responsibility line
});
test('role badges use the role neighborhood; edges, empty contexts and missing targets are bounded', () => {
  const data = fixture();
  data.nodes.push({
    id: 'empty',
    group: 'context',
    kind: 'domain',
    label: '空上下文',
  });
  const graph = build(data);
  const role = sandbox.businessGraphHighlight(graph, {
    type: 'node',
    id: 'party',
  });
  assert.deepEqual(Array.from(role.nodes).sort(), ['contract', 'party']);
  assert.equal(role.edges.size, 1);
  const edge = sandbox.businessGraphHighlight(graph, {
    type: 'edge',
    id: 'play',
  });
  assert.deepEqual(Array.from(edge.nodes).sort(), ['player', 'proof']);
  assert.deepEqual(Array.from(edge.edges), ['play']);
  const empty = sandbox.businessGraphHighlight(graph, {
    type: 'boundary',
    id: 'empty',
  });
  assert.equal(empty.nodes.size, 0);
  assert.deepEqual(Array.from(empty.boundaries), ['empty']);
  assert.equal(sandbox.businessGraphHighlight(graph, null).active, false);
  assert.equal(
    sandbox.businessGraphHighlight(graph, { type: 'node', id: 'missing' })
      .active,
    false,
  );
  graph.boundaries.find((b) => b.id === 'a').parent = 'f';
  assert.ok(
    sandbox.businessGraphHighlight(graph, { type: 'node', id: 'proof' }).active,
  );
});

test('cardinality formats actual min/max ranges without inventing requiredness', () => {
  assert.equal(sandbox.graphCardinality({ min: 1, max: 1 }), '1');
  assert.equal(sandbox.graphCardinality({ min: 0, max: 1 }), '0..1');
  assert.equal(sandbox.graphCardinality({ min: 0, max: 'many' }), '0..N');
  assert.equal(sandbox.graphCardinality(undefined), '');
  assert.equal(sandbox.graphCardinality(null), '');
});

test('all boxes stay inside canvas and do not overlap; standard view retains room for fields', () => {
  const graph = build(fixture(), {
    scope: 'a',
    players: true,
    mode: 'standard',
  });
  for (const a of graph.boxes) {
    assert.ok(
      a.x >= 0 &&
        a.y >= 0 &&
        a.x + a.width <= graph.width &&
        a.y + a.height <= graph.height,
    );
    for (const b of graph.boxes)
      if (a !== b)
        assert.ok(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        );
  }
});
