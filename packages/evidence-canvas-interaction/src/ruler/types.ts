export type RulerAxis = 'x' | 'y';

export type RulerTickLevel = 'major' | 'minor';

export interface RulerTick {
  /** World coordinate the tick marks. */
  value: number;
  /** Screen pixel position inside the ruler window. */
  position: number;
  level: RulerTickLevel;
}

export interface RulerTickOptions {
  /** World coordinate at the ruler's leading edge. */
  worldStart: number;
  /** World coordinate at the ruler's trailing edge. */
  worldEnd: number;
  zoom: number;
  /** Screen position of world origin. */
  pan: number;
  minMajorStepPx?: number;
  minorDivisions?: number;
}
