import {
  calculateStageBoundaries,
  type JourneyMilestone,
  type SwimlaneRegion,
} from '@evidence-poc/evidence-canvas-interaction';
import {
  LIFECYCLE_STAGE_ENGLISH_LABELS,
  type LifecycleStage,
  type RelationshipFlowKind,
} from '@evidence-poc/evidence-schema';

export const LifecycleSwimlaneOverlay = ({
  width,
  height,
  milestones,
  regions,
  activeStage,
  activeFlowKind,
}: {
  width: number;
  height: number;
  milestones: readonly JourneyMilestone[];
  regions: readonly SwimlaneRegion[];
  activeStage?: LifecycleStage;
  activeFlowKind?: RelationshipFlowKind;
}) => (
  <div
    role="group"
    aria-label="业务全生命周期四阶段泳道"
    className="pointer-events-none absolute select-none"
    style={{ width, height }}
  >
    {[...regions]
      .sort((a, b) => Number(a.kind === 'lane') - Number(b.kind === 'lane'))
      .map(({ id, label, kind, box, roleId, corridorKind }) => (
        <div
          key={id}
          data-swimlane-kind={kind}
          data-responsible-role={roleId}
          data-corridor-kind={corridorKind}
          data-story-corridor={
            kind === 'corridor' &&
            corridorKind === 'remedy_corridor' &&
            activeFlowKind !== 'primary'
              ? activeFlowKind
              : undefined
          }
          className={
            kind === 'lane'
              ? 'absolute border-y border-evidence-line bg-workbench-subtle/40 px-3 py-2 text-[11px] text-evidence-muted'
              : corridorKind === 'remedy_corridor'
                ? 'absolute border-l-4 border-dashed border-amber-600 bg-amber-50/30 px-3 py-2 text-[11px] text-amber-900'
                : 'absolute border-l-4 border-emerald-700 bg-emerald-50/20'
          }
          style={{
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
          }}
        >
          {kind === 'lane' || corridorKind === 'remedy_corridor' ? (
            <span className="inline-block max-w-32 break-words">{label}</span>
          ) : null}
        </div>
      ))}
    {milestones.map(({ stage, label, x, width: columnWidth }) => (
      <div
        key={stage}
        data-milestone-stage={stage}
        data-story-milestone={stage === activeStage ? stage : undefined}
        className="absolute top-0 flex h-16 flex-col justify-center border-b border-evidence-line bg-workbench-subtle px-3 text-evidence-ink data-[story-milestone]:border-b-4 data-[story-milestone]:border-b-evidence-accent"
        style={{ left: x, width: columnWidth }}
      >
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[10px] text-evidence-muted">
          {LIFECYCLE_STAGE_ENGLISH_LABELS[stage]}
        </span>
      </div>
    ))}
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      className="absolute inset-0"
    >
      {calculateStageBoundaries(milestones, height).map(
        ({ stage, top, bottom }) => (
          <line
            key={stage}
            x1={top.x}
            y1={top.y}
            x2={bottom.x}
            y2={bottom.y}
            className="stroke-evidence-muted"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
        ),
      )}
    </svg>
    <div className="absolute inset-x-8 bottom-4 flex items-center gap-3 text-[11px] text-evidence-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-current" />
      <span>业务生命周期 →</span>
    </div>
  </div>
);
