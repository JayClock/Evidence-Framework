import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGesture } from '@use-gesture/react';

import {
  DEFAULT_VIEWPORT,
  calculateZoomToFit,
  computeHighlight,
  panViewport,
  selectNodesInBox,
  zoomAtPoint,
  zoomByFactor,
  type ContextScope,
  type DomainGraphLayout,
  type HighlightResult,
  type Point,
  type Rect,
  type ViewportState,
} from '@evidence-poc/evidence-canvas-interaction';
import type {
  DomainGraph,
  ModelSelection,
} from '@evidence-poc/evidence-model-core/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  CanvasStage,
  type ModelOverlay,
  type CanvasViewMode,
} from './CanvasStage';
import { ScopeFilterControl } from './ScopeFilterControl';
import { BusinessLegend } from './BusinessLegend';
import { RULER_THICKNESS, RulerTicks } from './RulerTicks';

interface CanvasViewportProps {
  graph: DomainGraph;
  layout: DomainGraphLayout;
  document: DomainModelDocument;
  viewMode: CanvasViewMode;
  selection: ModelSelection;
  /** Incremented by the sidebar/search to reveal a node. */
  focusRequest: { nodeId: string; token: number } | null;
  /** Keyboard zoom requests, one token per key press. */
  zoomCommand: { direction: 'in' | 'out'; token: number } | null;
  /** Rings the objects a pending agent patch touches. */
  overlay?: ModelOverlay | null;
  scope?: ContextScope | null;
  onScopeChange?: (contextId: string | null) => void;
  onSelect: (nodeId: string) => void;
  onClearSelection: () => void;
}

type DragState =
  | { mode: 'pan'; last: Point }
  | { mode: 'marquee'; start: Point; current: Point };

const MIN_ZOOM_STEP = 0.02;

/**
 * Rulers, gestures and the transformed stage. Screen/world maths all comes from
 * `evidence-canvas-interaction`, so this file only wires pointers to it.
 */
export const CanvasViewport = ({
  graph,
  layout,
  document,
  viewMode,
  selection,
  focusRequest,
  zoomCommand,
  overlay = null,
  scope = null,
  onScopeChange,
  onSelect,
  onClearSelection,
}: CanvasViewportProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredContextId, setHoveredContextId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<readonly string[]>(
    [],
  );
  const spacePressed = useRef(false);
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeId = scope?.contextId ?? null;
  useEffect(
    () => () => {
      if (transitionTimer.current !== null)
        clearTimeout(transitionTimer.current);
    },
    [],
  );

  useEffect(() => {
    const element = containerRef.current;

    if (element === null) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) {
        return;
      }

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const fitToContent = useCallback(() => {
    setViewport(
      calculateZoomToFit(scope?.bounds ?? layout.bounds, {
        width: Math.max(1, size.width - RULER_THICKNESS),
        height: Math.max(1, size.height - RULER_THICKNESS),
      }),
    );
  }, [layout.bounds, scope, size.height, size.width]);

  // Fit once the first layout and viewport size are known.
  const fittedRef = useRef(false);

  useEffect(() => {
    if (fittedRef.current || size.width === 0 || layout.nodes.length === 0) {
      return;
    }

    fittedRef.current = true;
    fitToContent();
  }, [fitToContent, layout.nodes.length, size.width]);

  const previousFitKey = useRef(`${scopeId ?? ''}:${viewMode}`);
  useEffect(() => {
    const key = `${scopeId ?? ''}:${viewMode}`;
    if (size.width === 0 || previousFitKey.current === key) return;
    previousFitKey.current = key;
    fitToContent();
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setHoveredContextId(null);
    setMarqueeSelection([]);
    setDrag(null);
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTransitioning(true);
      if (transitionTimer.current !== null)
        clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => setTransitioning(false), 180);
    }
  }, [fitToContent, scopeId, viewMode, size.width]);

  const lastZoomToken = useRef<number | null>(null);
  useEffect(() => {
    if (zoomCommand === null || lastZoomToken.current === zoomCommand.token) {
      return;
    }
    lastZoomToken.current = zoomCommand.token;

    const anchor = {
      x: (size.width - RULER_THICKNESS) / 2,
      y: (size.height - RULER_THICKNESS) / 2,
    };

    setViewport((current) =>
      zoomAtPoint(
        current,
        current.zoom * (zoomCommand.direction === 'in' ? 1.25 : 0.8),
        anchor,
      ),
    );
  }, [zoomCommand, size.height, size.width]);

  const lastFocusToken = useRef<number | null>(null);
  useEffect(() => {
    if (
      focusRequest === null ||
      lastFocusToken.current === focusRequest.token
    ) {
      return;
    }

    const node = layout.nodeById.get(focusRequest.nodeId);

    if (node === undefined) {
      return;
    }

    lastFocusToken.current = focusRequest.token;
    setViewport((current) => {
      const target = {
        x: size.width - RULER_THICKNESS,
        y: size.height - RULER_THICKNESS,
      };

      return panViewport(
        current,
        target.x / 2 -
          (node.box.x + node.box.width / 2) * current.zoom -
          current.panX,
        target.y / 2 -
          (node.box.y + node.box.height / 2) * current.zoom -
          current.panY,
      );
    });
  }, [focusRequest, layout.nodeById, size.height, size.width]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        event.code === 'Space' &&
        !(
          event.target instanceof Element &&
          event.target.closest(
            '[data-canvas-control], input, textarea, [contenteditable="true"], [data-node-id]',
          )
        )
      ) {
        spacePressed.current = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spacePressed.current = false;
      }
    };

    const resetSpace = () => {
      spacePressed.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', resetSpace);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', resetSpace);
    };
  }, []);

  useGesture(
    {
      onWheel: ({ event, delta: [dx, dy], ctrlKey, metaKey, pinching }) => {
        if ((event.target as Element).closest('[data-canvas-control]')) return;
        setTransitioning(false);
        event.preventDefault();

        const stagePoint = stagePointOf(event, containerRef.current);

        if (ctrlKey || metaKey || pinching) {
          const factor = Math.exp(-dy * 0.01);

          setViewport((current) =>
            Math.abs(factor - 1) < MIN_ZOOM_STEP
              ? current
              : zoomByFactor(current, factor, stagePoint),
          );
          return;
        }

        setViewport((current) => panViewport(current, -dx, -dy));
      },
    },
    { target: containerRef, eventOptions: { passive: false } },
  );

  const highlight = useMemo<HighlightResult>(
    () =>
      computeHighlight({
        graph,
        layout,
        activeNodeId: hoveredNodeId,
        activeEdgeId: hoveredEdgeId,
        activeContextId: hoveredContextId,
      }),
    [graph, layout, hoveredNodeId, hoveredEdgeId, hoveredContextId],
  );

  const selectedHighlight = useMemo<HighlightResult>(() => {
    if (highlight.dimmed || selection.nodeId === null) {
      return highlight;
    }

    return computeHighlight({ graph, layout, activeNodeId: selection.nodeId });
  }, [graph, layout, highlight, selection.nodeId]);

  const marqueeRect = useMemo<Rect | null>(
    () =>
      drag === null || drag.mode !== 'marquee'
        ? null
        : marqueeSelectionOf(drag, viewport),
    [drag, viewport],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('[data-canvas-control]')) return;
    setTransitioning(false);
    const stagePoint = stagePointOf(event, containerRef.current);

    if (event.button === 1 || spacePressed.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ mode: 'pan', last: stagePoint });
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest('[data-node-id]') !== null) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ mode: 'marquee', start: stagePoint, current: stagePoint });
    setMarqueeSelection([]);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null) {
      return;
    }

    const stagePoint = stagePointOf(event, containerRef.current);

    if (drag.mode === 'pan') {
      setViewport((current) =>
        panViewport(
          current,
          stagePoint.x - drag.last.x,
          stagePoint.y - drag.last.y,
        ),
      );
      setDrag({ mode: 'pan', last: stagePoint });
      return;
    }

    const current = { ...drag, current: stagePoint };

    setDrag(current);

    const rect = marqueeSelectionOf(current, viewport);

    setMarqueeSelection(
      selectNodesInBox(layout, rect, { minimumSize: 2 }).filter(
        (id) => scope === null || scope.nodeIds.has(id),
      ),
    );
  };

  const onPointerUp = () => {
    if (drag?.mode === 'marquee' && marqueeSelection.length > 0) {
      onSelect(marqueeSelection[0]!);
    }

    setDrag(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 overflow-hidden bg-[#fbfbfc]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onClick={(event) => {
        const target = event.target as HTMLElement;

        if (
          target.closest('[data-node-id]') === null &&
          target.closest('[data-canvas-control]') === null &&
          target.closest('button') === null &&
          drag === null
        ) {
          onClearSelection();
        }
      }}
      data-region="canvas-viewport"
    >
      <div className="absolute top-0 left-0 z-20 h-[24px] w-[24px] border-r border-b border-evidence-line bg-[#f3f4f6]" />
      <div className="absolute top-0 left-[24px] right-0 z-20 h-[24px] border-b border-evidence-line bg-[#fafbfc]">
        <RulerTicks
          axis="x"
          size={Math.max(0, size.width - RULER_THICKNESS)}
          viewport={viewport}
        />
      </div>
      <div className="absolute top-[24px] left-0 z-20 w-[24px] bottom-0 border-r border-evidence-line bg-[#fafbfc]">
        <RulerTicks
          axis="y"
          size={Math.max(0, size.height - RULER_THICKNESS)}
          viewport={viewport}
        />
      </div>

      <div
        className="absolute top-[24px] left-[24px] overflow-hidden"
        style={{
          right: 0,
          bottom: 0,
          cursor: drag?.mode === 'pan' ? 'grabbing' : 'default',
        }}
      >
        <div
          data-region="canvas-world"
          className="absolute origin-top-left"
          style={{
            transition: transitioning ? 'transform 180ms ease-out' : undefined,
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          }}
        >
          <CanvasStage
            layout={layout}
            document={document}
            viewMode={viewMode}
            selection={selection}
            hoveredEdgeId={hoveredEdgeId}
            hoveredContextId={hoveredContextId}
            highlightedNodeIds={mergeSelection(
              selectedHighlight.nodeIds,
              marqueeSelection,
            )}
            highlightedEdgeIds={selectedHighlight.edgeIds}
            highlightedContextIds={selectedHighlight.contextIds}
            dimmed={selectedHighlight.dimmed}
            marquee={marqueeRect}
            overlay={overlay}
            scope={scope}
            onHoverNode={setHoveredNodeId}
            onHoverEdge={setHoveredEdgeId}
            onHoverContext={setHoveredContextId}
            onSelect={onSelect}
          />
        </div>
      </div>

      {onScopeChange ? (
        <ScopeFilterControl
          contextGroups={layout.contextGroups}
          selectedScope={scopeId}
          onScopeChange={onScopeChange}
        />
      ) : null}
      <BusinessLegend compact={size.width < 800} />
      <ZoomControl
        zoom={viewport.zoom}
        onFit={fitToContent}
        onActual={() =>
          setViewport((current) =>
            zoomAtPoint(current, 1, {
              x: (size.width - RULER_THICKNESS) / 2,
              y: (size.height - RULER_THICKNESS) / 2,
            }),
          )
        }
      />
    </div>
  );
};

const mergeSelection = (
  nodeIds: ReadonlySet<string>,
  extra: readonly string[],
): ReadonlySet<string> =>
  extra.length === 0 ? nodeIds : new Set([...nodeIds, ...extra]);

const stagePointOf = (
  event: { clientX: number; clientY: number },
  container: HTMLDivElement | null,
): Point => {
  const rect = container?.getBoundingClientRect();

  return {
    x: event.clientX - (rect?.left ?? 0) - RULER_THICKNESS,
    y: event.clientY - (rect?.top ?? 0) - RULER_THICKNESS,
  };
};

const marqueeSelectionOf = (
  drag: Extract<DragState, { mode: 'marquee' }>,
  viewport: ViewportState,
): Rect => {
  const toWorld = (point: Point): Point => ({
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  });
  const start = toWorld(drag.start);
  const end = toWorld(drag.current);

  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

const ZoomControl = ({
  zoom,
  onFit,
  onActual,
}: {
  zoom: number;
  onFit: () => void;
  onActual: () => void;
}) => (
  <div
    data-canvas-control=""
    data-evidence-capture-hide=""
    className="absolute right-4 bottom-4 z-30 flex items-center gap-1 rounded-md border border-evidence-line bg-white/95 px-2 py-1 text-[11px] text-evidence-muted shadow-sm"
  >
    <span className="w-12 tabular-nums text-center">
      {Math.round(zoom * 100)}%
    </span>
    <button
      type="button"
      className="rounded px-1.5 py-0.5 hover:bg-[#eef1f5]"
      onClick={onFit}
    >
      适合宽度
    </button>
    <button
      type="button"
      className="rounded px-1.5 py-0.5 hover:bg-[#eef1f5]"
      onClick={onActual}
    >
      原始大小
    </button>
  </div>
);
