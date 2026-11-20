import type { ElkNode } from 'elkjs';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';
import {
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_ORDER,
  lifecycleStageRank,
  type EntityAST,
} from '@evidence-poc/evidence-schema';
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
import { inferJourneyPlacements } from './journeyStages.js';
import {
  LIFECYCLE_FOOTER_HEIGHT,
  LIFECYCLE_HEADER_HEIGHT,
  LIFECYCLE_STAGE_GUTTER,
} from './stageLayout.js';

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

export const computeSwimlaneLayout = (
  graph: DomainGraph,
  viewMode: CanvasViewMode = 'standard',
): DomainGraphLayout => {
  const root = transformDomainGraphToElk(graph, viewMode);
  const placements = inferJourneyPlacements(graph);
  const ranks = causalRanks(graph);
  const size = measureNodeSize(viewMode);
  const pitch = size.width + LIFECYCLE_STAGE_GUTTER;
  const rowHeight = size.height + 96;
  const regions: SwimlaneRegion[] = [];
  const phaseOf = (entity: EntityAST) =>
    lifecycleStageRank(placements.get(entity.id)!.stage);
  const laneOf = (entity: EntityAST): string =>
    entity.category === 'evidence' && entity.kind === 'contract'
      ? '__agreement__'
      : (placements.get(entity.id)?.roleId ??
        (entity.category === 'evidence' ? '__evidence__' : '__support__'));
  const trackOf = (entity: EntityAST) => placements.get(entity.id)!.corridor;
  const laneLabel = (lane: string) =>
    lane === '__agreement__'
      ? '共同约定'
      : lane === '__support__'
        ? '参与方、标的物与领域能力'
        : lane === '__evidence__'
          ? '业务凭证'
          : (graph.getEntity(lane)?.label ?? `待核对角色：${lane}`);
  const nextSlot = new Map<string, number>();
  const slots = new Map<string, number>();
  const widths = LIFECYCLE_STAGE_ORDER.map(() => pitch);
  const requestsByConfirmation = new Map<string, string[]>();
  for (const { request, confirmations } of graph.fulfillmentPairs()) {
    for (const confirmation of confirmations) {
      const requests = requestsByConfirmation.get(confirmation.id) ?? [];
      requests.push(request.id);
      requestsByConfirmation.set(confirmation.id, requests);
    }
  }
  const groupKey = (entity: EntityAST) => [
    'contextRef' in entity ? (entity.contextRef ?? null) : null,
    trackOf(entity),
    phaseOf(entity),
  ];
  const cards = graph.entities().filter((e) => e.category !== 'context');
  cards.sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!);
  for (const entity of cards) {
    const group = groupKey(entity);
    const key = JSON.stringify([...group, laneOf(entity)]);
    let slot = nextSlot.get(key) ?? 0;
    for (const requestId of requestsByConfirmation.get(entity.id) ?? []) {
      const requestSlot = slots.get(requestId);
      const request = graph.getEntity(requestId);
      if (
        requestSlot !== undefined &&
        request !== undefined &&
        groupKey(request).every((part, i) => group[i] === part)
      )
        slot = Math.max(slot, requestSlot + 1);
    }
    slots.set(entity.id, slot);
    nextSlot.set(key, slot + 1);
    const phase = phaseOf(entity);
    widths[phase] = Math.max(widths[phase]!, (slot + 1) * pitch);
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
  const milestones = LIFECYCLE_STAGE_ORDER.map((stage, order) => ({
    id: `journey:${stage}`,
    stage,
    label: LIFECYCLE_STAGE_LABELS[stage],
    order,
    x: phaseX[order]!,
    width: widths[order]!,
  }));
  const stageSpanByContext = new Map<string, { first: number; last: number }>();
  const stageSpan = (node: ElkNode) => {
    const entity = graph.getEntity(node.id)!;
    let first = phaseOf(entity);
    let last = first;
    if (entity.category === 'context') {
      if (entity.kind === 'pre_contract') {
        first = lifecycleStageRank('rfp');
        last = lifecycleStageRank('proposal');
      } else if (entity.kind === 'contract') {
        last = lifecycleStageRank('fulfillment');
      }
      for (const child of node.children ?? []) {
        const span = stageSpan(child);
        first = Math.min(first, span.first);
        last = Math.max(last, span.last);
      }
      stageSpanByContext.set(node.id, { first, last });
    }
    return { first, last };
  };
  for (const child of root.children ?? []) stageSpan(child);

  const place = (container: ElkNode, originX: number, originY: number) => {
    const span = stageSpanByContext.get(container.id);
    const right = span
      ? phaseX[span.last]! + widths[span.last]! - 32
      : totalWidth;
    const laneWidth = right - originX - 48;
    const cards = (container.children ?? []).filter(
      (n) => graph.getEntity(n.id)?.category !== 'context',
    );
    const contexts = (container.children ?? [])
      .filter((n) => graph.getEntity(n.id)?.category === 'context')
      .sort((a, b) => {
        const rank = (id: string) => {
          const context = graph.getEntity(id);
          return context?.kind === 'pre_contract'
            ? 0
            : context?.kind === 'domain'
              ? 2
              : 1;
        };
        return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
      });
    container.children = [
      ...cards.sort((a, b) => a.id.localeCompare(b.id)),
      ...contexts,
    ];
    const contextId = container.id === root.id ? null : container.id;
    const addRegion = (region: Omit<SwimlaneRegion, 'contextId'>) =>
      regions.push({ ...region, contextId });
    let y = contextId === null ? LIFECYCLE_HEADER_HEIGHT + 16 : 60;
    const placeTrack = (track: 'primary_track' | 'remedy_corridor') => {
      const trackCards = cards.filter(
        (n) => trackOf(graph.getEntity(n.id)!) === track,
      );
      if (!trackCards.length) return;
      const top = y;
      const lanes = [
        ...new Set(trackCards.map((n) => laneOf(graph.getEntity(n.id)!))),
      ].sort(
        (a, b) =>
          Number(a === '__support__') - Number(b === '__support__') ||
          a.localeCompare(b),
      );
      for (const card of trackCards) {
        const entity = graph.getEntity(card.id)!;
        const phase = phaseOf(entity);
        const lane = laneOf(entity);
        card.x = phaseX[phase]! - originX + slots.get(entity.id)! * pitch;
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
            width: laneWidth,
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
          width: laneWidth,
          height: y - top,
        },
      });
      y += 32;
    };
    placeTrack('primary_track');
    placeTrack('remedy_corridor');
    for (const child of contexts) {
      const first = stageSpanByContext.get(child.id)!.first;
      const left = Math.max(originX + 24, phaseX[first]! - 164);
      child.x = left - originX;
      child.y = y;
      place(child, left, originY + y);
      y += (child.height ?? 84) + 32;
    }
    container.width = right - originX;
    container.height = y + 24;
  };
  place(root, 0, 0);
  if (!root.children?.length) root.height = 240;

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
  root.height = routeTop + remedyIndex * 12 + 32 + LIFECYCLE_FOOTER_HEIGHT;
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
