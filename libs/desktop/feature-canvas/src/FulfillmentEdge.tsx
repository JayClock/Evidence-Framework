import type { EdgeProps } from '@xyflow/react';

import { useCanvasInteraction } from './CanvasInteractionContext';
import { CROSS_CONTEXT_EDGE_STYLES, EDGE_STYLES } from './colors';
import { pointOnRoute } from './edgeLabels';
import type {
  FulfillmentFlowEdge,
  PairLinkFlowEdge,
} from './useReactFlowAdapter';

const EDGE_COLOR = EDGE_STYLES.stroke;
const EDGE_HIGHLIGHT = EDGE_STYLES.highlighted;
const PAIR_LINK_COLOR = 'rgba(180, 54, 86, 0.55)';

const DIAGNOSTIC_COLOR = {
  block: '#b42318',
  warn: '#8d6200',
  info: '#2f5d8f',
} as const;

/**
 * One routed relationship.
 *
 * The polyline is the one the layout algorithm routed — orthogonal turns,
 * boundary styles and all — rather than a spline the engine invented between two
 * anchors. That is the whole division of labour: Evidence decides where a line
 * goes, React Flow decides how the viewport moves under it.
 */
export const FulfillmentEdge = ({ data }: EdgeProps<FulfillmentFlowEdge>) => {
  const { onHoverEdge } = useCanvasInteraction();

  if (data === undefined) return null;

  const {
    edge,
    label,
    cardinality,
    highlighted,
    hovered,
    dimmed,
    outOfScope,
    muted,
    diagnosticSeverity,
  } = data;

  const relationship = edge;
  const midpoint = pointOnRoute(relationship.points, 0.5);
  const points = relationship.points
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  const crossing =
    relationship.crossContextKind === null
      ? null
      : CROSS_CONTEXT_EDGE_STYLES[relationship.crossContextKind];
  const stroke = highlighted ? EDGE_HIGHLIGHT : (crossing?.stroke ?? EDGE_COLOR);
  const strokeWidth = highlighted
    ? EDGE_STYLES.activeWidth
    : (crossing?.width ?? EDGE_STYLES.width);
  const strokeDasharray =
    crossing === null
      ? relationship.dashed
        ? EDGE_STYLES.dashed
        : undefined
      : crossing.dasharray;

  const opacity = outOfScope ? 0.15 : muted ? 0 : dimmed ? 0.16 : 1;
  const interactive = !outOfScope && !muted;

  return (
    <g data-edge-id={relationship.relationshipId} opacity={opacity}>
      {diagnosticSeverity === null ? null : (
        <polyline
          points={points}
          fill="none"
          stroke={DIAGNOSTIC_COLOR[diagnosticSeverity]}
          strokeWidth={6}
          opacity={0.35}
          data-edge-diagnostic={relationship.relationshipId}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        style={{
          pointerEvents: interactive ? 'stroke' : 'none',
          strokeLinecap: 'round',
        }}
        data-edge-line={relationship.relationshipId}
        onMouseEnter={() => interactive && onHoverEdge(relationship.relationshipId)}
        onMouseLeave={() => interactive && onHoverEdge(null)}
      />
      <EndArrow
        points={relationship.points}
        color={stroke}
        visible={relationship.kind === 'plays_role'}
      />
      {relationship.crossContextKind === 'role_inversion' ? (
        <circle
          cx={midpoint.x}
          cy={midpoint.y}
          r={4}
          fill="#fff"
          stroke={crossing?.stroke ?? EDGE_COLOR}
          strokeWidth={1.6}
          data-edge-socket={relationship.relationshipId}
        />
      ) : null}
      {cardinality.source === undefined && cardinality.target === undefined
        ? null
        : [
            {
              end: 'source',
              text: formatCardinality(cardinality.source),
              fraction: 0.25,
            },
            {
              end: 'target',
              text: formatCardinality(cardinality.target),
              fraction: 0.75,
            },
          ].map(({ end, text, fraction }) =>
            text === null ? null : (
              <CardinalityChip
                key={end}
                end={end}
                text={text}
                point={pointOnRoute(relationship.points, fraction)}
              />
            ),
          )}
      {hovered ? (
        <text
          x={midpoint.x}
          y={midpoint.y - 14}
          fontSize={9}
          textAnchor="middle"
          fill="#2f5d8f"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
};

const formatCardinality = (
  value: { min: number; max: number | 'many' } | undefined,
): string | null =>
  value === undefined
    ? null
    : `${value.min}..${value.max === 'many' ? 'N' : value.max}`;

const CardinalityChip = ({
  end,
  text,
  point,
}: {
  end: string;
  text: string;
  point: { x: number; y: number };
}) => {
  const width = Math.max(30, text.length * 6 + 10);

  return (
    <g
      data-cardinality-end={end}
      transform={`translate(${point.x}, ${point.y})`}
      style={{ pointerEvents: 'none' }}
    >
      <title>{`${end === 'source' ? '源端基数' : '目标端基数'}：${text}`}</title>
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
};

/**
 * The dashed link from a request's window to the result that answers it.
 *
 * It is not a relationship and must not read like one: thinner, dashed, without
 * an arrowhead or cardinality, so the modeler never mistakes a delivery claim
 * for a modeled citation.
 */
export const PairLinkEdge = ({ data }: EdgeProps<PairLinkFlowEdge>) => {
  if (data === undefined) return null;

  return (
    <polyline
      points={data.points}
      data-pair-link=""
      fill="none"
      stroke={PAIR_LINK_COLOR}
      strokeWidth={1}
      strokeDasharray="3 3"
      opacity={data.outOfScope ? 0.15 : 1}
      style={{ pointerEvents: 'none' }}
    />
  );
};

/**
 * The direction of a role assignment, drawn at the line's last point.
 *
 * React Flow gives every edge its own `<svg>`, so the old shared `<defs>`
 * marker would be one more document-wide id to keep unique. Two points and an
 * angle are cheaper and survive a route that ends mid-turn.
 */
const EndArrow = ({
  points,
  color,
  visible,
}: {
  points: readonly { x: number; y: number }[];
  color: string;
  visible: boolean;
}) => {
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];

  if (!visible || tip === undefined || previous === undefined) return null;

  const angle =
    (Math.atan2(tip.y - previous.y, tip.x - previous.x) * 180) / Math.PI;

  return (
    <path
      d="M 0 0 L -8 4 L -8 -4 z"
      fill={color}
      transform={`translate(${tip.x}, ${tip.y}) rotate(${angle})`}
      style={{ pointerEvents: 'none' }}
      data-edge-arrow=""
    />
  );
};
