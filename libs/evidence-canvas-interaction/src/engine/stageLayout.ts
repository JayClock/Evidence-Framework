import type { Point } from '../geometry.js';
import type { JourneyMilestone } from '../layout/types.js';

export const LIFECYCLE_STAGE_GUTTER = 64;
export const LIFECYCLE_HEADER_HEIGHT = 64;
export const LIFECYCLE_FOOTER_HEIGHT = 48;

export const calculateStageBoundaries = (
  milestones: readonly JourneyMilestone[],
  height: number,
): readonly { stage: JourneyMilestone['stage']; top: Point; bottom: Point }[] =>
  milestones.slice(1).map(({ stage, x }) => ({
    stage,
    top: { x: x - 8, y: LIFECYCLE_HEADER_HEIGHT },
    bottom: { x: x - 36, y: height - LIFECYCLE_FOOTER_HEIGHT },
  }));
