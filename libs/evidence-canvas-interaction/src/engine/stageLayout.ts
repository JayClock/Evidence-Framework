import type { LifecycleStage } from '@evidence-poc/evidence-schema';

export interface StageGeometry {
  readonly stage: LifecycleStage;
  readonly label: string;
  readonly subLabel: string;
  readonly xStartRatio: number;
  readonly xEndRatio: number;
  readonly accentColor: string;
}

export const LIFECYCLE_STAGE_GEOMETRIES: readonly StageGeometry[] = [
  {
    stage: 'rfp',
    label: '邀请投标',
    subLabel: 'RFP / Sourcing',
    xStartRatio: 0.0,
    xEndRatio: 0.22,
    accentColor: '#3b82f6',
  },
  {
    stage: 'proposal',
    label: '投标',
    subLabel: 'Proposal / Bidding',
    xStartRatio: 0.22,
    xEndRatio: 0.44,
    accentColor: '#8b5cf6',
  },
  {
    stage: 'contract',
    label: '合同',
    subLabel: 'Contract / Agreement',
    xStartRatio: 0.44,
    xEndRatio: 0.62,
    accentColor: '#ec4899',
  },
  {
    stage: 'fulfillment',
    label: '履约',
    subLabel: 'Fulfillment & Remedy',
    xStartRatio: 0.62,
    xEndRatio: 1.0,
    accentColor: '#10b981',
  },
] as const;

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface StageBoundaryLine {
  readonly stage: LifecycleStage;
  readonly top: Point2D;
  readonly bottom: Point2D;
}

export interface CanvasDimensions {
  readonly width: number;
  readonly height: number;
  readonly skewAngleDeg: number;
}

/**
 * Calculates skew boundary lines between lifecycle stages.
 */
export function calculateStageBoundaries(
  dimensions: CanvasDimensions,
): readonly StageBoundaryLine[] {
  const { width, height, skewAngleDeg } = dimensions;
  const absSkewOffset = Math.abs(Math.tan((skewAngleDeg * Math.PI) / 180) * height);
  const usableWidth = width - absSkewOffset;

  return LIFECYCLE_STAGE_GEOMETRIES.map((geom) => {
    const baseX = absSkewOffset + usableWidth * geom.xEndRatio;
    return {
      stage: geom.stage,
      top: { x: baseX - absSkewOffset, y: 0 },
      bottom: { x: baseX, y: height },
    };
  });
}

/**
 * Calculates recommended placement coordinates for an evidence node within its lifecycle stage.
 */
export function calculateNodePlacement(
  stage: LifecycleStage,
  indexInStage: number,
  totalInStage: number,
  dimensions: CanvasDimensions,
): Point2D {
  const geom =
    LIFECYCLE_STAGE_GEOMETRIES.find((g) => g.stage === stage) ??
    LIFECYCLE_STAGE_GEOMETRIES[0]!;
  const absSkewOffset = Math.abs(
    Math.tan((dimensions.skewAngleDeg * Math.PI) / 180) * dimensions.height,
  );
  const usableWidth = dimensions.width - absSkewOffset;
  const startX = absSkewOffset + usableWidth * geom.xStartRatio;
  const stageWidth = usableWidth * (geom.xEndRatio - geom.xStartRatio);

  const totalCols = Math.max(1, Math.ceil(totalInStage / 3));
  const columnWidth = stageWidth / totalCols;
  const col = Math.floor(indexInStage / 3);
  const row = indexInStage % 3;

  const ySpacing = (dimensions.height - 180) / 4;
  const y = 100 + row * ySpacing;
  const skewShift = (1 - y / dimensions.height) * absSkewOffset;
  const x = startX - skewShift + 20 + col * columnWidth;

  return { x: Math.max(20, Math.round(x)), y: Math.round(y) };
}
