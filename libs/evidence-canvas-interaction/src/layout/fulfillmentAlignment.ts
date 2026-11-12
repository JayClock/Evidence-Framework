import { rectCenter, type Rect } from '../geometry.js';
import type { DomainGraphLayout } from './types.js';

/** Where one Request, its confirmations and its proofs sit on the canvas. */
export interface FulfillmentAlignment {
  groupId: string;
  contractId: string | null;
  requestId: string;
  requestBox: Rect;
  confirmationBoxes: readonly Rect[];
  proofBoxes: readonly Rect[];
  /** Vertical centre shared by the Request and the result stack. */
  centerY: number;
  /** True while the Request overlaps the result stack vertically. */
  aligned: boolean;
}

export const resolveFulfillmentAlignment = (
  layout: DomainGraphLayout,
  requestId: string,
): FulfillmentAlignment | null => {
  const group = layout.fulfillmentGroupByRequest.get(requestId);
  const request = layout.nodeById.get(requestId);

  if (group === undefined || request === undefined) {
    return null;
  }

  const confirmationBoxes = group.confirmationIds
    .map((id) => layout.nodeById.get(id)?.box)
    .filter((box): box is Rect => box !== undefined);
  const proofBoxes = group.proofIds
    .map((id) => layout.nodeById.get(id)?.box)
    .filter((box): box is Rect => box !== undefined);
  const resultBoxes = [...confirmationBoxes, ...proofBoxes];
  const centerY = rectCenter(request.box).y;
  const aligned =
    resultBoxes.length === 0 ||
    resultBoxes.some((box) => {
      const result = rectCenter(box);

      return centerY >= box.y && centerY <= box.y + box.height
        ? true
        : Math.abs(result.y - centerY) <= 1;
    });

  return {
    groupId: group.groupId,
    contractId: group.contractId,
    requestId,
    requestBox: request.box,
    confirmationBoxes,
    proofBoxes,
    centerY,
    aligned,
  };
};

/** One moment a confirmation or a proof stands for on the timeline. */
export interface FulfillmentMoment {
  nodeId: string;
  kind: 'confirmation' | 'proof';
  box: Rect;
  centerY: number;
  /** Signed distance from the request's centre line, in world pixels. */
  offset: number;
  /**
   * True when the request's centre line crosses this moment's own box.
   *
   * That is the reading a workshop needs: "does this confirmation answer that
   * request on the same row", not "are the two boxes pixel-identical". A stack
   * of several confirmations still reads as one row when every stamp straddles
   * the line.
   */
  onRequestRow: boolean;
}

/**
 * How one Fulfillment pair reads on the board.
 *
 * The pair is asymmetric on purpose: the request is a *window* (an interval bar
 * with two ends, because `started_at` and `expired_at` are both mandatory) while
 * every confirmation and proof is an *instant* (a stamp with one end). Drawing
 * them as the same shape is what made the earlier canvas read as a class
 * diagram rather than as a delivery timeline.
 */
export interface FulfillmentBand {
  groupId: string;
  requestId: string;
  /** The request box, drawn as an interval bar with two end stops. */
  intervalBar: Rect;
  /** Horizontal centre line every moment is compared against. */
  centerY: number;
  moments: readonly FulfillmentMoment[];
  /** Moments that answer the request on its own row. */
  alignedMomentIds: readonly string[];
}

/**
 * Reads a Fulfillment group as one interval plus its moments.
 *
 * Returns `null` when the request is not placed, so a caller can render an
 * unknown group instead of an empty band at the origin.
 */
export const resolveFulfillmentBand = (
  layout: DomainGraphLayout,
  requestId: string,
): FulfillmentBand | null => {
  const group = layout.fulfillmentGroupByRequest.get(requestId);
  const request = layout.nodeById.get(requestId);

  if (group === undefined || request === undefined) {
    return null;
  }

  const centerY = rectCenter(request.box).y;
  const moments: FulfillmentMoment[] = [];

  for (const [kind, ids] of [
    ['confirmation', group.confirmationIds],
    ['proof', group.proofIds],
  ] as const) {
    for (const nodeId of ids) {
      const node = layout.nodeById.get(nodeId);

      if (node === undefined) {
        continue;
      }

      const momentCenterY = rectCenter(node.box).y;

      moments.push({
        nodeId,
        kind,
        box: node.box,
        centerY: momentCenterY,
        offset: Math.round((momentCenterY - centerY) * 100) / 100,
        onRequestRow:
          centerY >= node.box.y && centerY <= node.box.y + node.box.height,
      });
    }
  }

  return {
    groupId: group.groupId,
    requestId,
    intervalBar: request.box,
    centerY,
    moments,
    alignedMomentIds: moments
      .filter((moment) => moment.onRequestRow)
      .map((moment) => moment.nodeId),
  };
};

/** SVG path of the dashed Fulfillment boundary drawn under its nodes. */
export const fulfillmentBoundaryPath = (box: Rect, radius = 10): string => {
  const { x, y, width, height } = box;
  const limit = Math.min(radius, width / 2, height / 2);

  if (limit <= 0) {
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  }

  return [
    `M ${x + limit} ${y}`,
    `H ${x + width - limit}`,
    `A ${limit} ${limit} 0 0 1 ${x + width} ${y + limit}`,
    `V ${y + height - limit}`,
    `A ${limit} ${limit} 0 0 1 ${x + width - limit} ${y + height}`,
    `H ${x + limit}`,
    `A ${limit} ${limit} 0 0 1 ${x} ${y + height - limit}`,
    `V ${y + limit}`,
    `A ${limit} ${limit} 0 0 1 ${x + limit} ${y}`,
    'Z',
  ].join(' ');
};
