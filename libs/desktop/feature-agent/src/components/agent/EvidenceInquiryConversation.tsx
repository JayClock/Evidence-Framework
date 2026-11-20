import { useEffect, useId, useRef, useState } from 'react';
import { CornerDownLeft, Square } from 'lucide-react';

import { Button } from '@evidence-poc/desktop-ui-kit';
import type { AgentSessionController } from '../../state/useAgentSession';
import type { PatchReviewController } from '../../state/usePatchReview';
import { InlinePatchCard } from './InlinePatchCard';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolActivityItem } from './ToolActivityItem';

interface EvidenceInquiryConversationProps {
  nodeId: string;
  controller: AgentSessionController;
  patchReview: PatchReviewController;
  onFocusEntity: (entityId: string) => void;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
}

/** The streaming turn and its review, anchored to the card that asked for it. */
export const EvidenceInquiryConversation = ({
  nodeId,
  controller,
  patchReview,
  onFocusEntity,
  aiConfigured = true,
  onConfigureAi,
}: EvidenceInquiryConversationProps) => {
  const { state, submit, stop, dismissError } = controller;
  const [value, setValue] = useState('');
  const composerId = useId();
  const bottomRef = useRef<HTMLDivElement>(null);
  const review = patchReview.review;
  const { transcript: content, thinking, thinkingActive } = state;

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' });
  }, [content, thinking, state.activities.length, review]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!aiConfigured ? (
          <div className="flex flex-col items-start gap-2 text-xs">
            <p>请先配置大模型，再追溯数据来源或推演履约异常。</p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onConfigureAi}
            >
              配置 Pi 模型
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {state.error === null ? null : (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span role="alert" className="min-w-0 wrap-anywhere">
                  {state.error}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={dismissError}
                >
                  知道了
                </Button>
              </div>
            )}
            <ThinkingBlock
              thinking={thinking || null}
              active={thinkingActive}
            />
            {content === '' ? null : (
              <pre
                aria-label="AI 回复"
                className="rounded-lg border border-workbench-border bg-workbench-background px-3 py-2 font-sans text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap text-workbench-body select-text"
              >
                {content}
              </pre>
            )}
            {state.activities.length === 0 ? null : (
              <section
                aria-label="工具调用记录"
                className="flex flex-col gap-1"
              >
                {state.activities.map((activity) => (
                  <ToolActivityItem key={activity.id} activity={activity} />
                ))}
              </section>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {review === null ? null : (
        <div className="max-h-[45%] shrink-0 overflow-y-auto px-3 pb-2">
          <InlinePatchCard
            review={review}
            onAccept={patchReview.accept}
            onRevert={patchReview.revert}
            onFocusEntity={onFocusEntity}
            enterToAccept
          />
        </div>
      )}
      <form
        className="flex shrink-0 flex-col gap-2 border-t border-workbench-border p-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const text = value.trim();
          if (!aiConfigured || text === '' || state.running || review !== null)
            return;
          if ((await submit(text, { nodeId })).success) setValue('');
        }}
      >
        <label htmlFor={composerId} className="sr-only">
          访谈内容
        </label>
        <textarea
          id={composerId}
          value={value}
          disabled={!aiConfigured}
          readOnly={state.running || review !== null}
          rows={2}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (
              review !== null ||
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            )
              return;
            event.preventDefault();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder="回答业务问题，或补充已有约定"
          className="w-full resize-none rounded-md border border-workbench-border bg-workbench-background px-2.5 py-2 text-xs leading-relaxed text-evidence-ink focus-visible:border-evidence-accent focus-visible:ring-1 focus-visible:ring-evidence-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="mr-auto text-[10px] text-workbench-muted">
            {state.running
              ? state.activeToolName === null
                ? 'AI 正在推演…'
                : `正在执行 ${state.activeToolName}`
              : review !== null
                ? 'Enter 应用本次补丁'
                : 'Enter 发送 · Shift+Enter 换行'}
          </p>
          {state.running ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void stop()}
            >
              <Square aria-hidden="true" /> 停止
            </Button>
          ) : null}
          <Button
            type="submit"
            size="xs"
            disabled={
              !aiConfigured ||
              value.trim() === '' ||
              state.running ||
              review !== null
            }
          >
            发送 <CornerDownLeft aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
};
