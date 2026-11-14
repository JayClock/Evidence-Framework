import { Maximize2, Minus, MousePointer2, Plus } from 'lucide-react';

import type { CanvasHudControls } from '@evidence-poc/desktop-feature-canvas';
import {
  ViewModeSegmentedControl,
  cn,
  type WorkspaceViewMode,
} from '@evidence-poc/desktop-ui-kit';

import type { CanvasViewMode } from '@evidence-poc/desktop-feature-canvas';

export interface CanvasFloatingHudProps extends CanvasHudControls {
  /** Graph, ledger or split — the app's view state, not the canvas's. */
  viewMode: WorkspaceViewMode;
  onViewModeChange: (mode: WorkspaceViewMode) => void;
  /** Card density inside the graph. */
  density: CanvasViewMode;
  onDensityChange: (mode: CanvasViewMode) => void;
  /** True while an object is selected, so "pointer" can mean "deselect". */
  hasSelection: boolean;
  onClearSelection: () => void;
}

const DENSITIES: readonly { id: CanvasViewMode; label: string }[] = [
  { id: 'simplified', label: '简化图' },
  { id: 'standard', label: '标准图' },
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
  hasSelection,
  onClearSelection,
  zoom,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToContent,
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

    <ViewModeSegmentedControl mode={viewMode} onChange={onViewModeChange} />

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
