import { useMemo } from 'react';

import {
  getRulerTicks,
  type RulerTick,
  type ViewportState,
} from '@evidence-poc/evidence-canvas-interaction';

export const RULER_THICKNESS = 24;

const TICK_COLOR = '#b6bcc6';
const MAJOR_TICK_COLOR = '#8a929e';

const tickLabel = (value: number): string => `${Math.round(value)}`;

interface RulerTicksProps {
  axis: 'x' | 'y';
  /** Ruler length in screen pixels. */
  size: number;
  viewport: ViewportState;
}

/**
 * One axis ruler. Tick maths lives in `evidence-canvas-interaction`; this
 * component only maps ticks to SVG marks.
 */
export const RulerTicks = ({ axis, size, viewport }: RulerTicksProps) => {
  const pan = axis === 'x' ? viewport.panX : viewport.panY;
  const ticks = useMemo<RulerTick[]>(() => {
    if (size <= 0) {
      return [];
    }

    return getRulerTicks({
      worldStart: (0 - pan) / viewport.zoom,
      worldEnd: (size - pan) / viewport.zoom,
      zoom: viewport.zoom,
      pan,
    });
  }, [pan, size, viewport.zoom]);

  return (
    <svg
      className="absolute inset-0"
      width={axis === 'x' ? size : RULER_THICKNESS}
      height={axis === 'x' ? RULER_THICKNESS : size}
      aria-hidden="true"
    >
      {ticks.map((tick) => {
        const major = tick.level === 'major';
        const position = Math.round(tick.position);

        return axis === 'x' ? (
          <g key={`${tick.level}-${tick.value}`}>
            <line
              x1={position}
              x2={position}
              y1={major ? 8 : 16}
              y2={RULER_THICKNESS}
              stroke={major ? MAJOR_TICK_COLOR : TICK_COLOR}
              strokeWidth={1}
            />
            {major ? (
              <text
                x={position + 4}
                y={12}
                fontSize={9}
                fill="#6b7280"
                style={{ userSelect: 'none' }}
              >
                {tickLabel(tick.value)}
              </text>
            ) : null}
          </g>
        ) : (
          <g key={`${tick.level}-${tick.value}`}>
            <line
              x1={major ? 8 : 16}
              x2={RULER_THICKNESS}
              y1={position}
              y2={position}
              stroke={major ? MAJOR_TICK_COLOR : TICK_COLOR}
              strokeWidth={1}
            />
            {major ? (
              <text
                x={12}
                y={position - 4}
                fontSize={9}
                fill="#6b7280"
                textAnchor="middle"
                transform={`rotate(-90 12 ${position - 4})`}
                style={{ userSelect: 'none' }}
              >
                {tickLabel(tick.value)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};
