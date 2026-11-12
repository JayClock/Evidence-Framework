import type {
  DomainGraphLayout,
  LayoutEdge,
  LayoutNode,
  LifecycleSwimlaneLayout,
} from '@evidence-poc/evidence-canvas-interaction';
import type { ModelSelection } from '@evidence-poc/evidence-model-core/browser';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { LifecycleBanner } from './LifecycleBanner';
import { NodeCard } from './NodeCard';

export type CanvasViewMode = 'simplified' | 'standard';

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
  onHoverNode: (nodeId: string | null) => void;
  onHoverEdge: (edgeId: string | null) => void;
  onHoverContext: (contextId: string | null) => void;
  onSelect: (nodeId: string) => void;
}

const EDGE_COLOR = '#98a2b3';
const EDGE_HIGHLIGHT = '#2f5d8f';

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
  onHoverNode,
  onHoverEdge,
  onHoverContext,
  onSelect,
}: CanvasStageProps) => {
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
            onMouseEnter={() => onHoverContext(group.contextId)}
            onMouseLeave={() => onHoverContext(null)}
            onFocus={() => onHoverContext(group.contextId)}
            onBlur={() => onHoverContext(null)}
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
            <path d="M 0 0 L 8 4 L 0 8 z" fill={EDGE_COLOR} />
          </marker>
        </defs>

        {layout.fulfillmentGroups.map((group) => (
          <rect
            key={group.groupId}
            x={group.box.x}
            y={group.box.y}
            width={group.box.width}
            height={group.box.height}
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
            requestId={group.requestId}
            resultIds={[...group.confirmationIds, ...group.proofIds]}
          />
        ))}

        {layout.edges.map((edge) => {
          const active = highlightedEdgeIds.has(edge.relationshipId);
          const faded = dimmed && !active;
          const relationship = relationshipById.get(edge.relationshipId);
          const points = edge.points
            .map((point) => `${point.x},${point.y}`)
            .join(' ');

          return (
            <g
              key={edge.relationshipId}
              data-edge-id={edge.relationshipId}
              opacity={faded ? 0.16 : 1}
              style={{ pointerEvents: 'stroke' }}
              onMouseEnter={() => onHoverEdge(edge.relationshipId)}
              onMouseLeave={() => onHoverEdge(null)}
            >
              <polyline
                points={points}
                fill="none"
                stroke={active ? EDGE_HIGHLIGHT : EDGE_COLOR}
                strokeWidth={active ? 2 : 1.2}
                strokeDasharray={edge.dashed ? '5 4' : undefined}
                markerEnd={edge.arrow ? 'url(#evidence-arrow)' : undefined}
              />
              {viewMode === 'standard' && relationship !== undefined ? (
                <EdgeCardinality
                  edge={edge}
                  source={relationship.sourceCardinality}
                  target={relationship.targetCardinality}
                />
              ) : null}
              {hoveredEdgeId === edge.relationshipId && relationship ? (
                <text
                  x={
                    (edge.points[0]!.x +
                      edge.points[edge.points.length - 1]!.x) /
                    2
                  }
                  y={
                    (edge.points[0]!.y +
                      edge.points[edge.points.length - 1]!.y) /
                      2 -
                    6
                  }
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
          selected={selection.nodeId === node.nodeId}
          highlighted={highlightedNodeIds.has(node.nodeId)}
          dimmed={dimmed && !highlightedNodeIds.has(node.nodeId)}
          onHover={onHoverNode}
          onSelect={onSelect}
        />
      ))}

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
  requestId,
  resultIds,
}: {
  layout: DomainGraphLayout;
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
            markerEnd="url(#evidence-arrow)"
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

  const first = edge.points[0]!;
  const last = edge.points[edge.points.length - 1]!;

  return (
    <>
      {sourceText !== null ? (
        <text x={first.x + 6} y={first.y - 5} fontSize={8} fill="#8a929e">
          {sourceText}
        </text>
      ) : null}
      {targetText !== null ? (
        <text
          x={last.x - 6}
          y={last.y - 5}
          fontSize={8}
          fill="#8a929e"
          textAnchor="end"
        >
          {targetText}
        </text>
      ) : null}
    </>
  );
}
