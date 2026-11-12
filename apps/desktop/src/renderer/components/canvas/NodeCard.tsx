import type { EntityAST } from '@evidence-poc/evidence-schema';
import type { LayoutNode } from '@evidence-poc/evidence-canvas-interaction';

import {
  TYPED_TIME_ATTRIBUTES,
  entityColor,
  entityKindLabel,
  entityRadius,
  entityShape,
  formatBusinessTimeWindow,
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

const timeAttributes = (entity: EntityAST): string[] =>
  TYPED_TIME_ATTRIBUTES.filter(
    (name) =>
      entity.attributes?.some((candidate) => candidate.name === name) === true,
  );

const businessTime = (entity: EntityAST): string | null => {
  const present = timeAttributes(entity);

  if (present.length === 0) {
    return null;
  }

  return formatBusinessTimeWindow(
    present,
    (name) =>
      entity.attributes?.find((attribute) => attribute.name === name)?.label,
  );
};

/**
 * The request's window, drawn as a bar with two ends.
 *
 * `started_at` and `expired_at` are both mandatory on a request, so the shape
 * says "this obligation is open over a period". A rounded bar rather than a
 * plain line, because the corner is where the "expired" end reads.
 */
const IntervalBar = ({ accent }: { accent: string }) => (
  <span
    aria-hidden="true"
    data-node-shape="interval"
    className="mt-0.5 flex h-[7px] w-full items-center"
  >
    <span
      className="h-[3px] flex-1 rounded-full"
      style={{ backgroundColor: `${accent}44` }}
    />
    <span
      className="h-[7px] w-[3px] shrink-0 rounded-full"
      style={{ backgroundColor: accent }}
    />
    <span
      className="h-[3px] flex-1 rounded-full"
      style={{ backgroundColor: `${accent}44` }}
    />
    <span
      className="h-[7px] w-[3px] shrink-0 rounded-full"
      style={{ backgroundColor: accent }}
    />
  </span>
);

/**
 * The confirmation's instant, drawn as a stamp.
 *
 * A confirmation has one end (`confirmed_at`); giving it the same bar as the
 * request would say the obligation is still open. The ring is the signature
 * metaphor the method uses: this moment already happened and cannot change.
 */
const MomentStamp = ({ accent }: { accent: string }) => (
  <span
    aria-hidden="true"
    data-node-shape="moment"
    className="mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[8px] font-semibold"
    style={{ borderColor: accent, color: accent }}
  >
    <span
      className="h-[5px] w-[5px] rounded-full"
      style={{ backgroundColor: accent }}
    />
    时刻
  </span>
);

/**
 * One placed business object, drawn as the paper the method talks about.
 *
 * The metaphor is a sticky note on a workshop board rather than a UML box: a
 * tinted sheet, a coloured spine naming the category, and a shape that tells a
 * request window from a confirmation stamp without reading the label.
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
  const shape = entityShape(entity);
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
      data-node-shape={shape}
      className={[
        'absolute flex cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden border px-3 text-center transition-[opacity,box-shadow] duration-150 outline-none',
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
        borderLeftWidth: 3,
        borderLeftColor: color,
        backgroundColor: `${color}0d`,
        boxShadow: selected
          ? undefined
          : '0 1px 2px rgba(16, 24, 40, 0.08), 0 1px 3px rgba(16, 24, 40, 0.06)',
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

      {shape === 'interval' ? <IntervalBar accent={color} /> : null}
      {shape === 'moment' ? <MomentStamp accent={color} /> : null}

      {time !== null ? (
        <span
          className="max-w-full overflow-hidden text-[9px] leading-tight text-ellipsis whitespace-nowrap text-evidence-muted"
          title={time}
        >
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
