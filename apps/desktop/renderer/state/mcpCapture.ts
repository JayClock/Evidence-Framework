/** A rectangle in CSS pixels, as `getBoundingClientRect` reports it. */
export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number): number => Math.max(0, Math.round(value));

/** Overlap of two rectangles, or `null` when they do not share any pixel. */
export const intersectRects = (
  left: CaptureRect,
  right: CaptureRect,
): CaptureRect | null => {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const width = rightEdge - x;
  const height = bottomEdge - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x: clamp(x), y: clamp(y), width: clamp(width), height: clamp(height) };
};

/** Drops the ruler band, so a screenshot never shows editor chrome. */
export const insetRect = (
  rect: CaptureRect,
  inset: { top: number; left: number },
): CaptureRect => ({
  x: rect.x + inset.left,
  y: rect.y + inset.top,
  width: Math.max(1, rect.width - inset.left),
  height: Math.max(1, rect.height - inset.top),
});

/**
 * Chooses the pixels to capture.
 *
 * A node target is clipped to the visible canvas (a node may be larger than the
 * window); without a target the whole visible stage is captured. Rulers and the
 * zoom control are excluded because the screenshot is a design-side reference,
 * not a picture of the editor.
 */
export const resolveCaptureRect = ({
  target,
  stage,
  viewport,
  rulerThickness,
}: {
  target: CaptureRect | null;
  stage: CaptureRect | null;
  viewport: CaptureRect;
  rulerThickness: number;
}): CaptureRect | null => {
  const visible = insetRect(viewport, { top: rulerThickness, left: rulerThickness });
  const content = target ?? stage;

  if (content === null) {
    return null;
  }

  return intersectRects(content, visible);
};

/** Serializes the painter for `webContents.capturePage`. */
export const toElectronRect = (
  rect: CaptureRect,
): { x: number; y: number; width: number; height: number } => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
});
