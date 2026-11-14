import type { ReactNode } from 'react';
import { Pin, PinOff, X } from 'lucide-react';

import { cn } from '@evidence-poc/desktop-ui-kit';

export interface ActivityDrawerProps {
  title: string;
  /** Pinned draws the canvas narrower; unpinned floats over it. */
  pinned: boolean;
  onTogglePinned: () => void;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * The panel a rail button opens.
 *
 * One shell for every drawer keeps the header, the dismissal and the pin rule in
 * a single place: a modeler learns "the rail opens a panel, the panel can be
 * pinned" once instead of four times.
 */
export const ActivityDrawer = ({
  title,
  pinned,
  onTogglePinned,
  onClose,
  children,
  footer,
}: ActivityDrawerProps) => (
  <section
    aria-label={title}
    data-region="activity-drawer"
    data-pinned={pinned ? 'true' : 'false'}
    className={cn(
      'flex h-full min-h-0 w-full flex-col border-r border-evidence-line bg-white',
      pinned ? 'shadow-none' : 'shadow-xl',
    )}
  >
    <header className="flex h-8 shrink-0 items-center justify-between gap-1 border-b border-evidence-line px-2">
      <span className="truncate text-[10px] tracking-wide text-evidence-muted uppercase">
        {title}
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={pinned ? '取消固定面板' : '固定面板'}
          aria-pressed={pinned}
          onClick={onTogglePinned}
          title={pinned ? '取消固定：面板浮在画布之上' : '固定：为面板让出宽度'}
          className={cn(
            'rounded p-1 transition-colors',
            pinned
              ? 'text-evidence-accent hover:bg-evidence-hover'
              : 'text-evidence-muted hover:bg-evidence-hover hover:text-evidence-ink',
          )}
        >
          {pinned ? (
            <Pin aria-hidden="true" className="size-3" />
          ) : (
            <PinOff aria-hidden="true" className="size-3" />
          )}
        </button>
        <button
          type="button"
          aria-label="关闭面板"
          onClick={onClose}
          className="rounded p-1 text-evidence-muted transition-colors hover:bg-evidence-hover hover:text-evidence-ink"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      </span>
    </header>

    <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

    {footer === undefined ? null : (
      <div className="shrink-0 border-t border-evidence-line px-2 py-1.5 text-[10px] text-evidence-muted">
        {footer}
      </div>
    )}
  </section>
);
