import React, { useMemo } from 'react';
import {
  LIFECYCLE_STAGE_GEOMETRIES,
  calculateStageBoundaries,
} from '@evidence-poc/evidence-canvas-interaction';

export interface LifecycleSwimlaneOverlayProps {
  readonly width: number;
  readonly height: number;
  readonly activeStage?: string;
}

export const LifecycleSwimlaneOverlay: React.FC<LifecycleSwimlaneOverlayProps> = ({
  width,
  height,
  activeStage,
}) => {
  const boundaries = useMemo(
    () => calculateStageBoundaries({ width, height, skewAngleDeg: -18 }),
    [width, height],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      aria-label="业务全生命周期四阶段泳道"
    >
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center px-6 border-b border-[#e2e8f0]/60 bg-gradient-to-b from-[#f8fafc]/90 to-transparent backdrop-blur-[2px]">
        {LIFECYCLE_STAGE_GEOMETRIES.map((g) => (
          <div
            key={g.stage}
            className="flex-1 flex flex-col items-center justify-center transition-opacity"
            style={{
              opacity: !activeStage || activeStage === g.stage ? 1 : 0.45,
            }}
          >
            <span className="text-[13px] font-bold tracking-wide text-[#1e293b]">
              {g.label}
            </span>
            <span className="text-[10px] font-mono text-[#64748b]">
              {g.subLabel}
            </span>
          </div>
        ))}
      </div>

      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="slashFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.8" />
            <stop offset="90%" stopColor="#cbd5e1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {boundaries.slice(0, -1).map(({ stage, top, bottom }) => (
          <g key={stage}>
            <line
              x1={top.x}
              y1={top.y + 48}
              x2={bottom.x}
              y2={bottom.y - 48}
              stroke="url(#slashFade)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
          </g>
        ))}
      </svg>

      <div className="absolute bottom-4 left-8 right-8 flex items-center gap-3">
        <div className="h-[2px] flex-1 bg-gradient-to-r from-[#94a3b8]/30 via-[#64748b]/60 to-[#334155] rounded-full relative">
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[4px] border-y-transparent border-l-[8px] border-l-[#334155]" />
        </div>
        <span className="text-[10px] font-mono font-semibold tracking-wider text-[#475569] uppercase">
          Business Life Cycle Time Horizon →
        </span>
      </div>
    </div>
  );
};
