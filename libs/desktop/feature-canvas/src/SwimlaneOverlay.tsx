import type { SwimlaneRegion } from '@evidence-poc/evidence-canvas-interaction';

/** World-space paper beneath the cards, never an interactive model object. */
export const SwimlaneOverlay = ({
  regions,
}: {
  regions: readonly SwimlaneRegion[];
}) => (
  <div aria-label="权责泳道与业务阶段">
    {regions.map(({ id, label, kind, box }) => (
      <div
        key={id}
        data-swimlane-kind={kind}
        className={
          kind === 'phase'
            ? 'absolute border-b border-evidence-line bg-[#eef2f7] px-3 py-2 text-[12px] font-medium'
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
          className={kind === 'lane' ? 'inline-block max-w-32 break-words' : ''}
        >
          {label}
        </span>
      </div>
    ))}
  </div>
);
