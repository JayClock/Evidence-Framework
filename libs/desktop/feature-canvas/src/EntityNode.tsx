import { Handle, Position, type NodeProps } from '@xyflow/react';

import { useCanvasInteraction } from './CanvasInteractionContext';
import { NodeCard } from './NodeCard';
import { EvidenceInquiryPopover } from './EvidenceInquiryPopover';
import type { ContextFlowNode, EntityFlowNode } from './useReactFlowAdapter';

export const EntityNode = ({ data }: NodeProps<EntityFlowNode>) => {
  const { viewMode, onHoverNode, onSelect, evidenceInquiry } =
    useCanvasInteraction();
  const { entity, box } = data.node;
  const inquiry =
    !data.outOfScope && entity.category === 'evidence'
      ? evidenceInquiry
      : undefined;
  const card = (
    <NodeCard
      node={data.node}
      viewMode={viewMode}
      summary={data.summary}
      storyValues={data.storyValues}
      storyStep={data.storyStep}
      triggeredRuleIds={data.triggeredRuleIds}
      selected={data.selected}
      highlighted={data.highlighted}
      dimmed={data.dimmed}
      outOfScope={data.outOfScope}
      hasInquiryActions={inquiry !== undefined}
      onHover={onHoverNode}
      onSelect={onSelect}
    />
  );

  return (
    <div className="relative" style={{ width: box.width, height: box.height }}>
      {inquiry ? (
        <EvidenceInquiryPopover
          nodeId={entity.id}
          label={entity.label}
          width={box.width}
          height={box.height}
          inquiry={inquiry}
        >
          {card}
        </EvidenceInquiryPopover>
      ) : (
        card
      )}
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
  pre_contract: 'rgba(243, 244, 255, 0.55)',
  domain: 'rgba(240, 247, 242, 0.55)',
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
