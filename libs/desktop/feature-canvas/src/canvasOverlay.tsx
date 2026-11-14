import type { LayoutNode } from '@evidence-poc/evidence-canvas-interaction';

/** How a change relates to the object the active model draws. */
export type OverlayChange = 'added' | 'removed' | 'modified';

/**
 * Marks the objects a pending agent patch touches.
 *
 * Rings only recolour objects the model already draws, so the picture stays the
 * model the user is editing rather than a proposal that has not been accepted.
 */
export interface ModelOverlay {
  marks: ReadonlyMap<string, OverlayChange>;
}

export const OVERLAY_COLOR: Record<OverlayChange, string> = {
  added: '#15803d',
  removed: '#b42318',
  modified: '#8d6200',
};

export const OVERLAY_LABEL: Record<OverlayChange, string> = {
  added: '本次补丁新增',
  removed: '本次补丁删除',
  modified: '本次补丁修改',
};

/**
 * A ring around an object the pending patch added, removed or changed.
 *
 * It renders in flow coordinates, so it has to be mounted inside the canvas's
 * viewport portal rather than on the screen.
 */
export const ChangeRing = ({
  node,
  change,
}: {
  node: LayoutNode;
  change: OverlayChange;
}) => (
  <div
    aria-label={`${OVERLAY_LABEL[change]} ${node.entity.label}`}
    data-overlay-change={change}
    data-overlay-node-id={node.nodeId}
    className="pointer-events-none absolute rounded-md border-2"
    style={{
      left: node.box.x - 3,
      top: node.box.y - 3,
      width: node.box.width + 6,
      height: node.box.height + 6,
      borderColor: OVERLAY_COLOR[change],
      borderStyle: change === 'removed' || change === 'added' ? 'dashed' : 'solid',
    }}
  />
);
