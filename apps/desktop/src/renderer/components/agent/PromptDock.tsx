import { useEffect, useRef, useState } from 'react';

import {
  WORKSHOP_STEPS,
  workshopStepFocus,
  workshopStepRank,
  type WorkshopStepId,
} from '@evidence-poc/evidence-schema';

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 240;

/** What the next prompt is about, when the modeler has something selected. */
export interface PromptFocus {
  nodeId: string;
  label: string;
  /** Entity category, shown so the modeler knows the kind they selected. */
  kind: string;
}

export interface PromptDockProps {
  running: boolean;
  /** Tool currently executing, shown as the status line. */
  activeToolName: string | null;
  /** Sends when idle, steers the live run when busy. */
  onSubmit: (text: string) => Promise<void> | void;
  onStop: () => Promise<void> | void;
  /** Selected object the question will be about; null when nothing is selected. */
  focus?: PromptFocus | null;
  onClearFocus?: () => void;
  /** Bumped by ⌘K; every change moves the caret into the composer. */
  focusToken?: number;
  disabled?: boolean;
}

/**
 * The workshop input.
 *
 * One composer for both directions: while the agent streams, Command+Enter
 * queues a steering message instead of starting a second run, which is how a
 * modeler corrects a wrong assumption without restarting the round.
 *
 * The seven steps sit above it because a facilitator needs to know what the room
 * is working on. The session keeps no step state, so the modeler says it: the
 * chosen step travels as a prefix on the next message, and stays chosen for the
 * following turns until it is cleared.
 */
export const PromptDock = ({
  running,
  activeToolName,
  onSubmit,
  onStop,
  focus = null,
  onClearFocus,
  focusToken,
  disabled = false,
}: PromptDockProps) => {
  const [value, setValue] = useState('');
  const [step, setStep] = useState<WorkshopStepId | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Mounting must not steal focus; only a later ⌘K moves the caret here.
  const previousFocusToken = useRef(focusToken);

  useEffect(() => {
    const element = textareaRef.current;

    if (element === null) {
      return;
    }

    element.style.height = 'auto';
    element.style.height = `${Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, element.scrollHeight),
    )}px`;
  }, [value]);

  useEffect(() => {
    if (focusToken === undefined || focusToken === previousFocusToken.current) {
      return;
    }

    previousFocusToken.current = focusToken;
    textareaRef.current?.focus();
  }, [focusToken]);

  const send = async (): Promise<void> => {
    const text = value.trim();

    if (text === '' || disabled) {
      return;
    }

    setValue('');
    await onSubmit(step === null ? text : `${workshopStepFocus(step)}\n${text}`);
  };

  return (
    <section
      aria-label="AI 访谈输入"
      className="evidence-no-drag flex w-[560px] max-w-[calc(100%-48px)] flex-col gap-2 rounded-[10px] border border-evidence-line bg-white/95 px-3 pt-2.5 pb-2 shadow-[0_6px_24px_#00000014]"
    >
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="工作坊步骤">
        {WORKSHOP_STEPS.map((candidate) => {
          const active = step === candidate.id;

          return (
            <button
              aria-pressed={active}
              className={`rounded-full border px-1.5 py-0.5 text-[10px] transition ${
                active
                  ? 'border-evidence-accent bg-evidence-accent/10 text-evidence-accent'
                  : 'border-evidence-line text-evidence-muted hover:border-evidence-accent'
              }`}
              key={candidate.id}
              onClick={() => {
                setStep(active ? null : candidate.id);
              }}
              title={candidate.hint}
              type="button"
            >
              {workshopStepRank(candidate.id)}. {candidate.label}
            </button>
          );
        })}
        {step === null ? null : (
          <button
            aria-label="清除当前步骤"
            className="shrink-0 text-[10px] text-evidence-muted hover:text-evidence-ink"
            onClick={() => {
              setStep(null);
            }}
            type="button"
          >
            ×
          </button>
        )}
      </div>

      {focus === null ? null : (
        <div className="flex items-center gap-1.5">
          <span
            data-testid="prompt-dock-focus"
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-evidence-accent/10 px-2 py-0.5 text-[10px] text-evidence-accent"
          >
            <span aria-hidden="true">🎯</span>
            <span className="truncate">
              焦点：{focus.label}
              <span className="text-evidence-accent/70">（{focus.kind}）</span>
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
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }

          // Escape belongs to the live run while one is streaming: stopping is
          // the only action that cannot wait for the agent to settle.
          if (event.key === 'Escape' && running) {
            event.preventDefault();
            void onStop();
          }
        }}
        rows={1}
        placeholder={
          running
            ? '插话纠偏：运费由买方承担，不是卖方'
            : '描述经营事实，或提出要澄清的履约与凭证'
        }
        aria-label="访谈内容"
        className="max-h-[240px] min-h-[36px] w-full resize-none border-0 bg-transparent p-0 text-[12px] leading-relaxed text-evidence-ink outline-none placeholder:text-evidence-muted"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-evidence-muted">
          {running ? (
            <>
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-evidence-accent" />
              <span className="truncate" data-testid="prompt-dock-status">
                {activeToolName === null
                  ? 'AI 正在推演…'
                  : `正在执行 ${activeToolName}`}
              </span>
            </>
          ) : (
            <span>⌘/Ctrl + Enter 发送 · 运行中发送即插话</span>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {running ? (
            <button
              type="button"
              onClick={() => void onStop()}
              className="rounded border border-[#b42318]/40 px-2 py-1 text-[10px] text-[#b42318] hover:bg-[#b42318]/10"
            >
              停止
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void send()}
            disabled={disabled || value.trim() === ''}
            className="rounded bg-evidence-accent px-2.5 py-1 text-[10px] text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? '插话' : '发送'}
          </button>
        </span>
      </div>
    </section>
  );
};
