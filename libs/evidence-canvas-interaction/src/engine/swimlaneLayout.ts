import type { ElkNode } from 'elkjs';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import {
  transformDomainGraphToElk,
  measureNodeSize,
  relationshipEdgeId,
} from '../adapter/domainToElk.js';
import { extractElkResultToLayout } from '../adapter/elkToLayout.js';
import type { Point, Rect } from '../geometry.js';
import type {
  CanvasViewMode,
  DomainGraphLayout,
  SwimlaneRegion,
} from '../layout/types.js';
import {
  inferJourneyPlacements,
  isCapability,
  JOURNEY_STAGES,
} from './journeyStages.js';

/** Causal order within a stage; cycles stay visible, with stable tie breaking. */
const causalRanks = (graph: DomainGraph): Map<string, number> => {
  const ids = graph
    .entities()
    .filter((e) => e.category !== 'context')
    .map((e) => e.id)
    .sort();
  const dependencies = new Map(ids.map((id) => [id, new Set<string>()]));
  for (const edge of graph.relationships())
    if (
      edge.kind === 'references' &&
      dependencies.has(edge.sourceRef) &&
      dependencies.has(edge.targetRef)
    )
      dependencies.get(edge.sourceRef)?.add(edge.targetRef);
  const ranks = new Map<string, number>();
  while (ranks.size < ids.length) {
    const ready = ids.filter(
      (id) =>
        !ranks.has(id) &&
        [...(dependencies.get(id) ?? [])].every((ref) => ranks.has(ref)),
    );
    if (!ready.length) break;
    for (const id of ready) ranks.set(id, ranks.size);
  }
  for (const id of ids) if (!ranks.has(id)) ranks.set(id, ranks.size);
  return ranks;
};

const crossesCard = (a: Point, b: Point, box: Rect) =>
  a.x === b.x
    ? a.x > box.x &&
      a.x < box.x + box.width &&
      Math.max(a.y, b.y) > box.y &&
      Math.min(a.y, b.y) < box.y + box.height
    : a.y > box.y &&
      a.y < box.y + box.height &&
      Math.max(a.x, b.x) > box.x &&
      Math.min(a.x, b.x) < box.x + box.width;

/** Seven aligned milestones, local responsibility lanes and a separate remedy
 * track. Context ownership is unchanged; even nested cards use world-aligned
 * columns, so the gutters are guaranteed to stay free at every nesting depth.
 */
export const computeSwimlaneLayout = (
  graph: DomainGraph,
  viewMode: CanvasViewMode = 'standard',
): DomainGraphLayout => {
  const root = transformDomainGraphToElk(graph, viewMode);
  const placements = inferJourneyPlacements(graph);
  const ranks = causalRanks(graph);
  const size = measureNodeSize(viewMode);
  const pitch = size.width + 64;
  const rowHeight = size.height + 96;
  const regions: SwimlaneRegion[] = [];
  const phaseOf = (entity: EntityAST) =>
    JOURNEY_STAGES.findIndex(
      ({ stage }) => stage === placements.get(entity.id)!.stage,
    );
  const laneOf = (entity: EntityAST): string =>
    entity.category === 'evidence' && entity.kind === 'contract'
      ? '__agreement__'
      : (placements.get(entity.id)?.roleId ?? '__support__');
  const trackOf = (entity: EntityAST) => placements.get(entity.id)!.corridor;
  const laneLabel = (lane: string) =>
    lane === '__agreement__'
      ? '共同约定'
      : lane === '__support__'
        ? '标的物与能力支撑'
        : (graph.getEntity(lane)?.label ?? `待核对角色：${lane}`);
  const counts = new Map<string, number>();
  const widths = JOURNEY_STAGES.map(() => pitch);
  for (const entity of graph.entities()) {
    if (entity.category === 'context') continue;
    const phase = phaseOf(entity);
    const owner = 'contextRef' in entity ? entity.contextRef : '';
    const key = JSON.stringify([owner, trackOf(entity), laneOf(entity), phase]);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    widths[phase] = Math.max(widths[phase]!, count * pitch);
  }
  const depthOf = (node: ElkNode): number =>
    1 +
    Math.max(
      0,
      ...(node.children ?? []).filter((n) => n.children).map(depthOf),
    );
  const leftInset = Math.max(192, depthOf(root) * 24 + 160);
  const phaseX = widths.map(
    (_, i) => leftInset + widths.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const totalWidth = leftInset + 64 + widths.reduce((a, b) => a + b, 0);
  const milestones = JOURNEY_STAGES.map(({ stage, label }, order) => ({
    id: `journey:${stage}`,
    stage,
    label,
    order,
    x: phaseX[order]!,
    width: widths[order]!,
  }));
  const place = (container: ElkNode, originX: number, originY: number) => {
    const cards = (container.children ?? []).filter(
      (n) => graph.getEntity(n.id)?.category !== 'context',
    );
    const contexts = (container.children ?? [])
      .filter((n) => graph.getEntity(n.id)?.category === 'context')
      .sort((a, b) => a.id.localeCompare(b.id));
    container.children = [
      ...cards.sort((a, b) => a.id.localeCompare(b.id)),
      ...contexts,
    ];
    const contextId = container.id === root.id ? null : container.id;
    const addRegion = (region: Omit<SwimlaneRegion, 'contextId'>) =>
      regions.push({ ...region, contextId });
    if (cards.length)
      for (const milestone of milestones)
        addRegion({
          id: `${container.id}:phase:${milestone.stage}`,
          kind: 'phase',
          label: milestone.label,
          stage: milestone.stage,
          box: {
            x: milestone.x,
            y: originY + 52,
            width: milestone.width,
            height: 36,
          },
        });
    let y = cards.length ? 104 : 60;
    const placeTrack = (track: 'primary_track' | 'remedy_corridor') => {
      const trackCards = cards.filter(
        (n) => trackOf(graph.getEntity(n.id)!) === track,
      );
      if (!trackCards.length) return;
      const top = y;
      const lanes = [
        ...new Set(trackCards.map((n) => laneOf(graph.getEntity(n.id)!))),
      ].sort();
      const slots = new Map<string, number>();
      // Capabilities occupy the rightmost auxiliary slots of their consumer's
      // stage, but keep their authored Context (no duplicate/reparented nodes).
      const ordered = [...trackCards].sort(
        (a, b) =>
          Number(isCapability(graph.getEntity(a.id)!)) -
            Number(isCapability(graph.getEntity(b.id)!)) ||
          (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0),
      );
      for (const card of ordered) {
        const entity = graph.getEntity(card.id)!;
        const phase = phaseOf(entity);
        const lane = laneOf(entity);
        const key = JSON.stringify([phase, lane]);
        let slot = slots.get(key) ?? 0;
        if (isCapability(entity)) {
          const remaining = ordered.filter(
            (n) =>
              isCapability(graph.getEntity(n.id)!) &&
              phaseOf(graph.getEntity(n.id)!) === phase &&
              laneOf(graph.getEntity(n.id)!) === lane &&
              !slots.has(`placed:${n.id}`),
          ).length;
          slot = Math.max(slot, widths[phase]! / pitch - remaining);
        }
        slots.set(key, slot + 1);
        slots.set(`placed:${card.id}`, 1);
        card.x = phaseX[phase]! - originX + slot * pitch;
        card.y = y + lanes.indexOf(lane) * rowHeight + 24;
      }
      for (const [i, lane] of lanes.entries())
        addRegion({
          id: `${container.id}:${track}:lane:${lane}`,
          kind: 'lane',
          label: laneLabel(lane),
          ...(lane.startsWith('__') ? {} : { roleId: lane }),
          corridorKind: track,
          box: {
            x: originX + 24,
            y: originY + y + i * rowHeight,
            width: totalWidth - originX - 72,
            height: rowHeight,
          },
        });
      y += lanes.length * rowHeight;
      addRegion({
        id: `${container.id}:${track}`,
        kind: 'corridor',
        label:
          track === 'primary_track' ? '主履约顺畅流' : '违约索赔与争议升级',
        corridorKind: track,
        box: {
          x: originX + 24,
          y: originY + top,
          width: totalWidth - originX - 72,
          height: y - top,
        },
      });
      y += 32;
    };
    placeTrack('primary_track');
    for (const child of contexts) {
      child.x = 24;
      child.y = y;
      place(child, originX + 24, originY + y);
      y += (child.height ?? 84) + 32;
    }
    placeTrack('remedy_corridor');
    container.width =
      totalWidth - originX - (container.id === root.id ? 0 : 24);
    container.height = y + 24;
  };
  place(root, 0, 0);
  if (!root.children?.length)
    return extractElkResultToLayout({ ...root, width: 0, height: 0 }, graph);

  const boxes = new Map<string, Rect>();
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
  const obstacles = [...boxes]
    .filter(
      ([id]) => graph.getEntity(id)?.category !== 'context' && id !== root.id,
    )
    .map(([, box]) => box);
  const flowByEdge = new Map(
    graph
      .relationships()
      .map((r) => [relationshipEdgeId(r.id), r.flowKind ?? 'primary']),
  );
  const routeTop = root.height! + 24;
  let remedyIndex = 0;
  for (const edge of [...(root.edges ?? [])].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const from = boxes.get(edge.sources[0]!)!;
    const to = boxes.get(edge.targets[0]!)!;
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width, y: to.y + to.height / 2 };
    const remedy =
      (flowByEdge.has(edge.id) && flowByEdge.get(edge.id) !== 'primary') ||
      (!flowByEdge.has(edge.id) &&
        placements.get(edge.sources[0]!)?.corridor === 'remedy_corridor');
    // Non-primary trunks run below *all* Contexts. The two boundary connectors
    // necessarily reach primary facts; they stay inside empty vertical gutters.
    const corridor = remedy
      ? routeTop + remedyIndex++ * 12
      : Math.max(from.y + from.height, to.y + to.height) + 24;
    const bends = [
      { x: start.x + 20, y: start.y },
      { x: start.x + 20, y: corridor },
      { x: end.x + 20, y: corridor },
      { x: end.x + 20, y: end.y },
    ];
    const points = [start, ...bends, end];
    if (
      points.some(
        (p, i) =>
          i > 0 && obstacles.some((box) => crossesCard(points[i - 1]!, p, box)),
      )
    )
      throw new Error(`Journey route crosses a card: ${edge.id}`);
    edge.sections = [
      {
        id: `${edge.id}:route`,
        startPoint: start,
        endPoint: end,
        bendPoints: bends,
      },
    ];
  }
  if (remedyIndex)
    regions.push({
      id: `${root.id}:remedy-routing`,
      kind: 'corridor',
      label: '违约救济与终极仲裁走廊',
      contextId: null,
      corridorKind: 'remedy_corridor',
      box: {
        x: 0,
        y: routeTop - 8,
        width: totalWidth,
        height: remedyIndex * 12 + 16,
      },
    });
  root.height = routeTop + remedyIndex * 12 + 32;
  const layout = extractElkResultToLayout(root, graph);
  const nodes = layout.nodes.map((node) => ({
    ...node,
    journey: placements.get(node.nodeId)!,
  }));
  return {
    ...layout,
    nodes,
    nodeById: new Map(nodes.map((n) => [n.nodeId, n])),
    journeyMilestones: milestones,
    swimlaneRegions: regions,
  };
};
