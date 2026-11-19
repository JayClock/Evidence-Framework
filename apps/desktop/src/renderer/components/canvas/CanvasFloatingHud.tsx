import { Ellipsis, Maximize2, Minus, Plus } from 'lucide-react';

import type {
  CanvasGridStyle,
  CanvasHudControls,
  CanvasViewMode,
} from '@evidence-poc/desktop-feature-canvas';
import {
  Button,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@evidence-poc/desktop-ui-kit';

interface CanvasFloatingHudProps extends CanvasHudControls {
  density: CanvasViewMode;
  onDensityChange: (mode: CanvasViewMode) => void;
  onOpenScenarios: () => void;
  hasSelection: boolean;
  onClearSelection: () => void;
}

const zoomButtonClass = 'size-6 rounded-full p-0 [&_svg]:size-3.5';

export const CanvasFloatingHud = ({
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
  <div
    role="group"
    aria-label="画布工具"
    data-workbench-chrome=""
    className="pointer-events-auto flex h-8 items-center gap-1 rounded-full border border-workbench-border bg-white px-2 shadow-hud"
  >
    <Button
      type="button"
      variant="ghost"
      className={zoomButtonClass}
      aria-label="缩小"
      onClick={zoomOut}
    >
      <Minus aria-hidden="true" />
    </Button>
    <Button
      type="button"
      variant="ghost"
      className="h-6 rounded-full px-1 tabular-nums"
      aria-label={`当前缩放 ${Math.round(zoom * 100)}%，重置为 100%`}
      onClick={resetZoom}
    >
      {Math.round(zoom * 100)}%
    </Button>
    <Button
      type="button"
      variant="ghost"
      className={zoomButtonClass}
      aria-label="放大"
      onClick={zoomIn}
    >
      <Plus aria-hidden="true" />
    </Button>
    <Button
      type="button"
      variant="ghost"
      className="h-6 gap-1 rounded-full px-1.5 [&_svg]:size-3.5"
      onClick={fitToContent}
    >
      <Maximize2 aria-hidden="true" />
      适应画布
    </Button>
    <label className="flex items-center gap-1 border-l border-workbench-border pl-2 text-[11px] text-workbench-label">
      密度
      <select
        className="rounded bg-white focus-visible:outline-evidence-accent"
        value={density}
        onChange={(event) =>
          onDensityChange(event.target.value as CanvasViewMode)
        }
      >
        <option value="simplified">简化图</option>
        <option value="standard">标准图</option>
        <option value="expanded">展开图</option>
      </select>
    </label>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={zoomButtonClass}
          aria-label="更多画布工具"
        >
          <Ellipsis aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-evidence-capture-hide=""
        aria-label="更多画布工具"
        className="flex w-44 flex-col gap-1"
      >
        <label className="flex items-center justify-between gap-2 px-2 py-1 text-xs">
          画布底纹
          <select
            value={grid}
            onChange={(event) =>
              onGridChange(event.target.value as CanvasGridStyle)
            }
          >
            <option value="dots">点阵</option>
            <option value="lines">网格</option>
            <option value="none">无底纹</option>
          </select>
        </label>
        <PopoverClose asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!hasSelection}
            onClick={onClearSelection}
          >
            清除选择
          </Button>
        </PopoverClose>
        <PopoverClose asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onOpenScenarios}
          >
            业务场景推演
          </Button>
        </PopoverClose>
      </PopoverContent>
    </Popover>
  </div>
);
