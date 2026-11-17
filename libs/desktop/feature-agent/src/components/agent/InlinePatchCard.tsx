import { Check, RotateCcw, Sparkles } from 'lucide-react';

import type { PatchReview } from '../../state/usePatchReview';
import { cn } from '@evidence-poc/desktop-ui-kit';

export interface InlinePatchCardProps {
  review: PatchReview;
  onAccept: () => void;
  onRevert: () => void;
  /** Pans the canvas to an object the patch touched. */
  onFocusEntity?: (entityId: string) => void;
}

const Count = ({ label, count }: { label: string; count: number }) =>
  count === 0 ? null : (
    <span className="rounded bg-evidence-accent/10 px-1.5 py-0.5 text-[10px] text-evidence-accent">
      {label} {count}
    </span>
  );

/**
 * What the agent wrote, inside the conversation that asked for it.
 *
 * The old bar floated over the canvas and could only count changes. Here each
 * touched object is a control: clicking one puts the canvas on it, which is the
 * only way to check a patch without memorising ids from the transcript.
 */
export const InlinePatchCard = ({
  review,
  onAccept,
  onRevert,
  onFocusEntity,
}: InlinePatchCardProps) => {
  const changed =
    review.addedIds.length > 0 ||
    review.modifiedIds.length > 0 ||
    review.removedIds.length > 0;

  return (
    <section
      aria-label="AI 补丁复核"
      data-patch-review="pending"
      className="rounded-[10px] border border-evidence-accent/40 bg-white px-3 py-2 text-[11px] shadow-[0_6px_24px_#00000010]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-evidence-ink">
          <Sparkles
            aria-hidden="true"
            className="h-3 w-3 text-evidence-accent"
          />
          AI 已写入模型
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {changed ? (
            <>
              <Count label="新增" count={review.addedIds.length} />
              <Count label="修改" count={review.modifiedIds.length} />
              <Count label="删除" count={review.removedIds.length} />
            </>
          ) : (
            <span className="rounded bg-evidence-line/60 px-1.5 py-0.5 text-[10px] text-evidence-muted">
              结构未变
            </span>
          )}
        </span>
      </div>

      <p className="mt-1 leading-relaxed text-[#414751] select-text">
        {review.rationale}
      </p>

      {changed ? (
        <ul className="mt-2 flex flex-wrap gap-1" aria-label="补丁涉及的对象">
          {review.addedIds.map((id) => (
            <li key={`added-${id}`}>
              <ObjectChip
                id={id}
                change="added"
                onFocusEntity={onFocusEntity}
              />
            </li>
          ))}
          {review.modifiedIds.map((id) => (
            <li key={`modified-${id}`}>
              <ObjectChip
                id={id}
                change="modified"
                onFocusEntity={onFocusEntity}
              />
            </li>
          ))}
          {review.removedIds.map((id) => (
            <li key={`removed-${id}`}>
              <span
                className="inline-block rounded border border-[#b43656]/30 bg-[#fdf3f6] px-1.5 py-0.5 text-[10px] text-[#b43656] line-through"
                title="对象已从模型移除，无法定位"
              >
                − {id}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-evidence-line/60 pt-1.5">
        <span className="min-w-0 text-[10px] text-evidence-muted">
          {review.revertable
            ? '⌘/Ctrl + Enter 保留 · Esc 撤销这次补丁'
            : '模型之后又有改动，撤销已不可用；可在顶部按 ⌘Z 逐步回退'}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {review.revertable ? (
            <button
              type="button"
              onClick={onRevert}
              className="flex items-center gap-1 rounded border border-[#b42318]/40 px-2 py-1 text-[10px] text-[#b42318] hover:bg-[#b42318]/10"
            >
              <RotateCcw aria-hidden="true" className="h-3 w-3" />
              撤销补丁
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAccept}
            className="flex items-center gap-1 rounded bg-evidence-accent px-2.5 py-1 text-[10px] text-white hover:bg-[#274c76]"
          >
            <Check aria-hidden="true" className="h-3 w-3" />
            保留
          </button>
        </span>
      </div>
    </section>
  );
};

const CHIP_STYLES = {
  added:
    'border-evidence-participant/30 bg-[#f1f8f4] text-evidence-participant',
  modified:
    'border-evidence-accent/30 bg-evidence-accent/10 text-evidence-accent',
} as const;

const CHIP_MARK = { added: '+', modified: '~' } as const;

const ObjectChip = ({
  id,
  change,
  onFocusEntity,
}: {
  id: string;
  change: keyof typeof CHIP_STYLES;
  onFocusEntity?: (entityId: string) => void;
}) => (
  <button
    type="button"
    aria-label={`定位补丁对象 ${id}`}
    onClick={() => {
      onFocusEntity?.(id);
    }}
    className={cn(
      'inline-block rounded border px-1.5 py-0.5 text-[10px] hover:brightness-95',
      CHIP_STYLES[change],
    )}
  >
    {CHIP_MARK[change]} {id}
  </button>
);
