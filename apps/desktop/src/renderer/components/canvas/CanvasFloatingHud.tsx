import { Grid3x3, Maximize2, Minus, MousePointer2, Plus } from 'lucide-react';

import type {
  CanvasGridStyle,
  CanvasHudControls,
} from '@evidence-poc/desktop-feature-canvas';
import {
  ViewModeSegmentedControl,
  cn,
  type GraphViewMode,
} from '@evidence-poc/desktop-ui-kit';

import type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';

export interface CanvasFloatingHudProps extends CanvasHudControls {
  viewMode: GraphViewMode;
  onViewModeChange: (mode: GraphViewMode) => void;
  /** Card density inside the graph. */
  density: CanvasViewMode;
  onDensityChange: (mode: CanvasViewMode) => void;
  onOpenScenarios?: () => void;
  /** True while an object is selected, so "pointer" can mean "deselect". */
  hasSelection: boolean;
  onClearSelection: () => void;
}

const DENSITIES: readonly { id: CanvasViewMode; label: string }[] = [
  { id: 'simplified', label: '简化图' },
  { id: 'standard', label: '标准图' },
  { id: 'expanded', label: '展开图' },
];

const GRIDS: readonly { id: CanvasGridStyle; label: string }[] = [
  { id: 'dots', label: '点阵' },
  { id: 'lines', label: '网格' },
  { id: 'none', label: '无底纹' },
];

/**
 * The studio's tool island.
 *
 * Every control a modeler presses while looking at the model lives here, in one
 * floating strip at the bottom centre: the pointer, the card density, which
 * projection fills the stage, and the zoom maths. It floats instead of docking
 * so the canvas keeps the full width and the strip never competes with the
 * drawers the activity rail opens.
 *
 * Creating objects is deliberately not a HUD button: a Contract, a request or a
 * confirmation is only valid once its Context, root and role bindings exist, so
 * placement stays with the inspector and the agent, which can honour those red
 * lines. The island switches views; it does not invent business objects.
 */
export const CanvasFloatingHud = ({
  viewMode,
  onViewModeChange,
  density,
  onDensityChange,
  onOpenScenarios,
  hasSelection,
  onClearSelection,
  zoom,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToContent,
  grid,
  onGridChange,
}: CanvasFloatingHudProps) => (
  <div className="pointer-events-auto flex shrink-0 items-center gap-1 rounded-lg border border-evidence-line bg-white/85 px-1.5 py-1 shadow-hud backdrop-blur-md">
    <button
      type="button"
      aria-label="选取工具"
      aria-pressed={!hasSelection}
      onClick={onClearSelection}
      title="返回选取：清除当前选择"
      className={cn(
        'flex size-6 items-center justify-center rounded transition-colors',
        hasSelection
          ? 'text-evidence-muted hover:bg-evidence-hover hover:text-evidence-ink'
          : 'bg-evidence-accent text-white',
      )}
    >
      <MousePointer2 aria-hidden="true" className="size-3.5" />
    </button>

    <span aria-hidden="true" className="mx-1 h-4 w-px bg-evidence-line" />

    <div
      role="group"
      aria-label="卡片密度"
      className="flex items-center rounded border border-evidence-line p-0.5 text-[10px]"
    >
      {DENSITIES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={density === item.id}
          onClick={() => onDensityChange(item.id)}
          className={cn(
            'rounded px-1.5 py-0.5 transition-colors',
            density === item.id
              ? 'bg-evidence-accent text-white'
              : 'text-evidence-muted hover:text-evidence-ink',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>

    <span aria-hidden="true" className="mx-1 h-4 w-px bg-evidence-line" />

    {onOpenScenarios ? (
      <button
        type="button"
        className="rounded border border-evidence-line px-2 py-1 text-[10px]"
        onClick={onOpenScenarios}
      >
        业务场景推演
      </button>
    ) : null}
    <ViewModeSegmentedControl mode={viewMode} onChange={onViewModeChange} />

    <button
      type="button"
      aria-label={`画布底纹：${GRIDS.find((item) => item.id === grid)?.label ?? ''}`}
      title="切换画布底纹"
      onClick={() =>
        onGridChange(
          grid === 'dots' ? 'lines' : grid === 'lines' ? 'none' : 'dots',
        )
      }
      className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
    >
      <Grid3x3 aria-hidden="true" className="size-3" />
    </button>

    <span aria-hidden="true" className="mx-1 h-4 w-px bg-evidence-line" />

    <button
      type="button"
      aria-label="缩小"
      onClick={zoomOut}
      className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
    >
      <Minus aria-hidden="true" className="size-3" />
    </button>
    <button
      type="button"
      aria-label={`当前缩放 ${Math.round(zoom * 100)}%，重置为 100%`}
      onClick={resetZoom}
      title="重置为 100%（⌘0）"
      className="w-11 rounded px-1 py-0.5 text-[10px] tabular-nums text-evidence-ink hover:bg-evidence-hover"
    >
      {Math.round(zoom * 100)}%
    </button>
    <button
      type="button"
      aria-label="放大"
      onClick={zoomIn}
      className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
    >
      <Plus aria-hidden="true" className="size-3" />
    </button>
    <button
      type="button"
      aria-label="适应内容"
      onClick={fitToContent}
      title="适应内容（⇧1）"
      className="flex size-6 items-center justify-center rounded text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
    >
      <Maximize2 aria-hidden="true" className="size-3" />
    </button>
  </div>
);
