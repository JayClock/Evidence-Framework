import { Handle, Position, type NodeProps } from '@xyflow/react';

import { useCanvasInteraction } from './CanvasInteractionContext';
import { NodeCard } from './NodeCard';
import type { ContextFlowNode, EntityFlowNode } from './useReactFlowAdapter';

/**
 * One business object as a React Flow node.
 *
 * The card is unchanged — it still draws its own paper, spine and badges — so
 * what the model reads is exactly what the hand-written stage drew. The wrapper
 * contributes the three things the engine needs: a measured box, the handles a
 * routed edge attaches to, and nothing else.
 *
 * The handles are invisible because the polyline is not derived from them: the
 * layout already routed the edge, and an anchor that snapped to a node side
 * would throw that geometry away.
 */
export const EntityNode = ({ data }: NodeProps<EntityFlowNode>) => {
  const { viewMode, onHoverNode, onSelect } = useCanvasInteraction();

  return (
    <div
      className="relative"
      style={{ width: data.node.box.width, height: data.node.box.height }}
    >
      <NodeCard
        node={data.node}
        viewMode={viewMode}
        summary={data.summary}
        selected={data.selected}
        highlighted={data.highlighted}
        dimmed={data.dimmed}
        outOfScope={data.outOfScope}
        onHover={onHoverNode}
        onSelect={onSelect}
      />
      <Handle
        id="source"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="pointer-events-none opacity-0"
      />
      <Handle
        id="target"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="pointer-events-none opacity-0"
      />
    </div>
  );
};

const CONTEXT_FILL = {
  contract: 'rgba(255, 250, 240, 0.55)',
  domain: 'rgba(240, 247, 242, 0.55)',
  support: 'rgba(246, 247, 250, 0.6)',
} as const;

/**
 * A Context boundary: the paper the notes are pinned to.
 *
 * It takes no pointer events of its own — a click on empty paper belongs to the
 * pane, which is what clears the selection. Hover arrives through the engine's
 * node events instead, keyed by id.
 */
export const ContextGroupNode = ({ data }: NodeProps<ContextFlowNode>) => (
  <div
    role="group"
    aria-label={data.label}
    data-context-id={data.contextId}
    className={[
      'h-full w-full rounded-lg border border-dashed transition-opacity duration-150',
      data.dimmed ? 'opacity-30' : 'opacity-100',
    ].join(' ')}
    style={{
      opacity: data.outOfScope ? 0.15 : undefined,
      pointerEvents: 'none',
      backgroundColor: CONTEXT_FILL[data.kind],
      borderColor: data.highlighted ? '#2f5d8f' : 'rgba(120, 128, 140, 0.45)',
    }}
  >
    <span className="absolute top-3 left-4 text-[11px] font-medium tracking-wide text-[#4b5563]">
      {data.label}
    </span>
  </div>
);
