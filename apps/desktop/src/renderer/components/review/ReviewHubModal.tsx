import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PreviewReviewInput,
  PreviewReviewResult,
} from '../../../shared/review';
import type { SensorIssue } from '@evidence-poc/evidence-modeling-orchestrator/browser';

export const ReviewHubModal = ({
  input,
  onClose,
  onLocate,
  onPrompt,
  canLocate,
  embedded = false,
}: {
  input: PreviewReviewInput;
  onClose: () => void;
  onLocate: (issue: SensorIssue) => void;
  onPrompt: (issue: SensorIssue) => void;
  canLocate: (issue: SensorIssue) => boolean;
  /**
   * Docks the review into the bottom console instead of covering the canvas.
   *
   * A reader who jumps to a finding has to see the object it names, so the
   * console keeps the model on screen; the standing modal remains for callers
   * that need one blocking surface.
   */
  embedded?: boolean;
}) => {
  const [result, setResult] = useState<PreviewReviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const stale = result?.success && result.revision !== input.revision;
  const refresh = useCallback(async () => {
    const token = ++request.current;
    setBusy(true);
    try {
      const next = await window.evidenceAPI.projects.previewReview(input);
      if (token === request.current) setResult(next);
    } catch (error) {
      if (token === request.current)
        setResult({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      if (token === request.current) setBusy(false);
    }
  }, [input]);
  // Opening captures one snapshot; edits do not silently replace the review underneath a reader.
  useEffect(() => {
    void refresh();
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => {
      request.current++;
      previous?.focus();
    };
    // Refresh is intentionally explicit; a later input revision marks this result stale.
  }, []);
  return (
    <div
      role={embedded ? 'region' : 'dialog'}
      aria-modal={embedded ? undefined : 'true'}
      aria-label="审查中心"
      tabIndex={-1}
      ref={dialog}
      className={
        embedded
          ? 'flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white outline-none'
          : 'fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-evidence-line bg-white shadow-xl'
      }
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
        // Escape and Tab belong to the modal surface; inside the console the
        // surrounding workspace keeps its own focus order.
        if (embedded) {
          return;
        }
        if (event.key === 'Tab') {
          const controls = [
            ...(dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), iframe',
            ) ?? []),
          ];
          const first = controls[0];
          const last = controls.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b p-3 text-sm">
        <h2 className="flex-1 font-semibold">业务对象工作台 · 审查中心</h2>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          刷新审查
        </button>
        <button type="button" onClick={onClose}>
          关闭审查
        </button>
      </header>
      {busy ? (
        <p role="status" className="p-3">
          正在检查快照…
        </p>
      ) : null}
      {result && !result.success ? (
        <p role="alert" className="p-3">
          {result.error}
        </p>
      ) : null}
      {result?.success ? (
        <>
          <p className="px-3 py-2 text-xs">{result.notice}</p>
          {stale ? (
            <p role="status" className="px-3 text-amber-700">
              模型已变更，此审查已过期。刷新后再定位或修复。
            </p>
          ) : null}
          <section
            aria-label="审查发现"
            className="max-h-48 shrink-0 overflow-auto border-y p-3 text-xs"
          >
            <p>
              一致性：
              {result.data.validation.consistent === true ? '通过' : '未通过'} ·
              完整性：
              {result.data.validation.complete === true
                ? '完整'
                : result.data.validation.complete === false
                  ? '不完整'
                  : '未检查'}
            </p>
            {result.issues.length === 0 ? (
              <p>本轮没有发现项。机器检查不等于业务批准。</p>
            ) : (
              result.issues.map((issue) => (
                <div
                  key={issue.issueId}
                  className="flex items-center gap-3 border-t py-2"
                >
                  <span className="flex-1">
                    [{issue.severity}] {issue.message}
                  </span>
                  <button
                    type="button"
                    disabled={!!stale || busy || !canLocate(issue)}
                    onClick={() => onLocate(issue)}
                  >
                    画布定位
                  </button>
                  <button
                    type="button"
                    disabled={!!stale || busy}
                    onClick={() => onPrompt(issue)}
                  >
                    交由 Agent 修复
                  </button>
                </div>
              ))
            )}
          </section>
          <iframe
            title="业务对象工作台预览"
            sandbox="allow-scripts"
            srcDoc={result.html}
            className="min-h-0 w-full flex-1 border-0"
          />
        </>
      ) : null}
    </div>
  );
};
