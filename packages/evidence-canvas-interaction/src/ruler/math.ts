import type { RulerTick, RulerTickOptions } from './types.js';

export const DEFAULT_MIN_MAJOR_STEP_PX = 80;
export const DEFAULT_MINOR_DIVISIONS = 5;

/** 1-2-5 ladder keeps labelled steps readable at every zoom level. */
export const RULER_STEP_LADDER = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
] as const;

/**
 * Smallest ladder step whose on-screen width still clears
 * `minMajorStepPx`; the last ladder rung is extended by whole multiples when a
 * caller asks for an unusually large minimum.
 */
export const pickRulerStep = (minMajorStepPx: number, zoom: number): number => {
  const safeZoom = zoom > 0 ? zoom : 1;
  const minimum = Math.max(1, minMajorStepPx);
  const largest = RULER_STEP_LADDER[RULER_STEP_LADDER.length - 1];

  for (const step of RULER_STEP_LADDER) {
    if (step * safeZoom >= minimum) {
      return step;
    }
  }

  return largest * Math.ceil(minimum / (largest * safeZoom));
};

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * Ticks covering `[worldStart, worldEnd]`, aligned to the step grid so the
 * ruler keeps its labels while the canvas pans.
 */
export const getRulerTicks = ({
  worldStart,
  worldEnd,
  zoom,
  pan,
  minMajorStepPx = DEFAULT_MIN_MAJOR_STEP_PX,
  minorDivisions = DEFAULT_MINOR_DIVISIONS,
}: RulerTickOptions): RulerTick[] => {
  if (!Number.isFinite(worldStart) || !Number.isFinite(worldEnd)) {
    return [];
  }

  const safeZoom = zoom > 0 ? zoom : 1;
  const start = Math.min(worldStart, worldEnd);
  const end = Math.max(worldStart, worldEnd);

  if (end - start <= 0) {
    return [];
  }

  const divisions =
    Number.isInteger(minorDivisions) && minorDivisions > 1
      ? minorDivisions
      : DEFAULT_MINOR_DIVISIONS;
  const majorStep = pickRulerStep(minMajorStepPx, safeZoom);
  const minorStep = majorStep / divisions;
  const firstMinor = Math.floor(start / minorStep);
  const lastMinor = Math.ceil(end / minorStep);
  const ticks: RulerTick[] = [];
  const epsilon = minorStep * 1e-6;

  for (let index = firstMinor; index <= lastMinor; index += 1) {
    const value = round(index * minorStep);

    if (value < start - epsilon || value > end + epsilon) {
      continue;
    }

    const isMajor = index % divisions === 0;

    ticks.push({
      value,
      position: round(value * safeZoom + pan),
      level: isMajor ? 'major' : 'minor',
    });
  }

  return ticks;
};
