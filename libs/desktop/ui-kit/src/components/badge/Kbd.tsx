import type { ComponentProps } from 'react';

import { cn } from '../../utils';

/**
 * A key cap.
 *
 * Shortcuts are printed on the control that owns them rather than hidden in a
 * help screen, so this is the one place that decides what `⌘K` looks like. It
 * splits `Mod+Shift+K` into separate caps so each modifier reads as a key.
 */
export const Kbd = ({
  className,
  children,
  ...props
}: ComponentProps<'kbd'>) => (
  <kbd
    data-slot="kbd"
    className={cn(
      'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-evidence-line',
      'bg-evidence-kbd px-1 font-sans text-[10px] leading-none font-medium text-evidence-muted',
      className,
    )}
    {...props}
  >
    {children}
  </kbd>
);

/** Splits a chord on `+` and renders one cap per key. */
export const KbdChord = ({
  chord,
  className,
}: {
  chord: string;
  className?: string;
}) => (
  <span
    data-slot="kbd-chord"
    className={cn('flex items-center gap-0.5', className)}
  >
    {chord.split('+').map((key) => (
      <Kbd key={key}>{key}</Kbd>
    ))}
  </span>
);
