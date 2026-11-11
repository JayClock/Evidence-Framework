import { useEffect, useRef, useState } from 'react';

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 240;

export interface PromptDockProps {
  running: boolean;
  /** Tool currently executing, shown as the status line. */
  activeToolName: string | null;
  /** Sends when idle, steers the live run when busy. */
  onSubmit: (text: string) => Promise<void> | void;
  onStop: () => Promise<void> | void;
  disabled?: boolean;
}

/**
 * The interview input.
 *
 * One composer for both directions: while the agent streams, Enter queues a
 * steering message instead of starting a second run, which is how a modeler
 * corrects a wrong assumption without restarting the round.
 */
export const PromptDock = ({
  running,
  activeToolName,
  onSubmit,
  onStop,
  disabled = false,
}: PromptDockProps) => {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const send = async (): Promise<void> => {
    const text = value.trim();

    if (text === '' || disabled) {
      return;
    }

    setValue('');
    await onSubmit(text);
  };

  return (
    <section
      aria-label="AI 访谈输入"
      className="evidence-no-drag flex w-[560px] max-w-[calc(100%-48px)] flex-col gap-2 rounded-[10px] border border-evidence-line bg-white/95 px-3 pt-2.5 pb-2 shadow-[0_6px_24px_#00000014]"
    >
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
