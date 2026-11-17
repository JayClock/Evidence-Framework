import type { SwimlaneRegion } from '@evidence-poc/evidence-canvas-interaction';

/** World-space paper beneath the cards, never an interactive model object. */
export const SwimlaneOverlay = ({
  regions,
}: {
  regions: readonly SwimlaneRegion[];
}) => (
  <div aria-label="业务旅程、权责泳道与违约走廊">
    {[...regions]
      .sort(
        (a, b) => Number(a.kind !== 'corridor') - Number(b.kind !== 'corridor'),
      )
      .map(({ id, label, kind, box, stage, roleId, corridorKind }) => (
        <div
          key={id}
          data-swimlane-kind={kind}
          data-milestone-stage={stage}
          data-responsible-role={roleId}
          data-corridor-kind={corridorKind}
          className={
            kind === 'phase'
              ? 'absolute border-b border-evidence-line bg-[#eef2f7] px-3 py-2 text-[12px] font-medium'
              : kind === 'corridor'
                ? `absolute border-l-4 ${corridorKind === 'remedy_corridor' ? 'border-dashed border-[#d97706] bg-[#fff7ed]/30' : 'border-[#21835b] bg-[#f0fdf4]/20'}`
                : 'absolute border-y border-evidence-line bg-[#f2f6fb]/40 px-3 py-2 text-[11px] text-evidence-muted'
          }
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
          }}
        >
          <span
            className={
              kind === 'phase' ? '' : 'inline-block max-w-32 break-words'
            }
          >
            {label}
          </span>
        </div>
      ))}
  </div>
);
