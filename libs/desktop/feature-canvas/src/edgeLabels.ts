import type { Point } from '@evidence-poc/evidence-canvas-interaction';

/** Position along the routed polyline, not the midpoint of its end points. */
export const pointOnRoute = (
  points: readonly Point[],
  fraction: number,
): Point => {
  const lengths = points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
    );
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let distance = total * Math.max(0, Math.min(1, fraction));
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (length === 0) continue;
    if (distance <= length) {
      const from = points[index]!;
      const to = points[index + 1]!;
      return {
        x: from.x + ((to.x - from.x) * distance) / length,
        y: from.y + ((to.y - from.y) * distance) / length,
      };
    }
    distance -= length;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
};
