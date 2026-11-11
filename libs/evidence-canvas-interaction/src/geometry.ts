/** Shared planar geometry for viewport, ruler and layout modules. */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
): Rect => ({
  x,
  y,
  width,
  height,
});

export const rectRight = (value: Rect): number => value.x + value.width;

export const rectBottom = (value: Rect): number => value.y + value.height;

export const rectCenter = (value: Rect): Point => ({
  x: value.x + value.width / 2,
  y: value.y + value.height / 2,
});

export const rectsIntersect = (left: Rect, right: Rect): boolean =>
  left.x < rectRight(right) &&
  right.x < rectRight(left) &&
  left.y < rectBottom(right) &&
  right.y < rectBottom(left);

export const rectContainsRect = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  rectRight(inner) <= rectRight(outer) &&
  rectBottom(inner) <= rectBottom(outer);

export const rectContainsPoint = (value: Rect, point: Point): boolean =>
  point.x >= value.x &&
  point.x <= rectRight(value) &&
  point.y >= value.y &&
  point.y <= rectBottom(value);

/** Smallest rectangle covering both inputs. */
export const unionRects = (left: Rect, right: Rect): Rect => {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);

  return {
    x,
    y,
    width: Math.max(rectRight(left), rectRight(right)) - x,
    height: Math.max(rectBottom(left), rectBottom(right)) - y,
  };
};

export const insetRect = (value: Rect, by: number): Rect => ({
  x: value.x + by,
  y: value.y + by,
  width: Math.max(0, value.width - by * 2),
  height: Math.max(0, value.height - by * 2),
});

export const translateRect = (value: Rect, dx: number, dy: number): Rect => ({
  ...value,
  x: value.x + dx,
  y: value.y + dy,
});

/** Union of a list of rectangles; `null` when the list is empty. */
export const boundsOfRects = (rectangles: readonly Rect[]): Rect | null =>
  rectangles.reduce<Rect | null>(
    (accumulated, current) =>
      accumulated === null ? current : unionRects(accumulated, current),
    null,
  );

export const normalizeRect = (start: Point, end: Point): Rect => ({
  x: Math.min(start.x, end.x),
  y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x),
  height: Math.abs(end.y - start.y),
});
