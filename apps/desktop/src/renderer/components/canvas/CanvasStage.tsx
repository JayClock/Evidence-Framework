import { useMemo } from 'react';
import type {
  ContextScope,
  DomainGraphLayout,
  LayoutEdge,
  LayoutNode,
  LifecycleSwimlaneLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import type { ModelSelection } from '@evidence-poc/evidence-model-core/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { DiagnosticMarkers } from './DiagnosticMarkers';
import {
  diagnosticColor,
  type DiagnosticIndex,
} from '../../state/diagnosticIndex';
import type { SensorIssue } from '@evidence-poc/evidence-modeling-orchestrator/browser';
import { EDGE_STYLES } from './colors';
import { pointOnRoute } from './edgeLabels';
import { LifecycleBanner } from './LifecycleBanner';
import { NodeCard } from './NodeCard';

import { summarizeCards } from './cardSummary';
export type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';
import type { CanvasViewMode } from '@evidence-poc/evidence-canvas-interaction';

/** How a change relates to the object the active model draws. */
export type OverlayChange = 'added' | 'removed' | 'modified';

/**
 * Marks the objects a pending agent patch touches.
 *
 * Rings only recolour objects the model already draws, so the picture stays the
 * model the user is editing rather than a proposal that has not been accepted.
 */
export interface ModelOverlay {
  marks: ReadonlyMap<string, OverlayChange>;
}

interface CanvasStageProps {
  layout: DomainGraphLayout;
  document: DomainModelDocument;
  viewMode: CanvasViewMode;
  selection: ModelSelection;
  hoveredEdgeId: string | null;
  hoveredContextId: string | null;
  highlightedNodeIds: ReadonlySet<string>;
  highlightedEdgeIds: ReadonlySet<string>;
  highlightedContextIds: ReadonlySet<string>;
  dimmed: boolean;
  marquee: { x: number; y: number; width: number; height: number } | null;
  overlay?: ModelOverlay | null;
  diagnostics?: DiagnosticIndex;
  onOpenIssues?: (issues: readonly SensorIssue[]) => void;
  scope?: ContextScope | null;
  onHoverNode: (nodeId: string | null) => void;
  onHoverEdge: (edgeId: string | null) => void;
  onHoverContext: (contextId: string | null) => void;
  onSelect: (nodeId: string) => void;
}

const EDGE_COLOR = EDGE_STYLES.stroke;
const EDGE_HIGHLIGHT = EDGE_STYLES.highlighted;

/** Lane data only exists on a lifecycle layout, but the stage accepts either. */
const isLifecycleLayout = (
  layout: DomainGraphLayout,
): layout is LifecycleSwimlaneLayout => 'swimlanes' in layout;

export const CanvasStage = ({
  layout,
  document,
  viewMode,
  selection,
  hoveredEdgeId,
  hoveredContextId,
  highlightedNodeIds,
  highlightedEdgeIds,
  highlightedContextIds,
  dimmed,
  marquee,
  overlay = null,
  diagnostics,
  onOpenIssues,
  scope = null,
  onHoverNode,
  onHoverEdge,
  onHoverContext,
  onSelect,
}: CanvasStageProps) => {
  const summaries = useMemo(() => summarizeCards(document), [document]);
  const width = Math.max(1, layout.bounds.width);
  const height = Math.max(1, layout.bounds.height);
  const swimlanes = isLifecycleLayout(layout) ? layout : null;
  const relationshipById = new Map(
    document.relationships.map(
      (relationship) => [relationship.id, relationship] as const,
    ),
  );
  return (
    <div
      className="relative"
      style={{ width, height }}
      data-region="canvas-stage"
    >
      {swimlanes === null ? null : <LifecycleBanner layout={swimlanes} />}

      {layout.contextGroups.map((group) => {
        const active = highlightedContextIds.has(group.contextId);
        const outOfScope =
          scope !== null && !scope.contextIds.has(group.contextId);
        const faded = dimmed && !active;

        return (
          <div
            key={group.contextId}
            role="group"
            aria-label={group.entity.label}
            data-context-id={group.contextId}
            className={[
              'absolute rounded-lg border border-dashed transition-opacity duration-150',
              hoveredContextId === group.contextId
                ? 'border-evidence-accent'
                : '',
              faded ? 'opacity-30' : 'opacity-100',
            ].join(' ')}
            style={{
              opacity: outOfScope ? 0.15 : undefined,
              pointerEvents: outOfScope ? 'none' : undefined,
              left: group.box.x,
              top: group.box.y,
              width: group.box.width,
              height: group.box.height,
              backgroundColor:
                group.entity.kind === 'contract'
                  ? 'rgba(255, 250, 240, 0.55)'
                  : group.entity.kind === 'domain'
                    ? 'rgba(240, 247, 242, 0.55)'
                    : 'rgba(246, 247, 250, 0.6)',
              borderColor:
                hoveredContextId === group.contextId
                  ? '#2f5d8f'
                  : 'rgba(120, 128, 140, 0.45)',
            }}
            onMouseEnter={() => !outOfScope && onHoverContext(group.contextId)}
            onMouseLeave={() => !outOfScope && onHoverContext(null)}
            onFocus={() => !outOfScope && onHoverContext(group.contextId)}
            onBlur={() => !outOfScope && onHoverContext(null)}
            tabIndex={-1}
          >
            <span className="absolute top-3 left-4 text-[11px] font-medium tracking-wide text-[#4b5563]">
              {group.entity.label}
            </span>
          </div>
        );
      })}

      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={width}
        height={height}
        aria-hidden="true"
      >
        <defs>
          <marker
            id="evidence-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
          </marker>
        </defs>

        {layout.fulfillmentGroups.map((group) => (
          <rect
            key={group.groupId}
            x={group.box.x}
            y={group.box.y}
            width={group.box.width}
            height={group.box.height}
            opacity={
              scope !== null && !scope.nodeIds.has(group.requestId) ? 0.15 : 1
            }
            rx={10}
            fill="none"
            stroke="rgba(180, 54, 86, 0.35)"
            strokeWidth={1}
            strokeDasharray="6 4"
          />
        ))}

        {layout.fulfillmentGroups.map((group) => (
          <FulfillmentPairLinks
            key={`pair-${group.groupId}`}
            layout={layout}
            scope={scope}
            requestId={group.requestId}
            resultIds={[...group.confirmationIds, ...group.proofIds]}
          />
        ))}

        {layout.edges.map((edge) => {
          const active = highlightedEdgeIds.has(edge.relationshipId);
          const outOfScope =
            scope !== null && !scope.edgeIds.has(edge.relationshipId);
          const faded = dimmed && !active;
          const relationship = relationshipById.get(edge.relationshipId);
          const midpoint = pointOnRoute(edge.points, 0.5);
          const points = edge.points
            .map((point) => `${point.x},${point.y}`)
            .join(' ');

          return (
            <g
              key={edge.relationshipId}
              data-edge-id={edge.relationshipId}
              opacity={outOfScope ? 0.15 : faded ? 0.16 : 1}
              style={{ pointerEvents: outOfScope ? 'none' : 'stroke' }}
              onMouseEnter={() =>
                !outOfScope && onHoverEdge(edge.relationshipId)
              }
              onMouseLeave={() => !outOfScope && onHoverEdge(null)}
            >
              {diagnostics?.has(edge.relationshipId) ? (
                <polyline
                  points={points}
                  fill="none"
                  stroke={diagnosticColor(
                    diagnostics.get(edge.relationshipId)!.severity,
                  )}
                  strokeWidth={6}
                  opacity={0.35}
                  data-edge-diagnostic={edge.relationshipId}
                />
              ) : null}
              <polyline
                points={points}
                fill="none"
                stroke={active ? EDGE_HIGHLIGHT : EDGE_COLOR}
                strokeWidth={
                  active ? EDGE_STYLES.activeWidth : EDGE_STYLES.width
                }
                strokeDasharray={edge.dashed ? EDGE_STYLES.dashed : undefined}
                markerEnd={
                  edge.kind === 'plays_role'
                    ? 'url(#evidence-arrow)'
                    : undefined
                }
              />
              {(viewMode === 'standard' ||
                active ||
                hoveredEdgeId === edge.relationshipId) &&
              relationship !== undefined ? (
                <EdgeCardinality
                  edge={edge}
                  source={relationship.sourceCardinality}
                  target={relationship.targetCardinality}
                />
              ) : null}
              {hoveredEdgeId === edge.relationshipId && relationship ? (
                <text
                  x={midpoint.x}
                  y={midpoint.y - 14}
                  fontSize={9}
                  textAnchor="middle"
                  fill="#2f5d8f"
                >
                  {relationship.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {marquee !== null ? (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.width}
            height={marquee.height}
            fill="rgba(47, 93, 143, 0.08)"
            stroke="#2f5d8f"
            strokeDasharray="4 3"
          />
        ) : null}
      </svg>

      {layout.nodes.map((node) => (
        <NodeCard
          key={node.nodeId}
          node={node}
          viewMode={viewMode}
          summary={summaries.get(node.nodeId)!}
          outOfScope={scope !== null && !scope.nodeIds.has(node.nodeId)}
          selected={selection.nodeId === node.nodeId}
          highlighted={highlightedNodeIds.has(node.nodeId)}
          dimmed={dimmed && !highlightedNodeIds.has(node.nodeId)}
          onHover={onHoverNode}
          onSelect={onSelect}
        />
      ))}

      {diagnostics && onOpenIssues ? (
        <DiagnosticMarkers
          index={diagnostics}
          layout={layout}
          scope={scope}
          onOpen={onOpenIssues}
        />
      ) : null}
      {overlay === null
        ? null
        : [...overlay.marks.entries()].map(([nodeId, change]) => {
            const node = layout.nodes.find(
              (candidate) => candidate.nodeId === nodeId,
            );

            return node === undefined ? null : (
              <ChangeRing key={`mark-${nodeId}`} node={node} change={change} />
            );
          })}
    </div>
  );
};

const PAIR_LINK_COLOR = 'rgba(180, 54, 86, 0.55)';

/**
 * Connects a request's window to each result that answers it.
 *
 * A Fulfillment pair is a claim about delivery, not a modeled relationship, so
 * without these links a board could show a request and a confirmation next to
 * each other with no statement that one discharges the other. The links are
 * drawn from the request's right edge to each result's left edge and never
 * replace a `references` route: when a model also relates the two, the pair link
 * says "same obligation" while the relationship says "this document cites that
 * one".
 */
function FulfillmentPairLinks({
  layout,
  scope,
  requestId,
  resultIds,
}: {
  layout: DomainGraphLayout;
  scope: ContextScope | null;
  requestId: string;
  resultIds: readonly string[];
}) {
  const request = layout.nodeById.get(requestId);

  if (request === undefined) {
    return null;
  }

  const origin = {
    x: request.box.x + request.box.width,
    y: request.box.y + request.box.height / 2,
  };

  return (
    <>
      {resultIds.map((resultId) => {
        const result = layout.nodeById.get(resultId);

        if (result === undefined) {
          return null;
        }

        const target = {
          x: result.box.x,
          y: result.box.y + result.box.height / 2,
        };
        const midX = (origin.x + target.x) / 2;

        return (
          <polyline
            key={`pair-link-${resultId}`}
            data-pair-link={resultId}
            opacity={
              scope !== null &&
              (!scope.nodeIds.has(requestId) || !scope.nodeIds.has(resultId))
                ? 0.15
                : 1
            }
            points={[
              `${origin.x},${origin.y}`,
              `${midX},${origin.y}`,
              `${midX},${target.y}`,
              `${target.x},${target.y}`,
            ].join(' ')}
            fill="none"
            stroke={PAIR_LINK_COLOR}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        );
      })}
    </>
  );
}

const OVERLAY_COLOR: Record<OverlayChange, string> = {
  added: '#15803d',
  removed: '#b42318',
  modified: '#8d6200',
};

const OVERLAY_LABEL: Record<OverlayChange, string> = {
  added: '本次补丁新增',
  removed: '本次补丁删除',
  modified: '本次补丁修改',
};

/** A ring around an object the pending patch added, removed or changed. */
function ChangeRing({
  node,
  change,
}: {
  node: LayoutNode;
  change: OverlayChange;
}) {
  return (
    <div
      aria-label={`${OVERLAY_LABEL[change]} ${node.entity.label}`}
      data-overlay-change={change}
      data-overlay-node-id={node.nodeId}
      className="pointer-events-none absolute rounded-md border-2"
      style={{
        left: node.box.x - 3,
        top: node.box.y - 3,
        width: node.box.width + 6,
        height: node.box.height + 6,
        borderColor: OVERLAY_COLOR[change],
        borderStyle:
          change === 'removed' || change === 'added' ? 'dashed' : 'solid',
      }}
    />
  );
}

function EdgeCardinality({
  edge,
  source,
  target,
}: {
  edge: LayoutEdge;
  source?: { min: number; max: number | 'many' };
  target?: { min: number; max: number | 'many' };
}) {
  const format = (value?: { min: number; max: number | 'many' }) =>
    value === undefined
      ? null
      : `${value.min}..${value.max === 'many' ? 'N' : value.max}`;
  const sourceText = format(source);
  const targetText = format(target);

  if (sourceText === null && targetText === null) {
    return null;
  }

  return (
    <>
      {[
        { end: 'source', label: '源端基数', text: sourceText, fraction: 0.25 },
        {
          end: 'target',
          label: '目标端基数',
          text: targetText,
          fraction: 0.75,
        },
      ].map(({ end, label, text, fraction }) => {
        if (text === null) return null;
        const point = pointOnRoute(edge.points, fraction);
        const width = Math.max(30, text.length * 6 + 10);
        return (
          <g
            key={end}
            data-cardinality-end={end}
            transform={`translate(${point.x}, ${point.y})`}
          >
            <title>
              {label}：{text}
            </title>
            <rect
              x={-width / 2}
              y={-8}
              width={width}
              height={16}
              rx={3}
              fill="white"
              fillOpacity={0.95}
              stroke="#d0d5dd"
              strokeWidth={0.8}
            />
            <text
              y={3}
              fontSize={9}
              fontFamily="monospace"
              textAnchor="middle"
              fill="#475467"
            >
              {text}
            </text>
          </g>
        );
      })}
    </>
  );
}
