import { readFileSync } from 'node:fs';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
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
  it.each(['simplified', 'standard', 'expanded'] as const)(
    'aligns all seven stages and isolates remedy trunks at %s density',
    async (viewMode) => {
      const model = JSON.parse(
        readFileSync(
          new URL(
            '../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ) as DomainModelDocument;
      const graph = createDomainGraph(model);
      const layout = await computeGraphLayout(graph, {
        layoutMode: 'swimlane',
        viewMode,
      });
      expect(layout.journeyMilestones?.map((m) => m.stage)).toEqual([
        'sourcing',
        'agreement',
        'advance',
        'dispatch',
        'inspection',
        'breach_remedy',
        'clearing',
      ]);
      for (const [id, stage] of Object.entries({
        'doc-sourcing-rfp': 'sourcing',
        'doc-supplier-proposal': 'sourcing',
        'doc-procurement-contract': 'agreement',
        'req-advance-payment': 'advance',
        'conf-advance-payment': 'advance',
        'req-equipment-delivery': 'dispatch',
        'conf-equipment-delivery': 'dispatch',
        'doc-sgs-inspection-cert': 'inspection',
        'req-breach-penalty': 'breach_remedy',
        'conf-breach-settlement': 'breach_remedy',
        'req-escrow-release': 'clearing',
        'conf-escrow-release': 'clearing',
        'thing-tariff-calculator': 'breach_remedy',
        'thing-compliance-checker': 'inspection',
      }))
        expect(layout.nodeById.get(id)?.journey?.stage, id).toBe(stage);
      expect(
        layout.nodeById.get('thing-tariff-calculator')?.journey?.auxiliaryFor,
      ).toBe('req-breach-penalty');
      const routeBand = layout.swimlaneRegions!.find((r) =>
        r.id.endsWith(':remedy-routing'),
      )!;
      const bottom = Math.max(
        ...layout.nodes.map((n) => n.worldBox.y + n.worldBox.height),
      );
      expect(routeBand.box.y).toBeGreaterThan(bottom);
      for (const edge of [...layout.edges, ...layout.fulfillmentPairs]) {
        for (let i = 1; i < edge.points.length; i++) {
          const a = edge.points[i - 1]!;
          const b = edge.points[i]!;
          expect(a.x === b.x || a.y === b.y).toBe(true);
          for (const node of layout.nodes)
            expect(
              crosses(a, b, node.worldBox),
              `${'relationshipId' in edge ? edge.relationshipId : edge.id} / ${node.nodeId}`,
            ).toBe(false);
        }
        if ('flowKind' in edge && edge.flowKind && edge.flowKind !== 'primary')
          expect(edge.points.some((p) => p.y >= routeBand.box.y)).toBe(true);
      }
      for (const node of layout.nodes) {
        const lane = layout.swimlaneRegions!.find(
          (r) =>
            r.kind === 'lane' &&
            r.contextId === node.contextId &&
            rectContainsRect(r.box, node.worldBox),
        );
        expect(lane).toBeDefined();
        if (node.journey?.roleId)
          expect(lane?.roleId).toBe(node.journey.roleId);
        const milestone = layout.journeyMilestones!.find(
          (m) => m.stage === node.journey?.stage,
        )!;
        expect(node.worldBox.x).toBeGreaterThanOrEqual(milestone.x);
        expect(node.worldBox.x + node.worldBox.width).toBeLessThanOrEqual(
          milestone.x + milestone.width,
        );
      }
      const reordered = structuredClone(model);
      reordered.entities.reverse();
      reordered.relationships.reverse();
      const other = await computeGraphLayout(createDomainGraph(reordered), {
        layoutMode: 'swimlane',
        viewMode,
      });
      for (const node of layout.nodes)
        expect(other.nodeById.get(node.nodeId)?.worldBox).toEqual(
          node.worldBox,
        );
      for (const edge of layout.edges)
        expect(other.edgeById.get(edge.relationshipId)?.points).toEqual(
          edge.points,
        );
    },
  );

  it('infers anonymous fulfillment stages from causal dependencies, not id conventions', async () => {
    const model = createFixtureDocument();
    const request = model.entities.find(
      (e) => e.id === 'evidence.delivery-request',
    )!;
    request.label = 'A';
    request.attributes = request.attributes?.filter(
      (a) => a.valueType === 'timestamp',
    );
    const confirmation = model.entities.find(
      (e) => e.id === 'evidence.delivery-confirmation',
    )!;
    const second = { ...request, id: 'anonymous', label: 'B' };
    model.entities.push(second);
    model.relationships.push({
      type: 'relationship',
      id: 'next',
      kind: 'references',
      sourceRef: second.id,
      targetRef: confirmation.id,
      label: '',
    });
    const layout = await computeGraphLayout(createDomainGraph(model), {
      layoutMode: 'swimlane',
    });
    expect(layout.nodeById.get(request.id)?.journey?.stage).toBe('advance');
    expect(layout.nodeById.get(second.id)?.journey?.stage).toBe('dispatch');
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
