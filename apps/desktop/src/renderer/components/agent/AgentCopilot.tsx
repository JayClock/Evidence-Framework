import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CornerDownLeft, Sparkles, Square } from 'lucide-react';

import {
  REVERSE_CONTRACT_MODE,
  workshopStepFocus,
} from '@evidence-poc/evidence-schema';

import type { AgentSessionController } from '../../state/useAgentSession';
import type { PatchReviewController } from '../../state/usePatchReview';
import { InlinePatchCard } from './InlinePatchCard';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolActivityItem } from './ToolActivityItem';
import {
  WorkshopStepSelector,
  type AgentWorkshopSelection,
} from './WorkshopStepSelector';
import { parseStreamedTranscript } from './thinkingParser';
import { cn } from '../ui/utils';

/** What the next prompt is about, when the modeler has something selected. */
export interface PromptFocus {
  nodeId: string;
  label: string;
  /** Entity category, shown so the modeler knows the kind they selected. */
  kind: string;
}

export interface AgentCopilotProps {
  controller: AgentSessionController;
  /** Pending agent patch, if any, reviewed inline with the conversation. */
  patchReview?: PatchReviewController | null;
  /** Selected object the question will be about; null when nothing is selected. */
  focus?: PromptFocus | null;
  onClearFocus?: () => void;
  /** Pans the canvas to an object a patch touched. */
  onFocusEntity?: (entityId: string) => void;
  /** Bumped by ⌘K; every change moves the caret into the composer. */
  focusToken?: number;
  /** Text another panel wants written into the composer. */
  prefill?: { token: number; text: string } | null;
  /** Called once a prefill is in the composer, so it is not replayed later. */
  onPrefillConsumed?: () => void;
}

/**
 * The agent rail: one stream from question to applied patch.
 *
 * It replaces the floating composer, the over-canvas review bar and the separate
 * tool log. A modeler reads one column — what was asked, what the agent reasoned,
 * which tools ran, what the model now says — and settles the patch where it was
 * proposed instead of hunting for a bar over the canvas.
 *
 * The composer is a single slot: one workshop move, one focus, one message. The
 * move is sticky so a facilitator can keep asking about the same step, and the
 * prefix travels with the prompt because the session keeps no step state.
 */
export const AgentCopilot = ({
  controller,
  patchReview = null,
  focus = null,
  onClearFocus,
  onFocusEntity,
  focusToken,
  prefill = null,
  onPrefillConsumed,
}: AgentCopilotProps) => {
  const { state, submit, stop, dismissError } = controller;
  const [value, setValue] = useState('');
  const [selection, setSelection] = useState<AgentWorkshopSelection>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { thinking, content, thinkingActive } = useMemo(
    () => parseStreamedTranscript(state.transcript),
    [state.transcript],
  );

  // Mounting lands the caret in the composer: the rail is only open because the
  // modeler asked for the agent, and a second ⌘K keeps it there.
  const previousFocusToken = useRef<number | null>(null);
  useEffect(() => {
    if (focusToken === undefined) return;
    if (previousFocusToken.current === focusToken) return;

    previousFocusToken.current = focusToken;
    textareaRef.current?.focus();
  }, [focusToken]);

  const previousPrefill = useRef<number | null>(null);
  useEffect(() => {
    if (prefill === null || previousPrefill.current === prefill.token) return;

    previousPrefill.current = prefill.token;
    setValue((current) =>
      current.trim() === '' ? prefill.text : `${current}\n\n${prefill.text}`,
    );
    textareaRef.current?.focus();
    onPrefillConsumed?.();
  }, [prefill, onPrefillConsumed]);

  // jsdom has no layout, so the anchor may not implement scrolling at all.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [content, thinking, state.activities.length, patchReview?.review]);

  const send = useCallback(async () => {
    const text = value.trim();

    if (text === '') return;

    setValue('');
    const prefix =
      selection === null
        ? ''
        : selection === REVERSE_CONTRACT_MODE.id
          ? REVERSE_CONTRACT_MODE.focus
          : workshopStepFocus(selection);

    await submit(prefix === '' ? text : `${prefix}\n${text}`);
  }, [selection, submit, value]);

  const empty =
    state.transcript === '' &&
    state.activities.length === 0 &&
    patchReview?.review == null;

  return (
    <section
      aria-label="AI 建模副驾"
      className="flex h-full min-h-0 flex-col bg-white/70"
    >
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-evidence-line px-2">
        <span className="flex items-center gap-1.5 text-[10px] tracking-wide text-evidence-muted uppercase">
          <Bot aria-hidden="true" className="h-3 w-3 text-evidence-accent" />
          AI 建模副驾
        </span>
        <span className="truncate text-[10px] text-evidence-muted">
          {state.running ? (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-evidence-accent" />
              <span data-testid="agent-copilot-status">
                {state.activeToolName === null
                  ? 'AI 正在推演…'
                  : `正在执行 ${state.activeToolName}`}
              </span>
            </span>
          ) : selection === null ? null : (
            '本轮已带阶段前缀'
          )}
        </span>
      </header>

      {state.error === null ? null : (
        <div className="flex items-center justify-between gap-2 border-b border-[#b42318]/30 bg-[#b42318]/5 px-2 py-1.5 text-[11px] text-[#b42318]">
          <span className="min-w-0 truncate">{state.error}</span>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 text-[10px] underline decoration-dotted"
          >
            知道了
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {empty ? (
          <div className="mt-6 flex flex-col items-center gap-1 px-4 text-center text-[11px] text-evidence-muted">
            <Sparkles
              aria-hidden="true"
              className="h-4 w-4 text-evidence-accent/50"
            />
            <p>从画布选一个业务对象，或直接描述经营事实。</p>
            <p className="text-[10px]">
              选一个工坊阶段，这句话就带着它进入访谈。
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <ThinkingBlock thinking={thinking} active={thinkingActive} />

          {content === '' ? null : (
            <pre
              aria-label="AI 回复"
              className="max-h-96 overflow-y-auto rounded border border-evidence-line bg-white px-2 py-1.5 text-[11px] leading-relaxed whitespace-pre-wrap text-[#414751] select-text"
            >
              {content}
            </pre>
          )}

          {state.activities.length === 0 ? null : (
            <section aria-label="工具调用记录" className="flex flex-col gap-1">
              <span className="text-[10px] tracking-wide text-evidence-muted uppercase">
                工具调用 {state.activities.length}
              </span>
              {state.activities.map((activity) => (
                <ToolActivityItem key={activity.id} activity={activity} />
              ))}
            </section>
          )}

          {patchReview?.review == null ? null : (
            <InlinePatchCard
              review={patchReview.review}
              onAccept={patchReview.accept}
              onRevert={patchReview.revert}
              onFocusEntity={onFocusEntity}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 space-y-1.5 border-t border-evidence-line px-2 py-2">
        <WorkshopStepSelector selection={selection} onSelect={setSelection} />

        {focus === null ? null : (
          <div className="flex items-center gap-1.5">
            <span
              data-testid="agent-copilot-focus"
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-evidence-accent/10 px-2 py-0.5 text-[10px] text-evidence-accent"
            >
              <span aria-hidden="true">🎯</span>
              <span className="truncate">
                焦点：{focus.label}
                <span className="text-evidence-accent/70">
                  （{focus.kind}）
                </span>
              </span>
            </span>
            <button
              type="button"
              aria-label="清除焦点"
              onClick={onClearFocus}
              className="shrink-0 text-[10px] text-evidence-muted hover:text-evidence-ink"
            >
              ×
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          aria-label="访谈内容"
          value={value}
          rows={2}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }

            // Escape belongs to the live run while one is streaming: stopping is
            // the only action that cannot wait for the agent to settle.
            if (event.key === 'Escape' && state.running) {
              event.preventDefault();
              void stop();
            }
          }}
          placeholder={
            state.running
              ? '插话纠偏：运费由买方承担，不是卖方'
              : '描述经营事实，或提出要澄清的履约与凭证'
          }
          className={cn(
            'max-h-40 w-full resize-none rounded border border-evidence-line bg-white px-2 py-1 text-[12px] leading-relaxed text-evidence-ink outline-none',
            'placeholder:text-evidence-muted focus:border-evidence-accent',
          )}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-[10px] text-evidence-muted">
            ⌘/Ctrl + Enter 发送 · 运行中发送即插话
          </span>

          <span className="flex shrink-0 items-center gap-1.5">
            {state.running ? (
              <button
                type="button"
                onClick={() => void stop()}
                className="flex items-center gap-1 rounded border border-[#b42318]/40 px-2 py-1 text-[10px] text-[#b42318] hover:bg-[#b42318]/10"
              >
                <Square
                  aria-hidden="true"
                  className="h-2.5 w-2.5 fill-current"
                />
                停止
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void send()}
              disabled={value.trim() === ''}
              className="flex items-center gap-1 rounded bg-evidence-accent px-2.5 py-1 text-[10px] text-white hover:bg-[#274c76] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state.running ? '插话' : '发送'}
              <CornerDownLeft aria-hidden="true" className="h-2.5 w-2.5" />
            </button>
          </span>
        </div>
      </div>
    </section>
  );
};
