// The engine ships its structural styles beside its JavaScript; the layer must
// travel with the component, not with the app that happens to host it.
import '@xyflow/react/dist/style.css';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ViewportPortal,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';

import {
  MAX_ZOOM,
  MIN_ZOOM,
  computeHighlight,
  type CanvasViewMode,
  type ContextScope,
  type DomainGraphLayout,
  type HighlightResult,
  type LifecycleSwimlaneLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import type {
  DomainGraph,
  ModelSelection,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  CanvasInteractionProvider,
  type CanvasInteraction,
} from './CanvasInteractionContext';
import { BusinessLegend } from './BusinessLegend';
import { ContextGroupNode, EntityNode } from './EntityNode';
import { FulfillmentEdge, PairLinkEdge } from './FulfillmentEdge';
import { LifecycleBanner } from './LifecycleBanner';
import { ScopeFilterControl } from './ScopeFilterControl';
import { summarizeCards } from './cardSummary';
import { ChangeRing, type ModelOverlay } from './canvasOverlay';
import { DiagnosticMarkers } from './DiagnosticMarkers';
import type { DiagnosticIndex } from './diagnosticIndex';
import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';
import {
  boundsOf,
  convertLayoutToReactFlow,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from './useReactFlowAdapter';
export type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';

interface CanvasViewportProps {
  graph: DomainGraph;
  layout: DomainGraphLayout;
  document: DomainModelDocument;
  viewMode: CanvasViewMode;
  selection: ModelSelection;
  /** Incremented by the sidebar/search to reveal a node. */
  focusRequest: { nodeId: string; token: number } | null;
  /**
   * Keyboard view commands, one token per key press.
   *
   * `fit` and `reset` travel the same channel as `in`/`out` because the viewport
   * owns the zoom that the chord is about: the app presses one key and the
   * canvas decides what "100%" or "fit" means for the current stage size.
   */
  zoomCommand: { direction: ZoomDirection; token: number } | null;
  /**
   * Renders the floating tool island over the canvas.
   *
   * The island is the app's control surface, not the canvas's: it switches the
   * workspace between graph and ledger and speaks the app's view-mode chords, so
   * the viewport only hands it the zoom maths it owns.
   */
  hud?: (controls: CanvasHudControls) => ReactNode;
  /** Rings the objects a pending agent patch touches. */
  overlay?: ModelOverlay | null;
  diagnostics?: DiagnosticIndex;
  onOpenIssues?: (issues: readonly SensorIssue[]) => void;
  scope?: ContextScope | null;
  onScopeChange?: (contextId: string | null) => void;
  onSelect: (nodeId: string) => void;
  onClearSelection: () => void;
}

export type ZoomDirection = 'in' | 'out' | 'fit' | 'reset';

/** What the floating island needs from the viewport it floats over. */
export interface CanvasHudControls {
  zoom: number;
  zoomIn: () => void;
  zoomOut: () => void;
  /** 1:1 at the centre of the stage. */
  resetZoom: () => void;
  fitToContent: () => void;
}

const NODE_TYPES = {
  entityNode: EntityNode,
  contextGroup: ContextGroupNode,
} satisfies NodeTypes;

const EDGE_TYPES = {
  fulfillmentEdge: FulfillmentEdge,
  pairLink: PairLinkEdge,
} satisfies EdgeTypes;

/** Lane data only exists on a lifecycle layout, but the stage accepts either. */
const isLifecycleLayout = (
  layout: DomainGraphLayout,
): layout is LifecycleSwimlaneLayout => 'swimlanes' in layout;

const reducedMotion = (): boolean =>
  globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ===
  true;

/**
 * The canvas, delegated.
 *
 * `evidence-canvas-interaction` still decides everything a modeler would call
 * the drawing: which Contexts exist, where a card sits, how a route turns. This
 * component only owns the viewport — pan, zoom, fit, marquee and the floating
 * furniture — which is the part React Flow has spent years making feel right on
 * a trackpad.
 *
 * The world coordinates are unchanged between the two, which is what makes the
 * delegation cheap: a node's position is the box the layout placed, and an edge
 * is the polyline the router returned.
 */
export const CanvasViewport = (props: CanvasViewportProps) => (
  <ReactFlowProvider>
    <CanvasSurface {...props} />
  </ReactFlowProvider>
);

const CanvasSurface = ({
  graph,
  layout,
  document,
  viewMode,
  selection,
  focusRequest = null,
  zoomCommand = null,
  hud,
  overlay = null,
  diagnostics,
  onOpenIssues,
  scope = null,
  onScopeChange,
  onSelect,
  onClearSelection,
}: CanvasViewportProps) => {
  const { fitBounds, setCenter, zoomIn, zoomOut, zoomTo, getZoom } =
    useReactFlow<CanvasFlowNode, CanvasFlowEdge>();
  const { zoom } = useViewport();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredContextId, setHoveredContextId] = useState<string | null>(null);

  const summaries = useMemo(() => summarizeCards(document), [document]);

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

  const { nodes, edges } = useMemo(
    () =>
      convertLayoutToReactFlow({
        layout,
        document,
        selection,
        highlightedNodeIds: selectedHighlight.nodeIds,
        highlightedEdgeIds: selectedHighlight.edgeIds,
        highlightedContextIds: selectedHighlight.contextIds,
        dimmed: selectedHighlight.dimmed,
        scope,
        overlay,
        summaries,
        hoveredEdgeId,
        viewMode,
        ...(diagnostics === undefined ? {} : { diagnostics }),
      }),
    [
      layout,
      document,
      selection,
      selectedHighlight,
      scope,
      overlay,
      summaries,
      hoveredEdgeId,
      viewMode,
      diagnostics,
    ],
  );

  const fitToContent = useCallback(() => {
    void fitBounds(boundsOf(layout, scope), {
      padding: 0.08,
      duration: reducedMotion() ? 0 : 180,
    });
  }, [fitBounds, layout, scope]);

  // A scope change is a new stage: the fit follows it, and so do the hover
  // marks, because the object under the pointer may no longer be on screen.
  const previousFitKey = useRef(`${scope?.contextId ?? ''}:${viewMode}`);
  useEffect(() => {
    const key = `${scope?.contextId ?? ''}:${viewMode}`;
    if (previousFitKey.current === key) return;
    previousFitKey.current = key;
    fitToContent();
    setHoveredNodeId(null);
    setHoveredEdgeId(null);
    setHoveredContextId(null);
  }, [fitToContent, scope?.contextId, viewMode]);

  const lastZoomToken = useRef<number | null>(null);
  useEffect(() => {
    if (zoomCommand === null || lastZoomToken.current === zoomCommand.token) {
      return;
    }
    lastZoomToken.current = zoomCommand.token;
    const duration = reducedMotion() ? 0 : 140;

    if (zoomCommand.direction === 'fit') {
      fitToContent();
      return;
    }

    if (zoomCommand.direction === 'reset') {
      void zoomTo(1, { duration });
      return;
    }

    void (zoomCommand.direction === 'in'
      ? zoomIn({ duration })
      : zoomOut({ duration }));
  }, [zoomCommand, fitToContent, zoomIn, zoomOut, zoomTo]);

  const lastFocusToken = useRef<number | null>(null);
  useEffect(() => {
    if (
      focusRequest === null ||
      lastFocusToken.current === focusRequest.token
    ) {
      return;
    }

    const node = layout.nodeById.get(focusRequest.nodeId);
    const group = layout.contextGroups.find(
      (item) => item.contextId === focusRequest.nodeId,
    );
    const edge = layout.edges.find(
      (item) => item.relationshipId === focusRequest.nodeId,
    );
    const box = node?.box ?? group?.box;
    const point = box
      ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      : edge?.points[Math.floor(edge.points.length / 2)];

    if (point === undefined) return;
    if (edge !== undefined) setHoveredEdgeId(edge.relationshipId);
    if (group !== undefined) setHoveredContextId(group.contextId);

    lastFocusToken.current = focusRequest.token;
    void setCenter(point.x, point.y, {
      zoom: getZoom(),
      duration: reducedMotion() ? 0 : 250,
    });
  }, [focusRequest, layout, setCenter, getZoom]);

  const interaction = useMemo<CanvasInteraction>(
    () => ({
      viewMode,
      onHoverNode: setHoveredNodeId,
      onHoverContext: setHoveredContextId,
      onHoverEdge: setHoveredEdgeId,
      onSelect,
    }),
    [onSelect, viewMode],
  );

  const changeRings = useMemo(
    () =>
      overlay === null
        ? []
        : [...overlay.marks.entries()].flatMap(([nodeId, change]) => {
            const node = layout.nodeById.get(nodeId);

            return node === undefined
              ? []
              : [{ nodeId, change, node }];
          }),
    [layout.nodeById, overlay],
  );

  return (
    <div
      className="relative h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#fbfbfc]"
      data-region="canvas-viewport"
      data-canvas-mode={viewMode}
    >
      <CanvasInteractionProvider value={interaction}>
        <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          selectNodesOnDrag={false}
          elevateNodesOnSelect={false}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          panOnScroll
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          preventScrolling
          onPaneClick={onClearSelection}
          onNodeMouseEnter={(_, node) => {
            if (node.type === 'contextGroup') setHoveredContextId(node.id);
          }}
          onNodeMouseLeave={(_, node) => {
            if (node.type === 'contextGroup') setHoveredContextId(null);
          }}
          onSelectionChange={({ nodes: selected }) => {
            const first = selected.find(
              (candidate) => candidate.type === 'entityNode',
            );

            if (first !== undefined && first.id !== selection.nodeId) {
              onSelect(first.id);
            }
          }}
          aria-label="履约模型画布"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={18}
            size={1}
            color="#d5dae2"
          />

          {/*
            Everything the layout draws in world space but does not want a DOM
            node for: the fulfillment frame, the pair links, the swimlane banner
            and the measuring box the MCP capture uses. It sits at z-index 0 so
            notes always stay on top of their paper.
          */}
          <ViewportPortal>
            <div
              className="pointer-events-none absolute"
              style={{ zIndex: 0, left: 0, top: 0 }}
            >
              <div
                data-region="canvas-stage"
                className="pointer-events-none absolute"
                style={{
                  left: layout.bounds.x,
                  top: layout.bounds.y,
                  width: Math.max(1, layout.bounds.width),
                  height: Math.max(1, layout.bounds.height),
                }}
              />
              <svg
                className="pointer-events-none absolute overflow-visible"
                width={Math.max(1, layout.bounds.width)}
                height={Math.max(1, layout.bounds.height)}
                aria-hidden="true"
              >
                {layout.fulfillmentGroups.map((group) => (
                  <rect
                    key={group.groupId}
                    x={group.box.x}
                    y={group.box.y}
                    width={group.box.width}
                    height={group.box.height}
                    opacity={
                      scope !== null && !scope.nodeIds.has(group.requestId)
                        ? 0.15
                        : 1
                    }
                    rx={10}
                    fill="none"
                    stroke="rgba(180, 54, 86, 0.35)"
                    strokeWidth={1}
                    strokeDasharray="6 4"
                  />
                ))}
              </svg>
              {isLifecycleLayout(layout) ? (
                <LifecycleBanner layout={layout} />
              ) : null}
            </div>
          </ViewportPortal>

          {/* Diagnostics and patch rings take pointer events, so they sit above
              the notes they annotate. */}
          <ViewportPortal>
            <div
              className="absolute"
              style={{ zIndex: 3, left: 0, top: 0, pointerEvents: 'none' }}
            >
              {diagnostics !== undefined && onOpenIssues !== undefined ? (
                <DiagnosticMarkers
                  index={diagnostics}
                  layout={layout}
                  scope={scope}
                  onOpen={onOpenIssues}
                />
              ) : null}
              {changeRings.map(({ nodeId, change, node }) => (
                <ChangeRing key={`mark-${nodeId}`} node={node} change={change} />
              ))}
            </div>
          </ViewportPortal>
        </ReactFlow>
      </CanvasInteractionProvider>

      {onScopeChange ? (
        <ScopeFilterControl
          contextGroups={layout.contextGroups}
          selectedScope={scope?.contextId ?? null}
          onScopeChange={onScopeChange}
        />
      ) : null}

      <BusinessLegend viewMode={viewMode} />

      {hud === undefined ? null : (
        <div
          data-canvas-control=""
          data-evidence-capture-hide=""
          className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4"
        >
          {hud({
            zoom,
            zoomIn: () => void zoomIn({ duration: reducedMotion() ? 0 : 120 }),
            zoomOut: () => void zoomOut({ duration: reducedMotion() ? 0 : 120 }),
            resetZoom: () => void zoomTo(1, { duration: reducedMotion() ? 0 : 120 }),
            fitToContent,
          })}
        </div>
      )}
    </div>
  );
};
