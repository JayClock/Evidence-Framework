import { describe, expect, it } from 'vitest';
import {
  LIFECYCLE_STAGE_GEOMETRIES,
  calculateNodePlacement,
  calculateStageBoundaries,
} from './stageLayout.js';

describe('stageLayout', () => {
  const dimensions = {
    width: 1920,
    height: 1080,
    skewAngleDeg: -18,
  };

  it('defines geometries for all four lifecycle stages', () => {
    expect(LIFECYCLE_STAGE_GEOMETRIES).toHaveLength(4);
    expect(LIFECYCLE_STAGE_GEOMETRIES.map((g) => g.stage)).toEqual([
      'rfp',
      'proposal',
      'contract',
      'fulfillment',
    ]);
  });

  it('calculates stage boundary lines with proper skew offsets', () => {
    const boundaries = calculateStageBoundaries(dimensions);
    expect(boundaries).toHaveLength(4);

    const first = boundaries[0]!;
    expect(first.stage).toBe('rfp');
    expect(first.bottom.y).toBe(1080);
    expect(first.top.y).toBe(0);
    // Skew shift pushes top to the left when angle is negative
    expect(first.top.x).toBeLessThan(first.bottom.x);
  });

  it('places nodes proportionally within their assigned lifecycle stage', () => {
    const rfpPos = calculateNodePlacement('rfp', 0, 1, dimensions);
    const contractPos = calculateNodePlacement('contract', 0, 1, dimensions);

    expect(rfpPos.x).toBeGreaterThan(0);
    expect(contractPos.x).toBeGreaterThan(rfpPos.x);
    expect(rfpPos.y).toBeGreaterThanOrEqual(100);
  });
});
