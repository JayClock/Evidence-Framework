import type { EntityAST } from '@evidence-poc/evidence-schema';
import type { LayoutNode } from '@evidence-poc/evidence-canvas-interaction';

import {
  TYPED_TIME_ATTRIBUTES,
  entityColor,
  entityKindLabel,
  entityRadius,
} from './colors';

interface NodeCardProps {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  onHover: (nodeId: string | null) => void;
  onSelect: (nodeId: string) => void;
}

const responsibilityLabel = (entity: EntityAST): string | null => {
  if (entity.category !== 'evidence') {
    return null;
  }

  const responsible = entity.responsibleRoleRef;

  if (responsible === undefined) {
    return null;
  }

  return responsible.split('.').at(-1) ?? responsible;
};

const businessTime = (entity: EntityAST): string | null => {
  for (const name of TYPED_TIME_ATTRIBUTES) {
    const attribute = entity.attributes?.find(
      (candidate) => candidate.name === name,
    );

    if (attribute !== undefined) {
      return `${attribute.label}`;
    }
  }

  return null;
};

/**
 * One placed business object. Text is horizontally centred and the whole block
 * is vertically centred, matching the static review page contract.
 */
export const NodeCard = ({
  node,
  selected,
  dimmed,
  highlighted,
  onHover,
  onSelect,
}: NodeCardProps) => {
  const { entity, box } = node;
  const color = entityColor(entity);
  const badge = responsibilityLabel(entity);
  const time = businessTime(entity);
  const keyData = (entity.attributes ?? []).filter(
    (attribute) => attribute.keyData === true,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${entity.label}（${entityKindLabel(entity)}）`}
      data-node-id={entity.id}
      data-category={entity.category}
      className={[
        'absolute flex cursor-pointer flex-col items-center justify-center gap-0.5 border bg-white px-3 text-center transition-[opacity,box-shadow] duration-150 outline-none',
        selected ? 'ring-2 ring-evidence-accent ring-offset-1' : '',
        highlighted && !selected ? 'shadow-[0_0_0_2px_#2f5d8f55]' : '',
        dimmed ? 'opacity-20' : 'opacity-100',
      ].join(' ')}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        borderRadius: entityRadius(entity),
        borderColor: selected ? '#2f5d8f' : '#d7dbe2',
        borderStyle: entity.category === 'evidence' ? 'solid' : 'solid',
        borderLeft: `3px solid ${color}`,
      }}
      onMouseEnter={() => onHover(entity.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(entity.id)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(entity.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(entity.id);
        }
      }}
    >
      <span
        className="max-w-full overflow-hidden text-[11px] leading-tight font-medium text-ellipsis whitespace-nowrap text-evidence-ink"
        title={entity.label}
      >
        {entity.label}
      </span>
      <span className="text-[9px] leading-tight" style={{ color }}>
        {entityKindLabel(entity)}
      </span>
      {time !== null ? (
        <span className="text-[9px] leading-tight text-evidence-muted">
          {time}
        </span>
      ) : null}
      {keyData.length > 0 ? (
        <span className="text-[9px] leading-tight text-evidence-muted">
          关键数据 {keyData.length}
        </span>
      ) : null}

      {badge !== null ? (
        <span
          className="absolute -top-2 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full border px-1 text-[8px] font-semibold"
          style={{
            borderColor: color,
            color,
            backgroundColor: '#ffffff',
          }}
          aria-hidden="true"
        >
          {badge.slice(0, 2)}
        </span>
      ) : null}
    </div>
  );
};
