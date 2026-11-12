import type { PatchReview } from '../../state/usePatchReview';

export interface PatchReviewBarProps {
  review: PatchReview;
  onAccept: () => void;
  onRevert: () => void;
}

const countLabel = (label: string, ids: readonly string[]): string | null =>
  ids.length === 0 ? null : `${label} ${ids.length}`;

/**
 * What the agent just changed, and the two ways to settle it.
 *
 * It sits above the dock instead of replacing it: the modeler can keep talking
 * about the same patch, and the bar answers with the one thing a chat transcript
 * cannot — a single keystroke that puts the model back.
 */
export const PatchReviewBar = ({
  review,
  onAccept,
  onRevert,
}: PatchReviewBarProps) => {
  const counts = [
    countLabel('新增', review.addedIds),
    countLabel('修改', review.modifiedIds),
    countLabel('删除', review.removedIds),
  ].filter((entry): entry is string => entry !== null);

  return (
    <section
      aria-label="AI 补丁复核"
      data-patch-review="pending"
      className="pointer-events-auto flex w-[560px] max-w-[calc(100%-48px)] flex-col gap-1.5 rounded-[10px] border border-evidence-accent/40 bg-white/95 px-3 py-2 shadow-[0_6px_24px_#00000014]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[11px] leading-relaxed text-evidence-ink">
          <span className="font-medium">AI 已写入模型：</span>
          <span className="text-[#414751]">{review.rationale}</span>
        </p>
        <span className="shrink-0 rounded bg-evidence-accent/10 px-1.5 py-0.5 text-[10px] text-evidence-accent">
          {counts.length === 0 ? '结构未变' : counts.join(' · ')}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10px] text-evidence-muted">
          {review.revertable
            ? '⌘/Ctrl + Enter 保留 · Esc 撤销这次补丁'
            : '模型之后又有改动，撤销已不可用；可在顶部按 ⌘Z 逐步回退'}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {review.revertable ? (
            <button
              type="button"
              onClick={onRevert}
              className="rounded border border-[#b42318]/40 px-2 py-1 text-[10px] text-[#b42318] hover:bg-[#b42318]/10"
            >
              撤销补丁
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAccept}
            className="rounded bg-evidence-accent px-2.5 py-1 text-[10px] text-white"
          >
            保留
          </button>
        </span>
      </div>
    </section>
  );
};
