import { useEffect, useId, useRef, useState } from 'react';
import { CornerDownLeft, Sparkles } from 'lucide-react';

import { Button, cn } from '@evidence-poc/desktop-ui-kit';

export interface CanvasStormingControls {
  open: boolean;
  focusToken: number;
  busy: boolean;
  blocked?: boolean;
  error?: string | null;
  aiConfigured?: boolean;
  onConfigureAi?: () => void;
  onClose: () => void;
  onStorm: (text: string) => Promise<boolean>;
  onStop: () => void;
}

/** One composer, carried from the empty canvas into the populated workspace. */
export const CanvasStormingBar = ({
  empty,
  open,
  focusToken,
  busy,
  blocked = false,
  error,
  aiConfigured = true,
  onConfigureAi,
  onClose,
  onStorm,
  onStop,
}: CanvasStormingControls & { empty: boolean }) => {
  const [draft, setDraft] = useState('');
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const configure = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open)
      (aiConfigured ? input.current : configure.current)?.focus({
        preventScroll: true,
      });
  }, [open, focusToken, aiConfigured]);

  if (!empty && !open) return null;

  return (
    <div
      data-canvas-control=""
      data-canvas-storming=""
      data-evidence-capture-hide=""
      className={cn(
        'pointer-events-none absolute inset-x-3 z-40 flex justify-center',
        empty ? 'top-1/2 -translate-y-1/2' : 'top-14',
      )}
    >
      <form
        aria-labelledby={`${id}-title`}
        className={cn(
          'pointer-events-auto flex w-full max-w-xl flex-col gap-2 rounded-xl border border-workbench-border bg-white p-4 shadow-lg',
          !empty && 'motion-safe:animate-[evidence-storming-in_160ms_ease-out]',
        )}
        onSubmit={async (event) => {
          event.preventDefault();
          const text = draft.trim();
          if (!aiConfigured || busy || blocked || text === '') return;
          if (await onStorm(text)) setDraft('');
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          onClose();
        }}
      >
        <h2
          id={`${id}-title`}
          className="flex items-center gap-2 text-sm font-semibold text-evidence-ink"
        >
          <Sparkles
            className="size-4 text-evidence-accent"
            aria-hidden="true"
          />
          业务场景头脑风暴
          <kbd
            aria-hidden="true"
            className="ml-auto text-xs font-normal text-evidence-muted"
          >
            ⌘K
          </kbd>
        </h2>
        <p id={`${id}-hint`} className="text-xs text-workbench-body">
          按 ⌘K 或在此输入业务场景、粘贴合同文本，将有依据的凭证贴到对应泳道。
        </p>
        <label htmlFor={id} className="sr-only">
          业务场景
        </label>
        <textarea
          ref={input}
          id={id}
          aria-describedby={`${id}-hint`}
          rows={3}
          value={draft}
          disabled={!aiConfigured}
          readOnly={busy}
          placeholder="例如：买家询价朝鲜蓟，摊主报价 20 元，双方达成口头协议……"
          className="w-full resize-y rounded-md border border-workbench-border bg-workbench-background px-2.5 py-2 text-xs text-evidence-ink focus-visible:border-evidence-accent focus-visible:ring-1 focus-visible:ring-evidence-accent"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              event.altKey ||
              event.metaKey ||
              event.ctrlKey
            )
              return;
            event.preventDefault();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.currentTarget.form?.requestSubmit();
          }}
        />
        {error ? (
          <p role="alert" className="text-xs text-workbench-body">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="mr-auto text-xs text-evidence-muted">
            {busy
              ? '正在铺设业务凭证…'
              : blocked
                ? '请先结束当前节点问询或处理补丁。'
                : aiConfigured
                  ? 'Enter 提交 · Shift+Enter 换行'
                  : '请先配置 AI 模型。'}
          </p>
          {!aiConfigured ? (
            <Button
              ref={configure}
              type="button"
              size="xs"
              variant="outline"
              onClick={onConfigureAi}
            >
              配置 AI 模型
            </Button>
          ) : null}
          {busy ? (
            <Button type="button" size="xs" variant="outline" onClick={onStop}>
              停止
            </Button>
          ) : null}
          {open && !empty ? (
            <Button type="button" size="xs" variant="ghost" onClick={onClose}>
              关闭（Esc）
            </Button>
          ) : null}
          <Button
            type="submit"
            size="xs"
            disabled={!aiConfigured || busy || blocked || draft.trim() === ''}
          >
            发起发散 <CornerDownLeft aria-hidden="true" />
          </Button>
        </div>
      </form>
    </div>
  );
};
