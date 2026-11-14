import { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight } from 'lucide-react';

import { cn } from '@evidence-poc/desktop-ui-kit';

export interface ThinkingBlockProps {
  /** Reasoning lifted from the transcript; null when the turn had none. */
  thinking: string | null;
  /** True while the closing tag has not streamed in. */
  active: boolean;
  className?: string;
}

const lineCount = (text: string): number => text.split('\n').length;

/**
 * The model's reasoning, folded away.
 *
 * A modeler needs to see that the agent reasoned — and be able to audit what it
 * assumed — without the derivation pushing the answer off screen. The folded
 * line therefore stays live while reasoning streams, and expanding shows the
 * whole block.
 */
export const ThinkingBlock = ({
  thinking,
  active,
  className,
}: ThinkingBlockProps) => {
  const [open, setOpen] = useState(false);

  if (thinking === null && !active) {
    return null;
  }

  const body = thinking ?? '';
  const label =
    thinking === null ? '正在推演履约因果…' : `${lineCount(thinking)} 行推理`;

  return (
    <section
      aria-label="推理过程"
      data-thinking-active={active ? 'true' : 'false'}
      className={cn(
        'rounded border text-[11px]',
        active
          ? 'border-evidence-accent/40 bg-evidence-accent/5'
          : 'border-evidence-line bg-white/60',
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
        className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-evidence-muted hover:text-evidence-ink"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <BrainCircuit
            aria-hidden="true"
            className={cn(
              'h-3 w-3 shrink-0 text-evidence-accent',
              active && 'animate-pulse',
            )}
          />
          <span className="shrink-0">{active ? '正在推演…' : '推理过程'}</span>
          {/* Only live reasoning teases its tail; a finished block hides whole. */}
          <span className="truncate text-[10px] text-evidence-muted/80">
            {open || !active ? '' : body.slice(-80)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px]">
          {label}
          {open ? (
            <ChevronDown aria-hidden="true" className="h-3 w-3" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3 w-3" />
          )}
        </span>
      </button>

      {open ? (
        <pre className="max-h-56 overflow-y-auto border-t border-evidence-line/60 px-2 py-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-[#414751] select-text">
          {body === '' ? '等待模型输出…' : body}
        </pre>
      ) : null}
    </section>
  );
};
