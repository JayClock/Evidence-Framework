import {
  LIFECYCLE_STAGE_CAPTIONS,
  LIFECYCLE_STAGE_ENGLISH_LABELS,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGES,
  lifecycleStageOfContext,
  type LifecycleStage,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';

import { rectBottom, rectRight, unionRects, type Rect } from '../geometry.js';

import {
  CONTEXT_GAP,
  assembleGraphLayout,
  createGraphLayout,
  translateLayoutObjects,
} from './graphLayout.js';
import type { DomainGraphLayout, GraphLayoutOptions } from './types.js';

/** One lifecycle column of the workshop board. */
export interface Swimlane {
  stage: LifecycleStage;
  label: string;
  /** One line under the label describing what the stage holds. */
  caption: string;
  englishLabel: string;
  /** Whole lane, header included. */
  box: Rect;
  headerBox: Rect;
  /** Root Contexts drawn in this lane, top to bottom. */
  contextIds: readonly string[];
}

export interface LifecycleSwimlaneLayout extends DomainGraphLayout {
  swimlanes: readonly Swimlane[];
  /** Height of the stage banner every lane starts with. */
  headerHeight: number;
  /** Horizontal space between two lanes. */
  laneGap: number;
  /**
   * Participants and other cross-cutting objects that no Context owns.
   *
   * They are drawn under the lanes rather than inside one, because a party that
   * signs a contract and also pays an invoice cannot sit in a single stage.
   */
  sharedBand: Rect | null;
}

export interface LifecycleSwimlaneOptions extends GraphLayoutOptions {
  /** A stage with nothing in it still keeps a column this wide. */
  minLaneWidth?: number;
  laneGap?: number;
  headerHeight?: number;
  /** Inner margin between a lane's edges and the Context cards. */
  lanePadding?: number;
  /** Vertical space between the lanes and the shared band. */
  sharedBandGap?: number;
}

export const MIN_LANE_WIDTH = 320;
export const LANE_GAP = 56;
export const LANE_HEADER_HEIGHT = 64;
export const LANE_PADDING = 20;
export const SHARED_BAND_GAP = 56;

/**
 * Places every root Context subtree in the lifecycle lane it belongs to.
 *
 * The nested stacking from `createGraphLayout` answers "what is inside this
 * Context". This function answers the workshop's question — "when does this
 * happen" — by putting four columns on the board in reading order and then
 * re-using the nested result as the content of each column.
 *
 * A root Context is placed once, with its children, in the lane of the root
 * itself. A pre-contract Context that nests a contract Context therefore travels
 * to the parent's lane instead of splitting a single subtree across lanes; the
 * lanes read stages, they do not cut Contexts in half.
 */
export const createLifecycleSwimlaneLayout = (
  graph: DomainGraph,
  options: LifecycleSwimlaneOptions = {},
): LifecycleSwimlaneLayout => {
  const minLaneWidth = options.minLaneWidth ?? MIN_LANE_WIDTH;
  const laneGap = options.laneGap ?? LANE_GAP;
  const headerHeight = options.headerHeight ?? LANE_HEADER_HEIGHT;
  const lanePadding = options.lanePadding ?? LANE_PADDING;
  const sharedBandGap = options.sharedBandGap ?? SHARED_BAND_GAP;
  const nested = createGraphLayout(graph, options);

  /**
   * Topmost drawn Context of a subtree.
   *
   * A malformed model can carry a `parentContextRef` cycle; the visited set makes
   * the walk stop on the first repeat instead of hanging the canvas.
   */
  const rootOf = (contextId: string): string => {
    const visited = new Set<string>();
    let current = contextId;

    for (;;) {
      const parent = nested.contextGroupById.get(current)?.parentContextId;

      if (parent === undefined || parent === null || visited.has(parent)) {
        return current;
      }

      visited.add(current);
      current = parent;
    }
  };

  const rootIds: string[] = [];
  const descendantsOf = new Map<string, Set<string>>();

  for (const group of nested.contextGroups) {
    if (group.parentContextId !== null) {
      continue;
    }

    rootIds.push(group.contextId);
    descendantsOf.set(group.contextId, new Set([group.contextId]));
  }

  for (const group of nested.contextGroups) {
    if (group.parentContextId === null) {
      continue;
    }

    descendantsOf.get(rootOf(group.contextId))?.add(group.contextId);
  }

  const stageByRoot = new Map<string, LifecycleStage>();

  for (const rootId of rootIds) {
    const context = nested.contextGroupById.get(rootId)?.entity;
    // Only the root's own objects decide its stage: a nested contract Context
    // belongs to its own lane, which the root carries with it.
    const members = nested.nodes
      .filter((node) => node.contextId === rootId)
      .map((node) => node.entity);

    stageByRoot.set(
      rootId,
      context === undefined
        ? 'contract'
        : lifecycleStageOfContext(context, members),
    );
  }

  const rootsByStage = new Map<LifecycleStage, string[]>();

  for (const stage of LIFECYCLE_STAGES) {
    rootsByStage.set(stage, []);
  }

  for (const rootId of rootIds) {
    rootsByStage.get(stageByRoot.get(rootId) ?? 'contract')?.push(rootId);
  }

  const boxOfRoot = (rootId: string): Rect | undefined =>
    nested.contextGroupById.get(rootId)?.box;

  const laneWidths = new Map<LifecycleStage, number>();

  for (const stage of LIFECYCLE_STAGES) {
    const widest = (rootsByStage.get(stage) ?? []).reduce((width, rootId) => {
      const box = boxOfRoot(rootId);

      return box === undefined ? width : Math.max(width, box.width);
    }, 0);

    laneWidths.set(stage, Math.max(minLaneWidth, widest + lanePadding * 2));
  }

  /** Target position of each root, and of the shared band's content. */
  const targetXByRoot = new Map<string, number>();
  const swimlanes: Swimlane[] = [];
  let laneX = 0;
  let tallestLane = 0;

  for (const stage of LIFECYCLE_STAGES) {
    const width = laneWidths.get(stage) ?? minLaneWidth;
    const laneRoots = rootsByStage.get(stage) ?? [];
    let contentHeight = headerHeight + lanePadding;

    for (const rootId of laneRoots) {
      const box = boxOfRoot(rootId);

      if (box === undefined) {
        continue;
      }

      targetXByRoot.set(rootId, laneX + lanePadding);
      contentHeight += box.height + CONTEXT_GAP;
    }

    contentHeight =
      laneRoots.length > 0
        ? contentHeight - CONTEXT_GAP + lanePadding
        : contentHeight + lanePadding;

    swimlanes.push({
      stage,
      label: LIFECYCLE_STAGE_LABELS[stage],
      caption: LIFECYCLE_STAGE_CAPTIONS[stage],
      englishLabel: LIFECYCLE_STAGE_ENGLISH_LABELS[stage],
      box: { x: laneX, y: 0, width, height: contentHeight },
      headerBox: { x: laneX, y: 0, width, height: headerHeight },
      contextIds: laneRoots,
    });
    tallestLane = Math.max(tallestLane, contentHeight);
    laneX += width + laneGap;
  }

  // Align every root in a lane to that lane's own stacking order.
  for (const lane of swimlanes) {
    let cursorY = headerHeight + lanePadding;

    for (const rootId of lane.contextIds) {
      const box = nested.contextGroupById.get(rootId)?.box;

      if (box === undefined) {
        continue;
      }

      const targetX = targetXByRoot.get(rootId) ?? lane.box.x + lanePadding;
      const members = descendantsOf.get(rootId) ?? new Set([rootId]);

      translateLayoutObjects(
        {
          nodes: nested.nodes.filter(
            (node) => node.contextId !== null && members.has(node.contextId),
          ),
          contextGroups: nested.contextGroups.filter((group) =>
            members.has(group.contextId),
          ),
          fulfillmentGroups: nested.fulfillmentGroups.filter((group) => {
            const owner = nested.nodeById.get(group.requestId)?.contextId;

            return owner !== undefined && owner !== null && members.has(owner);
          }),
        },
        targetX - box.x,
        cursorY - box.y,
      );

      cursorY += box.height + CONTEXT_GAP;
    }
  }

  const sharedBand = placeSharedBand({
    nested,
    top: tallestLane + sharedBandGap,
    bandWidth: Math.max(0, laneX - laneGap),
    options,
  });

  const assembled = assembleGraphLayout({
    document: graph.document,
    nodes: [...nested.nodes],
    contextGroups: [...nested.contextGroups],
    fulfillmentGroups: [...nested.fulfillmentGroups],
    freeNodeIds: nested.freeNodeIds,
    omittedContextIds: nested.omittedContextIds,
  });

  const boardRects = [
    ...swimlanes.map((lane) => lane.box),
    ...(sharedBand === null ? [] : [sharedBand]),
  ];
  const bounds = boardRects.reduce(
    (accumulated, current) => unionRects(accumulated, current),
    assembled.bounds,
  );

  return {
    ...assembled,
    bounds,
    swimlanes,
    headerHeight,
    laneGap,
    sharedBand,
  };
};

/**
 * Lays the Context-less participants out under the lanes.
 *
 * `createGraphLayout` already placed them on a grid, so they only move by one
 * offset: the grid's own top-left goes to the band's top-left. Keeping the grid
 * intact means two parties that share a row still share a row.
 */
const placeSharedBand = ({
  nested,
  top,
  bandWidth,
  options,
}: {
  nested: DomainGraphLayout;
  top: number;
  bandWidth: number;
  options: LifecycleSwimlaneOptions;
}): Rect | null => {
  const rowGap = options.rowGap ?? 24;
  const columnGap = options.columnGap ?? 72;
  const nodeWidth = options.nodeWidth ?? 220;
  const freeNodes = nested.nodes.filter((node) => node.contextId === null);

  if (freeNodes.length === 0) {
    return null;
  }

  const originX = freeNodes.reduce(
    (accumulated, node) => Math.min(accumulated, node.box.x),
    freeNodes[0]!.box.x,
  );
  const originY = freeNodes.reduce(
    (accumulated, node) => Math.min(accumulated, node.box.y),
    freeNodes[0]!.box.y,
  );

  for (const node of freeNodes) {
    node.box = {
      ...node.box,
      x: node.box.x - originX,
      y: node.box.y - originY + top,
    };
  }

  const right = freeNodes.reduce(
    (accumulated, node) => Math.max(accumulated, rectRight(node.box)),
    nodeWidth,
  );
  const bottom = freeNodes.reduce(
    (accumulated, node) => Math.max(accumulated, rectBottom(node.box)),
    top,
  );

  return {
    x: 0,
    y: top,
    width: Math.max(bandWidth, right + columnGap),
    height: bottom - top + rowGap,
  };
};
