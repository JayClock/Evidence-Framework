import {
  type ContextEntityAST,
  type DomainModelDocument,
  type EntityAST,
  isContextEntity,
} from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';

import {
  rectBottom,
  rectCenter,
  rectRight,
  unionRects,
  type Point,
  type Rect,
} from '../geometry.js';

import type {
  ContextLayoutGroup,
  DomainGraphLayout,
  FulfillmentLayoutGroup,
  GraphLayoutOptions,
  LayoutEdge,
  LayoutNode,
  ResponsibilityLink,
} from './types.js';

export const NODE_WIDTH = 220;
export const NODE_BASE_HEIGHT = 64;
export const NODE_LABEL_LINE_HEIGHT = 18;
export const NODE_ATTRIBUTE_ROW_HEIGHT = 16;
export const MAX_MEASURED_ATTRIBUTE_ROWS = 3;
export const LABEL_CHARS_PER_LINE = 14;

export const COLUMN_GAP = 72;
export const ROW_GAP = 24;
export const STACK_GAP = 16;
export const CONTEXT_PADDING = 24;
export const CONTEXT_TITLE_HEIGHT = 36;
export const CONTEXT_GAP = 48;
export const FULFILLMENT_PADDING = 14;
export const MIN_CONTEXT_WIDTH = 260;
export const FREE_BAND_COLUMNS = 3;

/** Deterministic node height: label lines plus capped attribute rows. */
export const measureNodeHeight = (
  entity: Pick<EntityAST, 'label' | 'attributes'>,
): number => {
  const labelLines = Math.min(
    2,
    Math.max(1, Math.ceil(entity.label.length / LABEL_CHARS_PER_LINE)),
  );
  const attributeRows = Math.min(
    MAX_MEASURED_ATTRIBUTE_ROWS,
    entity.attributes?.length ?? 0,
  );

  return (
    NODE_BASE_HEIGHT +
    (labelLines - 1) * NODE_LABEL_LINE_HEIGHT +
    attributeRows * NODE_ATTRIBUTE_ROW_HEIGHT
  );
};

interface PlacedSubtree {
  contextId: string;
  entity: ContextEntityAST;
  box: Rect;
  titleBox: Rect;
  depth: number;
  parentContextId: string | null;
  childContextIds: string[];
  nodeIds: string[];
  fulfillmentGroupIds: string[];
  nodes: LayoutNode[];
  groups: FulfillmentLayoutGroup[];
  contextGroups: ContextLayoutGroup[];
}

interface StackItem {
  entity: EntityAST;
  height: number;
}

const ownerContextId = (entity: EntityAST): string | undefined =>
  'contextRef' in entity ? entity.contextRef : undefined;

export const createGraphLayout = (
  graph: DomainGraph,
  options: GraphLayoutOptions = {},
): DomainGraphLayout => {
  const nodeWidth = options.nodeWidth ?? NODE_WIDTH;
  const columnGap = options.columnGap ?? COLUMN_GAP;
  const rowGap = options.rowGap ?? ROW_GAP;
  const document: DomainModelDocument = graph.document;
  const columnX = [0, nodeWidth + columnGap, 2 * (nodeWidth + columnGap)];

  const contextById = new Map<string, ContextEntityAST>();
  for (const entity of document.entities) {
    if (isContextEntity(entity)) {
      contextById.set(entity.id, entity);
    }
  }

  const entitiesByContext = new Map<string, EntityAST[]>();
  const freeEntities: EntityAST[] = [];

  for (const entity of document.entities) {
    if (isContextEntity(entity)) {
      continue;
    }

    const owner = ownerContextId(entity);
    const context = owner === undefined ? undefined : contextById.get(owner);

    if (context === undefined) {
      freeEntities.push(entity);
      continue;
    }

    const bucket = entitiesByContext.get(context.id);

    if (bucket === undefined) {
      entitiesByContext.set(context.id, [entity]);
    } else {
      bucket.push(entity);
    }
  }

  const childrenByContext = new Map<string, ContextEntityAST[]>();
  const rootContexts: ContextEntityAST[] = [];

  for (const context of contextById.values()) {
    const parent =
      context.parentContextRef === undefined
        ? undefined
        : contextById.get(context.parentContextRef);

    if (parent === undefined) {
      rootContexts.push(context);
      continue;
    }

    const bucket = childrenByContext.get(parent.id);

    if (bucket === undefined) {
      childrenByContext.set(parent.id, [context]);
    } else {
      bucket.push(context);
    }
  }

  const omittedContextIds: string[] = [];

  /** Lays out one Context subtree with coordinates relative to its own box. */
  const layoutSubtree = (
    context: ContextEntityAST,
    depth: number,
  ): PlacedSubtree | null => {
    const entities = entitiesByContext.get(context.id) ?? [];
    const requestIds = entities.filter(
      (entity) =>
        entity.category === 'evidence' && entity.kind === 'fulfillment_request',
    );
    const consumed = new Set<string>();
    const nodes: LayoutNode[] = [];
    const groups: FulfillmentLayoutGroup[] = [];
    const childContextGroups: ContextLayoutGroup[] = [];
    const nodeIds: string[] = [];
    const groupIds: string[] = [];
    const contentOriginX = CONTEXT_PADDING;
    const contentOriginY = CONTEXT_PADDING + CONTEXT_TITLE_HEIGHT;

    const place = (entity: EntityAST, x: number, y: number): Rect => {
      const box: Rect = {
        x: contentOriginX + x,
        y: contentOriginY + y,
        width: nodeWidth,
        height: measureNodeHeight(entity),
      };

      nodes.push({ nodeId: entity.id, entity, box, contextId: context.id });
      nodeIds.push(entity.id);
      consumed.add(entity.id);

      return box;
    };

    let cursorY = 0;
    let contentWidth = 0;

    for (const request of requestIds) {
      const pair = graph.fulfillmentPair(request.id);
      const confirmations =
        pair?.confirmations.filter(
          (entity) => ownerContextId(entity) === context.id,
        ) ?? [];
      const proofs =
        pair?.proofs.filter(
          (entity) => ownerContextId(entity) === context.id,
        ) ?? [];
      const requestBox = place(request, columnX[0]!, cursorY);
      const confirmationBoxes: Rect[] = [];
      const proofBoxes: Rect[] = [];
      let columnY = cursorY;

      for (const confirmation of confirmations) {
        const box = place(confirmation, columnX[1]!, columnY);
        confirmationBoxes.push(box);
        columnY = rectBottom(box) - contentOriginY + STACK_GAP;
      }

      columnY = cursorY;
      for (const proof of proofs) {
        const box = place(proof, columnX[2]!, columnY);
        proofBoxes.push(box);
        columnY = rectBottom(box) - contentOriginY + STACK_GAP;
      }

      const rowBottom = Math.max(
        rectBottom(requestBox),
        ...confirmationBoxes.map(rectBottom),
        ...proofBoxes.map(rectBottom),
      );
      const lastColumn = proofBoxes.length
        ? columnX[2]!
        : confirmationBoxes.length
          ? columnX[1]!
          : columnX[0]!;
      const groupBox: Rect = {
        x: contentOriginX + columnX[0]! - FULFILLMENT_PADDING,
        y: contentOriginY + cursorY - FULFILLMENT_PADDING,
        width: lastColumn + nodeWidth - columnX[0]! + FULFILLMENT_PADDING * 2,
        height:
          rowBottom - (contentOriginY + cursorY) + FULFILLMENT_PADDING * 2,
      };
      const groupId = `fulfillment:${request.id}`;

      groups.push({
        groupId,
        contractId: pair?.contract?.id ?? null,
        requestId: request.id,
        confirmationIds: confirmations.map(({ id }) => id),
        proofIds: proofs.map(({ id }) => id),
        box: groupBox,
      });
      groupIds.push(groupId);
      contentWidth = Math.max(
        contentWidth,
        rectRight(groupBox) - contentOriginX,
      );
      cursorY = rowBottom - contentOriginY + rowGap * 2;
    }

    const others: StackItem[] = entities
      .filter((entity) => !consumed.has(entity.id))
      .map((entity) => ({ entity, height: measureNodeHeight(entity) }));

    for (let index = 0; index < others.length; ) {
      const row = others.slice(index, index + FREE_BAND_COLUMNS);
      const rowHeight = Math.max(...row.map((item) => item.height));

      row.forEach((item, column) => {
        const box = place(item.entity, columnX[column]!, cursorY);
        contentWidth = Math.max(contentWidth, rectRight(box) - contentOriginX);
      });

      cursorY += rowHeight + rowGap;
      index += FREE_BAND_COLUMNS;
    }

    let childrenBottom = contentOriginY + cursorY;
    const childContextIds: string[] = [];

    for (const child of childrenByContext.get(context.id) ?? []) {
      const subtree = layoutSubtree(child, depth + 1);

      if (subtree === null) {
        continue;
      }

      shiftSubtree(subtree, contentOriginX, childrenBottom);
      nodes.push(...subtree.nodes);
      groups.push(...subtree.groups);
      childContextGroups.push(...subtree.contextGroups);
      childContextIds.push(child.id);
      contentWidth = Math.max(
        contentWidth,
        rectRight(subtree.box) - contentOriginX,
      );
      childrenBottom = rectBottom(subtree.box) + CONTEXT_GAP;
    }

    const isEmpty =
      entities.length === 0 &&
      childContextIds.length === 0 &&
      nodes.length === 0;

    if (isEmpty) {
      omittedContextIds.push(context.id);
      return null;
    }

    const box: Rect = {
      x: 0,
      y: 0,
      width: Math.max(MIN_CONTEXT_WIDTH, contentWidth + CONTEXT_PADDING * 2),
      height: Math.max(
        contentOriginY + cursorY + CONTEXT_PADDING,
        childrenBottom - CONTEXT_GAP + CONTEXT_PADDING,
      ),
    };

    const group: ContextLayoutGroup = {
      contextId: context.id,
      entity: context,
      box,
      titleBox: {
        x: 0,
        y: 0,
        width: box.width,
        height: CONTEXT_TITLE_HEIGHT,
      },
      depth,
      parentContextId:
        context.parentContextRef !== undefined &&
        contextById.has(context.parentContextRef)
          ? context.parentContextRef
          : null,
      childContextIds,
      nodeIds,
      fulfillmentGroupIds: groupIds,
    };

    return {
      contextId: context.id,
      entity: context,
      box,
      titleBox: group.titleBox,
      depth,
      parentContextId: group.parentContextId,
      childContextIds,
      nodeIds,
      fulfillmentGroupIds: groupIds,
      nodes,
      groups,
      contextGroups: [group, ...childContextGroups],
    };
  };

  const shiftSubtree = (
    subtree: PlacedSubtree,
    dx: number,
    dy: number,
  ): void => {
    subtree.box = {
      ...subtree.box,
      x: subtree.box.x + dx,
      y: subtree.box.y + dy,
    };
    subtree.titleBox = {
      ...subtree.titleBox,
      x: subtree.titleBox.x + dx,
      y: subtree.titleBox.y + dy,
    };

    for (const node of subtree.nodes) {
      node.box = { ...node.box, x: node.box.x + dx, y: node.box.y + dy };
    }

    for (const group of subtree.groups) {
      group.box = { ...group.box, x: group.box.x + dx, y: group.box.y + dy };
    }

    for (const group of subtree.contextGroups) {
      group.box = { ...group.box, x: group.box.x + dx, y: group.box.y + dy };
      group.titleBox = {
        ...group.titleBox,
        x: group.titleBox.x + dx,
        y: group.titleBox.y + dy,
      };
    }
  };

  const allNodes: LayoutNode[] = [];
  const allGroups: FulfillmentLayoutGroup[] = [];
  const allContextGroups: ContextLayoutGroup[] = [];
  let cursorY = 0;

  if (freeEntities.length > 0) {
    let freeY = 0;

    for (
      let index = 0;
      index < freeEntities.length;
      index += FREE_BAND_COLUMNS
    ) {
      const row = freeEntities.slice(index, index + FREE_BAND_COLUMNS);
      const rowHeight = Math.max(...row.map(measureNodeHeight));

      row.forEach((entity, column) => {
        const box: Rect = {
          x: columnX[column]!,
          y: freeY,
          width: nodeWidth,
          height: measureNodeHeight(entity),
        };

        allNodes.push({ nodeId: entity.id, entity, box, contextId: null });
      });

      freeY += rowHeight + rowGap;
    }

    cursorY = freeY - rowGap + CONTEXT_GAP;
  }

  for (const context of rootContexts) {
    const subtree = layoutSubtree(context, 0);

    if (subtree === null) {
      continue;
    }

    shiftSubtree(subtree, -subtree.box.x, cursorY);
    allNodes.push(...subtree.nodes);
    allGroups.push(...subtree.groups);
    allContextGroups.push(...subtree.contextGroups);
    cursorY = rectBottom(subtree.box) + CONTEXT_GAP;
  }

  const nodeById = new Map(
    allNodes.map((node) => [node.nodeId, node] as const),
  );
  const contextGroupById = new Map(
    allContextGroups.map((group) => [group.contextId, group] as const),
  );
  const boxOf = (objectId: string): Rect | undefined =>
    nodeById.get(objectId)?.box ?? contextGroupById.get(objectId)?.box;

  const edges: LayoutEdge[] = [];

  for (const relationship of document.relationships) {
    const sourceBox = boxOf(relationship.sourceRef);
    const targetBox = boxOf(relationship.targetRef);

    if (sourceBox === undefined || targetBox === undefined) {
      continue;
    }

    const sourceContext =
      nodeById.get(relationship.sourceRef)?.contextId ??
      contextGroupById.get(relationship.sourceRef)?.contextId ??
      null;
    const targetContext =
      nodeById.get(relationship.targetRef)?.contextId ??
      contextGroupById.get(relationship.targetRef)?.contextId ??
      null;
    const crossContext =
      sourceContext !== null &&
      targetContext !== null &&
      sourceContext !== targetContext;

    edges.push({
      relationshipId: relationship.id,
      kind: relationship.kind,
      sourceRef: relationship.sourceRef,
      targetRef: relationship.targetRef,
      points: routeEdge(sourceBox, targetBox),
      dashed: crossContext || relationship.kind === 'plays_role',
      arrow: relationship.kind === 'plays_role',
      crossContext,
      label: relationship.label,
    });
  }

  const responsibilityLinks: ResponsibilityLink[] = [];

  for (const entity of document.entities) {
    if (entity.category !== 'evidence') {
      continue;
    }

    for (const roleId of entity.roleRefs ?? []) {
      if (boxOf(roleId) !== undefined) {
        responsibilityLinks.push({
          sourceRef: entity.id,
          roleId,
          kind: 'contract_party',
        });
      }
    }

    if (
      entity.responsibleRoleRef !== undefined &&
      boxOf(entity.responsibleRoleRef) !== undefined
    ) {
      responsibilityLinks.push({
        sourceRef: entity.id,
        roleId: entity.responsibleRoleRef,
        kind: 'responsibility',
      });
    }
  }

  const bounds = computeBounds(
    allNodes.map((node) => node.box),
    allContextGroups.map((group) => group.box),
  );

  return {
    bounds,
    nodes: allNodes,
    nodeById,
    edges,
    edgeById: new Map(
      edges.map((edge) => [edge.relationshipId, edge] as const),
    ),
    responsibilityLinks,
    contextGroups: allContextGroups,
    contextGroupById,
    fulfillmentGroups: allGroups,
    fulfillmentGroupByRequest: new Map(
      allGroups.map((group) => [group.requestId, group] as const),
    ),
    freeNodeIds: freeEntities.map(({ id }) => id),
    omittedContextIds,
  };
};

const computeBounds = (
  nodeBoxes: readonly Rect[],
  contextBoxes: readonly Rect[],
): Rect => {
  const all = [...nodeBoxes, ...contextBoxes];

  if (all.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return all.reduce(unionRects);
};

/**
 * Orthogonal three-segment route chosen from the relative position of the two
 * boxes, so parallel edges inside one Context never overlap their labels.
 */
export const routeEdge = (source: Rect, target: Rect): Point[] => {
  const sourceCenter = rectCenter(source);
  const targetCenter = rectCenter(target);

  if (target.x >= rectRight(source)) {
    return horizontalRoute(
      { x: rectRight(source), y: sourceCenter.y },
      { x: target.x, y: targetCenter.y },
    );
  }

  if (rectRight(target) <= source.x) {
    return horizontalRoute(
      { x: source.x, y: sourceCenter.y },
      { x: rectRight(target), y: targetCenter.y },
    );
  }

  if (target.y >= rectBottom(source)) {
    return verticalRoute(
      { x: sourceCenter.x, y: rectBottom(source) },
      { x: targetCenter.x, y: target.y },
    );
  }

  return verticalRoute(
    { x: sourceCenter.x, y: source.y },
    { x: targetCenter.x, y: rectBottom(target) },
  );
};

const horizontalRoute = (from: Point, to: Point): Point[] => {
  if (Math.abs(from.y - to.y) < 0.5) {
    return [from, { x: to.x, y: from.y }];
  }

  const midX = (from.x + to.x) / 2;

  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
};

const verticalRoute = (from: Point, to: Point): Point[] => {
  if (Math.abs(from.x - to.x) < 0.5) {
    return [from, { x: from.x, y: to.y }];
  }

  const midY = (from.y + to.y) / 2;

  return [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to];
};
