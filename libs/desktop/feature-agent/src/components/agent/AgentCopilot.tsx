import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Bot, CornerDownLeft, Sparkles, Square, X } from 'lucide-react';

import type { AgentSessionController } from '../../state/useAgentSession';
import type { PatchReviewController } from '../../state/usePatchReview';
import { InlinePatchCard } from './InlinePatchCard';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolActivityItem } from './ToolActivityItem';
import { parseStreamedTranscript } from './thinkingParser';
import { Button } from '@evidence-poc/desktop-ui-kit';

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
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
  embedded?: boolean;
}

/**
 * The agent rail: one stream from question to applied patch.
 *
 * It replaces the floating composer, the over-canvas review bar and the separate
 * tool log. A modeler reads one column — what was asked, what the agent reasoned,
 * which tools ran, what the model now says — and settles the patch where it was
 * proposed instead of hunting for a bar over the canvas.
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
  aiConfigured = true,
  onConfigureAi,
  embedded = false,
}: AgentCopilotProps) => {
  const { state, submit, stop, dismissError } = controller;
  const [value, setValue] = useState('');
  const composerId = useId();
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

    if (!aiConfigured || text === '' || (embedded && state.running)) return;

    setValue('');
    if (focus === null) await submit(text);
    else await submit(text, { nodeId: focus.nodeId });
  }, [aiConfigured, embedded, state.running, focus, submit, value]);

  const empty =
    state.transcript === '' &&
    state.activities.length === 0 &&
    patchReview?.review == null;

  return (
    <section
      aria-label="AI 建模副驾"
      className="flex h-full min-h-0 min-w-0 flex-col bg-white"
    >
      <header className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-workbench-border px-3 py-1">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-evidence-ink">
          <Bot aria-hidden="true" className="size-3.5 text-evidence-accent" />
          {embedded ? '节点问询' : 'Evidence Copilot'}
        </span>
        <span className="truncate text-[10px] text-evidence-muted">
          {state.running ? (
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-evidence-accent" />
              <span
                role="status"
                className="truncate"
                data-testid="agent-copilot-status"
              >
                {state.activeToolName === null
                  ? 'AI 正在推演…'
                  : `正在执行 ${state.activeToolName}`}
              </span>
            </span>
          ) : null}
        </span>
      </header>

      {!aiConfigured ? (
        <div className="mx-3 mt-3 flex shrink-0 flex-col gap-2 rounded-lg border border-workbench-border bg-workbench-background p-3 text-xs">
          <h3 className="font-medium">欢迎使用 Evidence 智能建模助理</h3>
          <p>
            开始前，请先配置大模型提供商与 API
            Key，即可开启业务流推演与智能补丁补全。
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onConfigureAi}
            className="self-start"
          >
            立刻配置 API Key
          </Button>
        </div>
      ) : null}
      {state.error === null ? null : (
        <div className="flex items-center justify-between gap-2 border-b border-[#b42318]/30 bg-[#b42318]/5 px-2 py-1.5 text-[11px] text-[#b42318]">
          <span role="alert" className="min-w-0 wrap-anywhere">
            {state.error}
          </span>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 text-[10px] underline decoration-dotted"
          >
            知道了
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {empty ? (
          <div className="mb-3 flex flex-col items-start gap-1.5 rounded-lg border border-workbench-border bg-workbench-background p-3 text-[11px] text-workbench-body">
            <Sparkles
              aria-hidden="true"
              className="h-4 w-4 text-evidence-accent/50"
            />
            <p>描述一个业务例子来铺设凭证，或打开画布上的凭证追溯关键数据。</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <ThinkingBlock thinking={thinking} active={thinkingActive} />

          {content === '' ? null : (
            <pre
              aria-label="AI 回复"
              className="rounded-lg border border-workbench-border bg-workbench-background px-3 py-2 font-sans text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap text-workbench-body select-text"
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

      <form
        data-workbench-chrome=""
        className="flex shrink-0 flex-col gap-2 border-t border-workbench-border bg-white p-3 [&_button_svg]:size-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {focus === null ? null : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              data-testid="agent-copilot-focus"
              className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-workbench-subtle px-2 py-0.5 text-[10px] text-workbench-label"
              title={focus.nodeId}
            >
              <span className="truncate">
                焦点：{focus.label}（{focus.kind}）
              </span>
            </span>
            {!embedded && onClearFocus !== undefined ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="清除焦点"
                onClick={onClearFocus}
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
            {aiConfigured && !embedded ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={value.trim() !== ''}
                onClick={() => {
                  setValue((current) =>
                    current.trim() !== ''
                      ? current
                      : `请检查当前实体 ${focus.label}（${focus.nodeId}）的 CEL 不变量，并为明确的业务约束提供补丁建议。`,
                  );
                  textareaRef.current?.focus();
                }}
              >
                <Sparkles aria-hidden="true" /> 生成 CEL 补丁
              </Button>
            ) : null}
          </div>
        )}
        <label htmlFor={composerId} className="sr-only">
          访谈内容
        </label>
        <textarea
          ref={textareaRef}
          id={composerId}
          value={value}
          disabled={!aiConfigured}
          rows={2}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
            // Escape stops a streaming run, not the selection behind it.
            if (event.key === 'Escape' && state.running) {
              event.preventDefault();
              void stop();
            }
          }}
          placeholder={
            !aiConfigured
              ? '请先配置 API Key'
              : state.running
                ? embedded
                  ? '等待本轮问询结束'
                  : '插话纠偏：运费由买方承担，不是卖方'
                : embedded
                  ? '回答业务问题，或补充已有约定'
                  : '描述经营事实，或提出要澄清的履约与凭证'
          }
          className="max-h-40 w-full resize-none rounded-md border border-workbench-border bg-workbench-background px-2.5 py-2 text-xs leading-relaxed text-evidence-ink outline-none placeholder:text-workbench-muted focus-visible:border-evidence-accent focus-visible:ring-1 focus-visible:ring-evidence-accent"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-[10px] text-workbench-muted">
            Enter 发送 · Shift+Enter 换行
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {state.running ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void stop()}
              >
                <Square aria-hidden="true" className="fill-current" /> 停止
              </Button>
            ) : null}
            <Button
              type="submit"
              size="xs"
              disabled={
                !aiConfigured ||
                value.trim() === '' ||
                (embedded && state.running)
              }
            >
              {state.running && !embedded ? '插话' : '发送'}
              <CornerDownLeft aria-hidden="true" />
            </Button>
          </span>
        </div>
      </form>
    </section>
  );
};
