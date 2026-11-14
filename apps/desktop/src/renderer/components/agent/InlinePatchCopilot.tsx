import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Sparkles, Square, X } from 'lucide-react';

import { cn } from '@evidence-poc/desktop-ui-kit';

import type { AgentSessionController } from '../../state/useAgentSession';
import type { PatchReviewController } from '../../state/usePatchReview';
import { InlinePatchCard } from './InlinePatchCard';

export interface InlineFocus {
  nodeId: string;
  label: string;
  kind: string;
}

export interface InlinePatchCopilotProps {
  /** The object the question is about; null when the canvas has no selection. */
  focus: InlineFocus | null;
  controller: AgentSessionController;
  patchReview?: PatchReviewController | null;
  /** Pans the canvas to an object a patch touched. */
  onFocusEntity?: (entityId: string) => void;
  onClose: () => void;
  /** Opens the full interview when the modeler wants the long conversation. */
  onOpenFullInterview?: () => void;
}

const PRESETS = [
  '补一个履约确认动作',
  '把金额改成严格派生',
  '补齐业务时间字段',
] as const;

/**
 * The agent where the modeler is looking.
 *
 * Asking about an object used to mean switching a rail to a conversation and
 * remembering which object was selected. Here the composer opens over the canvas
 * with the selection already named, and the patch it produces is reviewed in the
 * same card — accept where it was proposed, without losing the picture.
 */
export const InlinePatchCopilot = ({
  focus,
  controller,
  patchReview = null,
  onFocusEntity,
  onClose,
  onOpenFullInterview,
}: InlinePatchCopilotProps) => {
  const { state, submit, stop, dismissError } = controller;
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pending = patchReview?.review ?? null;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape belongs to this card while it is open, so closing it does not also
  // clear the selection the card is talking about.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pending !== null) {
        return;
      }

      event.preventDefault();
      // Capture runs before the editor's window listener, so closing the card
      // does not also clear the selection it was talking about.
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, pending]);

  const send = async () => {
    const text = value.trim();

    if (text === '' || focus === null) return;

    setValue('');
    await submit(`关于 ${focus.label}（${focus.kind}）：${text}`);
  };

  return (
    <section
      aria-label="行内 AI 协同"
      data-region="inline-copilot"
      className="pointer-events-auto flex w-[min(440px,calc(100vw-2rem))] flex-col gap-1.5 rounded-xl border border-evidence-line bg-white/95 p-2 shadow-overlay backdrop-blur-md"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] tracking-wide text-evidence-muted uppercase">
          <Sparkles
            aria-hidden="true"
            className="size-3 text-evidence-accent"
          />
          行内协同
        </span>
        <span className="flex items-center gap-1.5">
          {state.running ? (
            <span className="flex items-center gap-1 text-[10px] text-evidence-accent">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-evidence-accent" />
              {state.activeToolName === null
                ? 'AI 正在推演…'
                : state.activeToolName}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="关闭行内协同"
            onClick={onClose}
            className="rounded p-0.5 text-evidence-muted hover:bg-evidence-hover hover:text-evidence-ink"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      </header>

      {focus === null ? (
        <p className="px-1 py-2 text-[11px] text-evidence-muted">
          先在画布上选一个业务对象，问题会带着它的上下文进入模型。
        </p>
      ) : (
        <span
          data-testid="inline-copilot-focus"
          className="mx-0.5 inline-flex max-w-full items-center gap-1 self-start rounded-full bg-evidence-accent/10 px-2 py-0.5 text-[10px] text-evidence-accent"
        >
          <span aria-hidden="true">🎯</span>
          <span className="truncate">
            {focus.label}
            <span className="text-evidence-accent/70">（{focus.kind}）</span>
          </span>
        </span>
      )}

      {state.error === null ? null : (
        <p
          role="alert"
          className="rounded border border-evidence-evidence/40 bg-[#fff7f8] px-1.5 py-1 text-[10px] text-evidence-evidence"
        >
          {state.error}
          <button
            type="button"
            onClick={dismissError}
            className="ml-1.5 underline decoration-dotted"
          >
            知道了
          </button>
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={focus === null || state.running}
            onClick={() => {
              setValue(preset);
              textareaRef.current?.focus();
            }}
            className="rounded-full border border-evidence-line px-2 py-0.5 text-[10px] text-evidence-muted transition-colors hover:border-evidence-accent hover:text-evidence-ink disabled:opacity-40"
          >
            {preset}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        aria-label="行内协同内容"
        value={value}
        rows={2}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }

          if (event.key === 'Escape' && state.running) {
            event.preventDefault();
            void stop();
          }
        }}
        placeholder={
          focus === null
            ? '先选一个业务对象'
            : state.running
              ? '插话纠偏…'
              : `描述要改的地方，例如：${PRESETS[0]}`
        }
        className="max-h-28 w-full resize-none rounded border border-evidence-line bg-white px-2 py-1 text-[11px] leading-relaxed text-evidence-ink outline-none placeholder:text-evidence-muted focus:border-evidence-accent"
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onOpenFullInterview}
          className="truncate text-[10px] text-evidence-muted underline decoration-dotted hover:text-evidence-ink"
        >
          打开完整访谈
        </button>
        <span className="flex shrink-0 items-center gap-1">
          {state.running ? (
            <button
              type="button"
              onClick={() => void stop()}
              className="flex items-center gap-1 rounded border border-[#b42318]/40 px-2 py-1 text-[10px] text-[#b42318] hover:bg-[#b42318]/10"
            >
              <Square aria-hidden="true" className="size-2.5 fill-current" />
              停止
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void send()}
            disabled={value.trim() === '' || focus === null}
            className={cn(
              'flex items-center gap-1 rounded bg-evidence-accent px-2.5 py-1 text-[10px] text-white',
              'hover:bg-[#274c76] disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {state.running ? '插话' : '发送'}
            <CornerDownLeft aria-hidden="true" className="size-2.5" />
          </button>
        </span>
      </div>

      {pending === null ? null : (
        <InlinePatchCard
          review={pending}
          onAccept={() => {
            patchReview?.accept();
            onClose();
          }}
          onRevert={() => {
            patchReview?.revert();
            onClose();
          }}
          {...(onFocusEntity === undefined ? {} : { onFocusEntity })}
        />
      )}
    </section>
  );
};
