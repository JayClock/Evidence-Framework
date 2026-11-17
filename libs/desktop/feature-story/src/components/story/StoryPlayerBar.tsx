import { RELATIONSHIP_FLOW_LABELS } from '@evidence-poc/evidence-schema';
import type { StoryPlaybackController } from '../../state/useStoryPlayback';

export interface StoryPlayerBarProps {
  playback: StoryPlaybackController;
  onExit: () => void;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}

const buttonClass =
  'rounded border border-evidence-line bg-white px-2 py-1 text-[11px] text-evidence-ink hover:bg-evidence-hover disabled:cursor-not-allowed disabled:opacity-40';

/** A controller for declared examples, with explicitly local CEL rehearsal. */
export const StoryPlayerBar = ({
  playback,
  onExit,
  aiConfigured = true,
  onConfigureAi,
}: StoryPlayerBarProps) => (
  <div
    role="toolbar"
    aria-label="业务流放映控制"
    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[11px]"
  >
    <label className="flex items-center gap-1">
      <span className="sr-only">选择业务流</span>
      <select
        aria-label="选择业务流"
        value={playback.activeFlowId ?? ''}
        disabled={playback.flows.length === 0}
        onChange={(event) => playback.selectFlow(event.target.value)}
        className="max-w-48 rounded border border-evidence-line bg-white px-2 py-1"
      >
        {playback.flows.length === 0 ? (
          <option value="">暂无业务流</option>
        ) : (
          playback.flows.map((flow) => (
            <option key={flow.flowId} value={flow.flowId}>
              {flow.flowTitle}
            </option>
          ))
        )}
      </select>
    </label>
    <button
      type="button"
      className={buttonClass}
      disabled={!playback.canPrevious}
      onClick={playback.previous}
    >
      ◀ 上一步
    </button>
    <span
      className="min-w-0 text-evidence-muted"
      aria-live="polite"
      aria-atomic="true"
    >
      {playback.loading
        ? '正在更新剧情…'
        : `步骤 ${playback.stepNumber}/${playback.stepCount}${playback.scene ? `：${playback.scene.phaseTitle}` : ''}`}
    </span>
    {playback.journeyPreview ? (
      <span
        aria-label="当前旅程分支"
        data-journey-flow={playback.journeyPreview.flowKind}
        className="rounded border px-2 py-1"
        style={{
          color:
            playback.journeyPreview.flowKind === 'escalation'
              ? '#7e22ce'
              : playback.journeyPreview.flowKind === 'breach_compensation'
                ? '#b42318'
                : '#21835b',
        }}
        title="仅对当前场景已展示的样例事实做本地 CEL 预演；不是 HTTP 验收。"
      >
        {RELATIONSHIP_FLOW_LABELS[playback.journeyPreview.flowKind]} · 本地预演
      </span>
    ) : null}
    {playback.journeyPreview?.triggeredRuleIds.map((id) => (
      <span
        key={id}
        role="status"
        data-triggered-rule={id}
        className="max-w-72 truncate rounded bg-[#fff1f0] px-2 py-1 text-[#b42318]"
        title={id}
      >
        ⚠{' '}
        {playback.journeyPreview?.rules.find((r) => r.id === id)?.label ?? id}
      </span>
    ))}
    {playback.journeyPreview?.rules
      .filter((r) => r.error)
      .map((r) => (
        <span
          key={r.id}
          role="status"
          className="text-[#8d6200]"
          title={r.error}
        >
          规则预演未知：{r.label}
        </span>
      ))}
    <button
      type="button"
      className={buttonClass}
      disabled={!playback.canNext}
      onClick={playback.next}
    >
      下一步 ▶
    </button>
    <button
      type="button"
      className={buttonClass}
      disabled={!playback.ready || playback.stepCount < 2}
      aria-pressed={playback.isPlaying}
      onClick={playback.togglePlaying}
    >
      {playback.isPlaying ? '暂停放映' : '自动播放'}
    </button>
    <label
      className="flex items-center gap-1 text-evidence-muted"
      title="不调用 AI，只展示模型已声明的业务事实"
    >
      <input
        type="checkbox"
        checked={playback.skipAi}
        onChange={(event) => {
          if (!event.target.checked && !aiConfigured) {
            onConfigureAi?.();
            return;
          }
          playback.setSkipAi(event.target.checked);
        }}
      />
      仅模型事实
    </label>
    <button type="button" className={buttonClass} onClick={onExit}>
      退出放映
    </button>
  </div>
);
