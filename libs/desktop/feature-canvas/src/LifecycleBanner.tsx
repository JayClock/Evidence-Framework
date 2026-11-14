import type { LifecycleSwimlaneLayout } from '@evidence-poc/evidence-canvas-interaction';

/**
 * Lane tint per stage.
 *
 * The four columns have to be distinguishable at a glance without becoming the
 * subject of the picture: pre-contract stages are pale because nothing is
 * binding yet, the contract hinge is the only saturated band, and fulfillment
 * reads as paper.
 */
export const LANE_TINTS: Record<
  string,
  { background: string; border: string; accent: string }
> = {
  rfp: {
    background: 'rgba(244, 243, 255, 0.55)',
    border: 'rgba(120, 110, 190, 0.28)',
    accent: '#6d5fd0',
  },
  proposal: {
    background: 'rgba(243, 247, 255, 0.6)',
    border: 'rgba(96, 124, 190, 0.28)',
    accent: '#4a6fa8',
  },
  contract: {
    background: 'rgba(255, 250, 240, 0.75)',
    border: 'rgba(160, 130, 70, 0.32)',
    accent: '#8d6200',
  },
  fulfillment: {
    background: 'rgba(240, 249, 244, 0.6)',
    border: 'rgba(70, 130, 100, 0.28)',
    accent: '#3d7553',
  },
};

const FALLBACK_TINT = {
  background: 'rgba(246, 247, 250, 0.6)',
  border: 'rgba(120, 128, 140, 0.35)',
  accent: '#5b6472',
};

export const laneTint = (stage: string) => LANE_TINTS[stage] ?? FALLBACK_TINT;

/**
 * The four stage columns behind the model.
 *
 * The banner is the part of the board that says what the picture means: a
 * workshop reads the columns before it reads any single card. Heading each one
 * with the stage name, its English name and one line about what it holds keeps
 * the reading available even when every lane is empty.
 */
export const LifecycleBanner = ({
  layout,
}: {
  layout: LifecycleSwimlaneLayout;
}) => (
  <div data-region="lifecycle-banner">
    {layout.swimlanes.map((lane, index) => {
      const tint = laneTint(lane.stage);

      return (
        <div key={lane.stage} data-swimlane-stage={lane.stage}>
          <div
            aria-hidden="true"
            className="absolute rounded-lg border border-dashed"
            style={{
              left: lane.box.x,
              top: lane.box.y,
              width: lane.box.width,
              height: lane.box.height,
              backgroundColor: tint.background,
              borderColor: tint.border,
            }}
          />
          <div
            className="absolute flex flex-col justify-center gap-0.5 px-4"
            style={{
              left: lane.headerBox.x,
              top: lane.headerBox.y,
              width: lane.headerBox.width,
              height: lane.headerBox.height,
              borderBottom: `1px solid ${tint.border}`,
            }}
          >
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[9px] font-semibold tabular-nums"
                style={{ color: tint.accent }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className="text-[13px] font-semibold tracking-wide"
                style={{ color: tint.accent }}
              >
                {lane.label}
              </span>
              <span className="text-[9px] text-evidence-muted">
                {lane.englishLabel}
              </span>
            </div>
            <span className="text-[9px] leading-tight text-evidence-muted">
              {lane.caption}
            </span>
          </div>
        </div>
      );
    })}

    {layout.sharedBand === null ? null : (
      <div
        data-swimlane-shared-band="true"
        className="absolute rounded-lg border border-dashed border-[#d7dbe2] bg-[#fafbfc]/70 px-4 pt-2"
        style={{
          left: layout.sharedBand.x,
          top: layout.sharedBand.y,
          width: layout.sharedBand.width,
          height: layout.sharedBand.height,
        }}
      >
        <span className="text-[10px] font-medium tracking-wide text-[#6b7280]">
          参与方与标的物（不做生命周期归位）
        </span>
      </div>
    )}
  </div>
);
