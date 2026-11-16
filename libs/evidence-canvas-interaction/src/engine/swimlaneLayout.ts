import type { ElkNode } from 'elkjs';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import {
  transformDomainGraphToElk,
  measureNodeSize,
} from '../adapter/domainToElk.js';
import { extractElkResultToLayout } from '../adapter/elkToLayout.js';
import type {
  CanvasViewMode,
  DomainGraphLayout,
  SwimlaneRegion,
} from '../layout/types.js';

const PHASES = [
  '索取方案 / RFP',
  '方案 / Proposal',
  '签约 / Contract',
  '履约与追责',
] as const;
const phaseOf = (entity: EntityAST): number =>
  entity.category !== 'evidence'
    ? 3
    : entity.kind === 'rfp'
      ? 0
      : entity.kind === 'proposal'
        ? 1
        : entity.kind === 'contract'
          ? 2
          : 3;

/** A presentation only layout. Every Context keeps its own roles and boundary. */
export const computeSwimlaneLayout = (
  graph: DomainGraph,
  viewMode: CanvasViewMode = 'standard',
): DomainGraphLayout => {
  // Reuse ownership/cycle/dangling-reference handling and the canonical adapter.
  const root = transformDomainGraphToElk(graph, viewMode);
  const size = measureNodeSize(viewMode);
  const pitch = size.width + 48;
  const rowHeight = size.height + 72;
  const regions: (SwimlaneRegion & { owner: string })[] = [];
  const laneOf = (entity: EntityAST): string =>
    entity.category === 'evidence' && entity.responsibleRoleRef !== undefined
      ? entity.responsibleRoleRef
      : entity.category === 'role' && entity.kind === 'party'
        ? entity.id
        : '__support__';
  // Shared stage widths keep corresponding phases aligned across Contexts.
  const counts = new Map<string, number>();
  const widths = [pitch, pitch, pitch, pitch];
  for (const entity of graph.entities()) {
    if (entity.category === 'context') continue;
    const phase = phaseOf(entity);
    const owner = 'contextRef' in entity ? entity.contextRef : '';
    const key = JSON.stringify([owner, laneOf(entity), phase]);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    widths[phase] = Math.max(widths[phase]!, count * pitch);
  }
  const phaseX = widths.map(
    (_, i) => 168 + widths.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const totalWidth = 192 + widths.reduce((a, b) => a + b, 0);
  const place = (container: ElkNode) => {
    const cards = (container.children ?? []).filter(
      (node) => graph.getEntity(node.id)?.category !== 'context',
    );
    const contexts = (container.children ?? []).filter(
      (node) => graph.getEntity(node.id)?.category === 'context',
    );
    const roles = new Set<string>();
    for (const card of cards) {
      const entity = graph.getEntity(card.id)!;
      if (entity.category === 'evidence' && entity.kind === 'contract')
        for (const ref of entity.roleRefs ?? []) roles.add(ref);
    }
    for (const card of cards) {
      const lane = laneOf(graph.getEntity(card.id)!);
      if (lane !== '__support__') roles.add(lane);
    }
    const lanes = [...roles].sort().concat('__support__');
    const slots = new Map<string, number>();
    for (const card of [...cards].sort((a, b) => a.id.localeCompare(b.id))) {
      const entity = graph.getEntity(card.id)!;
      const phase = phaseOf(entity);
      const lane = laneOf(entity);
      const key = JSON.stringify([phase, lane]);
      const slot = slots.get(key) ?? 0;
      slots.set(key, slot + 1);
      card.x = phaseX[phase]! + slot * pitch;
      card.y = 116 + lanes.indexOf(lane) * rowHeight;
    }
    if (cards.length > 0) {
      PHASES.forEach((label, i) =>
        regions.push({
          id: `${container.id}:phase:${i}`,
          owner: container.id,
          kind: 'phase',
          label,
          box: { x: phaseX[i]!, y: 52, width: widths[i]!, height: 36 },
        }),
      );
      lanes.forEach((role, i) =>
        regions.push({
          id: `${container.id}:lane:${role}`,
          owner: container.id,
          kind: 'lane',
          label:
            role === '__support__'
              ? '标的物与能力支撑'
              : (graph.getEntity(role)?.label ?? `待核对角色：${role}`),
          box: {
            x: 24,
            y: 100 + i * rowHeight,
            width: totalWidth - 48,
            height: rowHeight,
          },
        }),
      );
    }
    let y = cards.length > 0 ? 124 + lanes.length * rowHeight : 60;
    for (const child of contexts) {
      place(child);
      child.x = 24;
      child.y = y;
      y += (child.height ?? 84) + 32;
    }
    container.width = Math.max(
      totalWidth,
      ...contexts.map((c) => (c.width ?? 0) + 48),
    );
    container.height = y + 24;
  };
  place(root);
  if (!root.children?.length) {
    root.width = 0;
    root.height = 0;
  }
  const boxes = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  const walk = (node: ElkNode, x: number, y: number) => {
    const box = {
      x: x + (node.x ?? 0),
      y: y + (node.y ?? 0),
      width: node.width ?? 0,
      height: node.height ?? 0,
    };
    boxes.set(node.id, box);
    for (const child of node.children ?? []) walk(child, box.x, box.y);
  };
  walk(root, 0, 0);
  for (const edge of root.edges ?? []) {
    const from = boxes.get(edge.sources[0]!)!;
    const to = boxes.get(edge.targets[0]!)!;
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width, y: to.y + to.height / 2 };
    const corridor = Math.max(from.y + from.height, to.y + to.height) + 16;
    edge.sections = [
      {
        id: `${edge.id}:route`,
        startPoint: start,
        endPoint: end,
        bendPoints: [
          { x: start.x + 16, y: start.y },
          { x: start.x + 16, y: corridor },
          { x: end.x + 16, y: corridor },
          { x: end.x + 16, y: end.y },
        ],
      },
    ];
  }
  return {
    ...extractElkResultToLayout(root, graph),
    swimlaneRegions: regions.map(({ owner, ...region }) => {
      const origin = boxes.get(owner)!;
      return {
        ...region,
        box: {
          ...region.box,
          x: origin.x + region.box.x,
          y: origin.y + region.box.y,
        },
      };
    }),
  };
};
