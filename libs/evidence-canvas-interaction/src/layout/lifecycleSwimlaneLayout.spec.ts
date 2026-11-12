import {
  LIFECYCLE_STAGES,
  type DomainModelDocument,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
import { createDomainGraph } from '@evidence-poc/evidence-model-core';

import {
  LANE_HEADER_HEIGHT,
  LANE_PADDING,
  MIN_LANE_WIDTH,
  createLifecycleSwimlaneLayout,
  rectContainsRect,
  rectsIntersect,
} from '../index.js';

const context = (
  id: string,
  kind: 'contract' | 'domain' | 'pre_contract',
  rootRefs: string[],
  parentContextRef?: string,
): EntityAST => ({
  type: 'entity',
  id,
  category: 'context',
  kind,
  label: id,
  rootRefs,
  ...(parentContextRef === undefined ? {} : { parentContextRef }),
});

const evidence = (
  id: string,
  kind: Extract<EntityAST, { category: 'evidence' }>['kind'],
  contextRef: string,
  attribute: string,
): EntityAST => ({
  type: 'entity',
  id,
  category: 'evidence',
  kind,
  label: id,
  contextRef,
  attributes: [
    {
      name: attribute,
      label: attribute,
      meaning: '示例时间',
      valueType: 'timestamp',
      required: true,
      keyData: true,
    },
  ],
});

const party = (id: string): EntityAST => ({
  type: 'entity',
  id,
  category: 'participant',
  kind: 'party',
  label: id,
});

const document = (entities: EntityAST[]): DomainModelDocument => ({
  manifest: {
    type: 'fm_model',
    schemaVersion: '5.0',
    id: 'lifecycle-board-fixture',
    name: '生命周期看板夹具',
    version: '1.0.0',
    ruleLanguage: 'CEL',
    entryContextRefs: entities
      .filter((entity) => entity.category === 'context')
      .slice(0, 1)
      .map(({ id }) => id),
  },
  entities,
  relationships: [],
  rules: [],
});

const layoutOf = (entities: EntityAST[]) =>
  createLifecycleSwimlaneLayout(createDomainGraph(document(entities)));

const laneOf = (
  layout: ReturnType<typeof layoutOf>,
  stage: (typeof LIFECYCLE_STAGES)[number],
) => layout.swimlanes.find((lane) => lane.stage === stage)!;

describe('createLifecycleSwimlaneLayout', () => {
  it('always draws the four stages in reading order', () => {
    const layout = layoutOf([
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
    ]);

    expect(layout.swimlanes.map((lane) => lane.stage)).toEqual([
      'rfp',
      'proposal',
      'contract',
      'fulfillment',
    ]);
    expect(layout.swimlanes.map((lane) => lane.label)).toEqual([
      '邀请投标',
      '投标',
      '合同签约',
      '履约履行',
    ]);
  });

  it('keeps empty stages as reserved columns so the board never reflows', () => {
    const layout = layoutOf([
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
    ]);

    for (const lane of layout.swimlanes) {
      expect(lane.box.width).toBeGreaterThanOrEqual(MIN_LANE_WIDTH);
      expect(lane.headerBox.height).toBe(LANE_HEADER_HEIGHT);
    }

    const [rfp, proposal] = layout.swimlanes;
    expect(rfp!.contextIds).toEqual([]);
    expect(proposal!.contextIds).toEqual([]);
  });

  it('places each stage left to right without overlap', () => {
    const layout = layoutOf([
      context('context.enquiry', 'pre_contract', ['evidence.rfp']),
      evidence('evidence.rfp', 'rfp', 'context.enquiry', 'started_at'),
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
      context('context.warehouse', 'domain', ['role.stock']),
      {
        type: 'entity',
        id: 'role.stock',
        category: 'role',
        kind: 'domain',
        label: '库存角色',
        contextRef: 'context.warehouse',
      },
    ]);

    const [rfp, , contract, fulfillment] = layout.swimlanes;

    expect(rfp!.contextIds).toEqual(['context.enquiry']);
    expect(contract!.contextIds).toEqual(['context.sale']);
    expect(fulfillment!.contextIds).toEqual(['context.warehouse']);

    const lanes = layout.swimlanes;
    for (let index = 1; index < lanes.length; index += 1) {
      const previous = lanes[index - 1]!.box;
      const current = lanes[index]!.box;

      expect(current.x).toBeGreaterThan(previous.x + previous.width);
    }
  });

  it('draws every Context under its lane header', () => {
    const layout = layoutOf([
      context('context.enquiry', 'pre_contract', ['evidence.proposal']),
      evidence(
        'evidence.proposal',
        'proposal',
        'context.enquiry',
        'started_at',
      ),
    ]);

    const proposal = laneOf(layout, 'proposal');
    const group = layout.contextGroupById.get('context.enquiry')!;

    expect(group.box.y).toBeGreaterThanOrEqual(
      proposal.headerBox.y + proposal.headerBox.height,
    );
    expect(rectContainsRect(proposal.box, group.box)).toBe(true);
  });

  it('stacks several Contexts of one stage without overlapping', () => {
    const layout = layoutOf([
      context('context.a', 'contract', ['evidence.contract-a']),
      evidence('evidence.contract-a', 'contract', 'context.a', 'signed_at'),
      context('context.b', 'contract', ['evidence.contract-b']),
      evidence('evidence.contract-b', 'contract', 'context.b', 'signed_at'),
    ]);

    const contract = laneOf(layout, 'contract');
    const first = layout.contextGroupById.get('context.a')!;
    const second = layout.contextGroupById.get('context.b')!;

    expect(contract.contextIds).toEqual(['context.a', 'context.b']);
    expect(rectsIntersect(first.box, second.box)).toBe(false);
    expect(second.box.y).toBeGreaterThanOrEqual(first.box.y + first.box.height);
    expect(rectContainsRect(contract.box, second.box)).toBe(true);
  });

  it('reports the furthest stage a pre-contract Context holds', () => {
    const layout = layoutOf([
      context('context.enquiry', 'pre_contract', ['evidence.rfp']),
      evidence('evidence.rfp', 'rfp', 'context.enquiry', 'started_at'),
      evidence('evidence.quote', 'proposal', 'context.enquiry', 'started_at'),
    ]);

    expect(laneOf(layout, 'proposal').contextIds).toEqual(['context.enquiry']);
    expect(laneOf(layout, 'rfp').contextIds).toEqual([]);
  });

  it('leaves a supporting document in its Context lane', () => {
    const layout = layoutOf([
      context('context.enquiry', 'pre_contract', ['evidence.rfp']),
      evidence('evidence.rfp', 'rfp', 'context.enquiry', 'started_at'),
      evidence(
        'evidence.note',
        'other_evidence',
        'context.enquiry',
        'created_at',
      ),
    ]);

    expect(laneOf(layout, 'rfp').contextIds).toEqual(['context.enquiry']);
    expect(laneOf(layout, 'fulfillment').contextIds).toEqual([]);
  });

  it('keeps a nested Context inside its root lane', () => {
    const layout = layoutOf([
      context('context.sourcing', 'pre_contract', ['evidence.rfp']),
      evidence('evidence.rfp', 'rfp', 'context.sourcing', 'started_at'),
      context(
        'context.procurement',
        'contract',
        ['evidence.contract'],
        'context.sourcing',
      ),
      evidence(
        'evidence.contract',
        'contract',
        'context.procurement',
        'signed_at',
      ),
    ]);

    expect(laneOf(layout, 'rfp').contextIds).toEqual(['context.sourcing']);
    expect(layout.contextGroupById.get('context.procurement')!.depth).toBe(1);
  });

  it('keeps a fulfillment request and its confirmation side by side', () => {
    const graph = createDomainGraph({
      ...document([
        context('context.sale', 'contract', ['evidence.request']),
        evidence(
          'evidence.request',
          'fulfillment_request',
          'context.sale',
          'started_at',
        ),
        evidence(
          'evidence.confirmation',
          'fulfillment_confirmation',
          'context.sale',
          'confirmed_at',
        ),
      ]),
      relationships: [
        {
          type: 'relationship',
          id: 'relation.confirmation-references-request',
          kind: 'references',
          sourceRef: 'evidence.confirmation',
          targetRef: 'evidence.request',
          label: '交付确认回应交付请求',
        },
      ],
    });
    const layout = createLifecycleSwimlaneLayout(graph);

    const request = layout.nodeById.get('evidence.request')!;
    const confirmation = layout.nodeById.get('evidence.confirmation')!;

    expect(confirmation.box.x).toBeGreaterThan(request.box.x);
    expect(layout.fulfillmentGroups).toHaveLength(1);
  });

  it('moves Context-less participants into a band under the lanes', () => {
    const layout = layoutOf([
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
      party('participant.buyer'),
      party('participant.seller'),
    ]);

    expect(layout.sharedBand).not.toBeNull();
    expect(layout.freeNodeIds).toEqual([
      'participant.buyer',
      'participant.seller',
    ]);

    const band = layout.sharedBand!;
    const tallestLane = layout.swimlanes.reduce(
      (bottom, lane) => Math.max(bottom, lane.box.y + lane.box.height),
      0,
    );

    expect(band.y).toBeGreaterThanOrEqual(tallestLane);
    for (const nodeId of layout.freeNodeIds) {
      const node = layout.nodeById.get(nodeId)!;

      expect(rectContainsRect(band, node.box)).toBe(true);
    }
  });

  it('has no shared band when every object belongs to a Context', () => {
    const layout = layoutOf([
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
    ]);

    expect(layout.sharedBand).toBeNull();
  });

  it('covers lanes and shared band in the reported bounds', () => {
    const layout = layoutOf([
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
      party('participant.buyer'),
    ]);

    for (const lane of layout.swimlanes) {
      expect(rectContainsRect(layout.bounds, lane.box)).toBe(true);
    }

    expect(rectContainsRect(layout.bounds, layout.sharedBand!)).toBe(true);
  });

  it('routes relationships after the lanes moved the boxes', () => {
    const entities: EntityAST[] = [
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
      party('participant.buyer'),
      {
        type: 'entity',
        id: 'role.buyer',
        category: 'role',
        kind: 'party',
        label: '买方角色',
        contextRef: 'context.sale',
      },
    ];
    const plain = createDomainGraph({
      ...document(entities),
      relationships: [
        {
          type: 'relationship',
          id: 'relation.buyer-plays-role',
          kind: 'plays_role',
          sourceRef: 'participant.buyer',
          targetRef: 'role.buyer',
          label: '买方企业扮演买方',
        },
      ],
    });

    const layout = createLifecycleSwimlaneLayout(plain);
    const edge = layout.edgeById.get('relation.buyer-plays-role')!;
    const source = layout.nodeById.get('participant.buyer')!;
    const target = layout.nodeById.get('role.buyer')!;

    expect(edge.dashed).toBe(true);
    expect(edge.arrow).toBe(true);
    // The band sits under the lanes, so the route climbs back up into the Context.
    expect(edge.points[0]!.y).toBeGreaterThanOrEqual(layout.sharedBand!.y);
    expect(edge.points.at(-1)!.y).toBeLessThanOrEqual(
      target.box.y + target.box.height,
    );
    expect(source.box.y).toBeGreaterThan(target.box.y);
  });

  it('is deterministic for the same document', () => {
    const entities: EntityAST[] = [
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
      party('participant.buyer'),
    ];

    expect(layoutOf(entities)).toEqual(layoutOf(entities));
  });

  it('keeps the lane padding between a Context and its lane edge', () => {
    const layout = layoutOf([
      context('context.sale', 'contract', ['evidence.contract']),
      evidence('evidence.contract', 'contract', 'context.sale', 'signed_at'),
    ]);

    const contract = laneOf(layout, 'contract');
    const group = layout.contextGroupById.get('context.sale')!;

    expect(group.box.x - contract.box.x).toBe(LANE_PADDING);
    expect(
      contract.box.y + contract.box.height - (group.box.y + group.box.height),
    ).toBe(LANE_PADDING);
  });
});
