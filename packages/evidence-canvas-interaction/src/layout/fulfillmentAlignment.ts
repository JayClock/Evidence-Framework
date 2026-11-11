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
