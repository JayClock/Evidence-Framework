import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const sandbox = vm.createContext({});
vm.runInContext(
  readFileSync(
    new URL('../../assets/business-graph.js', import.meta.url),
    'utf8',
  ),
  sandbox,
);
const graphOf = (data) => sandbox.businessGraphOf(data);

const box = (x, y, width = 220, height = 64) => ({ x, y, width, height });

/**
 * A page as the generator writes it: objects in `nodes`, placement in `layout`.
 *
 * The geometry here is deliberately arbitrary — nothing in the page may derive
 * it — so a test that reads a coordinate is reading the placement, not a
 * second layout pass.
 */
const fixture = () => ({
  nodes: [
    { id: 'contract-a', group: 'context', kind: 'contract', label: '合同边界' },
    { id: 'delivery', group: 'context', kind: 'domain', label: '交付域' },
    {
      id: 'contract',
      group: 'evidence',
      kind: 'contract',
      parent: 'contract-a',
      label: '合同',
    },
    {
      id: 'party',
      group: 'role',
      kind: 'party',
      parent: 'contract-a',
      label: '责任方',
    },
    {
      id: 'request',
      group: 'evidence',
      kind: 'fulfillment_request',
      parent: 'contract-a',
      label: '履约请求',
    },
    {
      id: 'confirmation',
      group: 'evidence',
      kind: 'fulfillment_confirmation',
      parent: 'contract-a',
      label: '履约确认',
    },
    {
      id: 'proof',
      group: 'role',
      kind: 'evidence',
      parent: 'contract-a',
      label: '证明角色',
    },
    {
      id: 'thing',
      group: 'participant',
      kind: 'thing',
      parent: 'delivery',
      label: '独立标的',
    },
    {
      id: 'use',
      group: 'relationship',
      kind: 'references',
      sourceRef: 'request',
      targetRef: 'proof',
      label: '采信',
      sourceCardinality: { min: 1, max: 1 },
      targetCardinality: { min: 0, max: 'many' },
    },
    {
      id: 'play',
      group: 'relationship',
      kind: 'plays_role',
      sourceRef: 'confirmation',
      targetRef: 'proof',
      label: '扮演',
    },
    {
      id: 'basis',
      group: 'relationship',
      kind: 'references',
      sourceRef: 'request',
      targetRef: 'thing',
      label: '外部引用',
    },
    {
      id: 'orphan',
      group: 'relationship',
      kind: 'references',
      sourceRef: 'request',
      targetRef: 'absent',
      label: '缺失',
    },
    {
      id: 'request#started_at',
      group: 'attribute',
      parent: 'request',
      name: 'started_at',
      label: '开始',
    },
    ...['rule', 'instance', 'scenario', 'capability', 'service'].map(
      (group) => ({
        id: group,
        group,
        parent: 'contract-a',
      }),
    ),
  ],
  edges: [{ from: 'request', to: 'party', label: '凭证责任方' }],
  unresolved: ['orphan'],
  layout: {
    bounds: { x: 0, y: 0, width: 1420, height: 900 },
    nodes: [
      { nodeId: 'contract', box: box(60, 120), contextId: 'contract-a' },
      { nodeId: 'party', box: box(60, 210), contextId: 'contract-a' },
      {
        nodeId: 'request',
        box: box(340, 120, 220, 100),
        contextId: 'contract-a',
      },
      { nodeId: 'confirmation', box: box(620, 120), contextId: 'contract-a' },
      { nodeId: 'proof', box: box(900, 120), contextId: 'contract-a' },
      { nodeId: 'thing', box: box(60, 560), contextId: 'delivery' },
    ],
    edges: [
      {
        relationshipId: 'use',
        kind: 'references',
        sourceRef: 'request',
        targetRef: 'proof',
        points: [
          { x: 560, y: 170 },
          { x: 730, y: 170 },
          { x: 730, y: 152 },
          { x: 900, y: 152 },
        ],
        dashed: false,
        arrow: false,
        crossContext: false,
        label: '采信',
      },
      {
        relationshipId: 'play',
        kind: 'plays_role',
        sourceRef: 'confirmation',
        targetRef: 'proof',
        points: [
          { x: 840, y: 152 },
          { x: 900, y: 152 },
        ],
        dashed: true,
        arrow: true,
        crossContext: false,
        label: '扮演',
      },
      {
        relationshipId: 'basis',
        kind: 'references',
        sourceRef: 'request',
        targetRef: 'thing',
        points: [
          { x: 450, y: 220 },
          { x: 450, y: 560 },
          { x: 60, y: 560 },
          { x: 60, y: 592 },
        ],
        dashed: true,
        arrow: false,
        crossContext: true,
        label: '外部引用',
      },
    ],
    responsibilityLinks: [
      { sourceRef: 'request', roleId: 'party', kind: 'responsibility' },
      { sourceRef: 'contract', roleId: 'party', kind: 'contract_party' },
    ],
    contextGroups: [
      {
        contextId: 'contract-a',
        box: box(0, 60, 1180, 420),
        titleBox: box(0, 60, 1180, 36),
        depth: 0,
        parentContextId: null,
        childContextIds: ['delivery'],
        nodeIds: ['contract', 'party', 'request', 'confirmation', 'proof'],
        fulfillmentGroupIds: ['fulfillment:request'],
      },
      {
        contextId: 'delivery',
        box: box(0, 500, 340, 200),
        titleBox: box(0, 500, 340, 36),
        depth: 1,
        parentContextId: 'contract-a',
        childContextIds: [],
        nodeIds: ['thing'],
        fulfillmentGroupIds: [],
      },
    ],
    fulfillmentGroups: [
      {
        groupId: 'fulfillment:request',
        contractId: 'contract',
        requestId: 'request',
        confirmationIds: ['confirmation'],
        proofIds: ['proof'],
        box: box(326, 106, 808, 128),
      },
    ],
    freeNodeIds: [],
    omittedContextIds: [],
  },
});

test('the drawing reads the persisted placement instead of computing one', () => {
  const data = fixture(),
    before = JSON.stringify(data),
    graph = graphOf(data);
  assert.deepEqual(
    Array.from(graph.boxes, (entry) => [
      entry.id,
      entry.x,
      entry.y,
      entry.width,
      entry.height,
    ]),
    [
      ['contract', 60, 120, 220, 64],
      ['party', 60, 210, 220, 64],
      ['request', 340, 120, 220, 100],
      ['confirmation', 620, 120, 220, 64],
      ['proof', 900, 120, 220, 64],
      ['thing', 60, 560, 220, 64],
    ],
  );
  assert.equal(graph.width, 1420);
  assert.equal(graph.height, 900);
  assert.equal(graph.warnings.length, 0);
  assert.equal(JSON.stringify(data), before);
});
test('objects carry the content the page already holds, joined by id', () => {
  const data = fixture(),
    graph = graphOf(data);
  const request = graph.boxes.find((entry) => entry.id === 'request'),
    proof = graph.boxes.find((entry) => entry.id === 'proof');
  assert.equal(request.label, '履约请求');
  assert.equal(request.owner, 'contract-a');
  assert.equal(request.fulfillmentParent, 'fulfillment:request');
  assert.deepEqual(Array.from(request.timeFields), ['started_at']);
  // A responsibility badge is an explicit field, and a role never carries one.
  assert.equal(request.responsibleRef, 'party');
  assert.equal(proof.responsibleRef, undefined);
  assert.deepEqual(Array.from(proof.timeFields), []);
  assert.ok(!graph.boxes.some((entry) => entry.group === 'attribute'));
});
test('edges are the placement routes; style and cardinality are copied, never invented', () => {
  const graph = graphOf(fixture());
  assert.deepEqual(
    Array.from(graph.edges, (edge) => [
      edge.id,
      edge.from,
      edge.to,
      edge.dashed,
      edge.arrow,
    ]),
    [
      ['use', 'request', 'proof', false, false],
      ['play', 'confirmation', 'proof', true, true],
      ['basis', 'request', 'thing', true, false],
    ],
  );
  const use = graph.edges.find((edge) => edge.id === 'use'),
    play = graph.edges.find((edge) => edge.id === 'play');
  assert.equal(play.crossBoundary, false);
  assert.equal(use.points.length, 4);
  assert.equal(use.sourceCardinality.min, 1);
  assert.equal(use.targetCardinality.max, 'many');
  assert.equal(play.sourceCardinality, undefined);
  assert.equal(play.label, '扮演');
});
test('a relationship the placement could not route stays in the relation list only', () => {
  const graph = graphOf(fixture());
  assert.ok(!graph.edges.some((edge) => edge.id === 'orphan'));
  assert.deepEqual(
    Array.from(graph.relations, (node) => node.id),
    ['use', 'play', 'basis', 'orphan'],
  );
});
test('fulfillment bands name the Context that owns them and remember their members', () => {
  const graph = graphOf(fixture());
  assert.deepEqual(
    Array.from(graph.boundaries, (boundary) => [
      boundary.id,
      boundary.kind,
      boundary.parent,
    ]),
    [
      ['contract-a', 'contract', ''],
      ['delivery', 'domain', 'contract-a'],
      ['fulfillment:request', 'fulfillment', 'contract-a'],
    ],
  );
  const band = graph.boundaries.find(
    (boundary) => boundary.id === 'fulfillment:request',
  );
  assert.deepEqual(Array.from(band.members), [
    'request',
    'confirmation',
    'proof',
  ]);
  assert.equal(band.label, '履约请求');
  assert.deepEqual(
    [band.x, band.y, band.width, band.height],
    [326, 106, 808, 128],
  );
});
test('a placement that names an object the page does not carry is reported, not drawn blind', () => {
  const data = fixture();
  data.layout.nodes.push({
    nodeId: 'ghost',
    box: box(10, 10),
    contextId: 'contract-a',
  });
  const graph = graphOf(data);
  assert.equal(graph.boxes.filter((entry) => entry.id === 'ghost').length, 1);
  assert.ok(graph.warnings.some((warning) => warning.includes('ghost')));
});
test('a page with no placement shows no graph instead of a fabricated one', () => {
  const data = fixture();
  delete data.layout;
  const graph = graphOf(data);
  assert.equal(graph.boxes.length, 0);
  assert.equal(graph.boundaries.length, 0);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.width, 0);
  assert.ok(graph.warnings.length > 0);
});
test('object highlighting follows one drawn hop, not transitive dependencies', () => {
  const graph = graphOf(fixture()),
    before = JSON.stringify(graph);
  const state = sandbox.businessGraphHighlight(graph, {
    type: 'node',
    id: 'proof',
  });
  assert.deepEqual(Array.from(state.nodes).sort(), [
    'confirmation',
    'proof',
    'request',
  ]);
  assert.deepEqual(Array.from(state.edges).sort(), ['play', 'use']);
  assert.deepEqual(Array.from(state.boundaries).sort(), [
    'contract-a',
    'fulfillment:request',
  ]);
  assert.equal(state.primaryNode, 'proof');
  assert.equal(JSON.stringify(graph), before);
  const crossBoundary = sandbox.businessGraphHighlight(graph, {
    type: 'node',
    id: 'thing',
  });
  assert.deepEqual(Array.from(crossBoundary.nodes).sort(), [
    'request',
    'thing',
  ]);
  assert.deepEqual(Array.from(crossBoundary.edges), ['basis']);
  // A frame is highlighted through the Context chain the placement recorded;
  // the hop itself is drawn, but never carries the target's own frames over.
  assert.deepEqual(Array.from(crossBoundary.boundaries).sort(), [
    'contract-a',
    'delivery',
  ]);
});
test('a frame highlights exactly the objects drawn inside it', () => {
  const graph = graphOf(fixture());
  const band = sandbox.businessGraphHighlight(graph, {
    type: 'boundary',
    id: 'fulfillment:request',
  });
  assert.deepEqual(Array.from(band.nodes).sort(), [
    'confirmation',
    'proof',
    'request',
  ]);
  assert.deepEqual(Array.from(band.edges).sort(), ['play', 'use']);
  assert.deepEqual(Array.from(band.boundaries), ['fulfillment:request']);

  const context = sandbox.businessGraphHighlight(graph, {
    type: 'boundary',
    id: 'contract-a',
  });
  assert.deepEqual(Array.from(context.nodes).sort(), [
    'confirmation',
    'contract',
    'party',
    'proof',
    'request',
    'thing',
  ]);
  assert.deepEqual(Array.from(context.edges).sort(), ['basis', 'play', 'use']);
  assert.deepEqual(Array.from(context.boundaries).sort(), [
    'contract-a',
    'delivery',
    'fulfillment:request',
  ]);

  const child = sandbox.businessGraphHighlight(graph, {
    type: 'boundary',
    id: 'delivery',
  });
  assert.deepEqual(Array.from(child.nodes), ['thing']);
  assert.equal(child.edges.size, 0);
  assert.deepEqual(Array.from(child.boundaries), ['delivery']);
});
test('edge and badge highlighting stay on the drawn lines', () => {
  const graph = graphOf(fixture());
  const edge = sandbox.businessGraphHighlight(graph, {
    type: 'edge',
    id: 'basis',
  });
  assert.deepEqual(Array.from(edge.nodes).sort(), ['request', 'thing']);
  assert.deepEqual(Array.from(edge.edges), ['basis']);
  assert.deepEqual(Array.from(edge.boundaries).sort(), [
    'contract-a',
    'delivery',
    'fulfillment:request',
  ]);
  const badge = sandbox.businessGraphHighlight(graph, {
    type: 'node',
    id: 'party',
  });
  // A responsibility field is a badge, not a drawn line: only the role itself.
  assert.deepEqual(Array.from(badge.nodes), ['party']);
  assert.equal(badge.edges.size, 0);
  assert.deepEqual(Array.from(badge.boundaries), ['contract-a']);
  assert.equal(sandbox.businessGraphHighlight(graph, null).active, false);
  assert.equal(
    sandbox.businessGraphHighlight(graph, { type: 'node', id: 'absent' })
      .active,
    false,
  );
});
test('legend covers exactly the drawn types with real examples', () => {
  const data = fixture(),
    before = JSON.stringify(data);
  const graph = graphOf(data),
    legend = sandbox.buildBusinessLegend(graph);
  const keys = Array.from(legend, (item) => item.key).sort();
  const drawn = [
    ...new Set([
      ...graph.boxes.map((entry) => `${entry.group}.${entry.kind}`),
      ...graph.boundaries.map((entry) => `${entry.group}.${entry.kind}`),
    ]),
  ].sort();
  assert.deepEqual(
    keys.filter((key) => !key.startsWith('line.')),
    drawn,
  );
  const get = (key) => legend.find((item) => item.key === key);
  assert.equal(get('evidence.contract').example.id, 'contract');
  assert.equal(
    get('evidence.fulfillment_request').example.responsibleRef,
    'party',
  );
  assert.equal(get('role.evidence').example.id, 'proof');
  assert.equal(get('role.evidence').example.responsibleRef, undefined);
  assert.equal(get('fulfillment.fulfillment').example.parent, 'contract-a');
  assert.equal(get('line.plays_role').example.id, 'play');
  assert.equal(get('line.plays_role').example.arrow, true);
  assert.equal(get('line.cross').example.id, 'basis');
  assert.equal(get('line.cross').example.dashed, true);
  assert.equal(get('line.cross').example.arrow, false);
  assert.equal(get('line.local').example.id, 'use');
  for (const item of legend) {
    const example = item.example;
    const drawnSomewhere = item.key.startsWith('line.')
      ? graph.edges.some((edge) => edge.id === example.id)
      : graph.boxes.some((entry) => entry.id === example.id) ||
        graph.boundaries.some((entry) => entry.id === example.id);
    assert.ok(
      drawnSomewhere,
      `${item.key} must illustrate what the canvas draws`,
    );
  }
  assert.equal(JSON.stringify(data), before);
});
test('legend stays empty when nothing is drawn', () => {
  assert.equal(sandbox.buildBusinessLegend(graphOf({ nodes: [] })).length, 0);
  const data = fixture();
  delete data.layout;
  assert.equal(sandbox.buildBusinessLegend(graphOf(data)).length, 0);
});
test('cardinality formats actual min/max ranges without inventing requiredness', () => {
  assert.equal(sandbox.graphCardinality({ min: 1, max: 1 }), '1');
  assert.equal(sandbox.graphCardinality({ min: 0, max: 1 }), '0..1');
  assert.equal(sandbox.graphCardinality({ min: 0, max: 'many' }), '0..N');
  assert.equal(sandbox.graphCardinality(undefined), '');
  assert.equal(sandbox.graphCardinality(null), '');
});
