import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';
import { KbdChord } from '../badge/Kbd';

/**
 * One provider for the whole window.
 *
 * A 200ms delay is short enough to feel like the button explains itself and
 * long enough not to flash while the pointer crosses a toolbar, so the delay
 * lives here instead of on every tooltip.
 */
export const TooltipProvider = ({
  delayDuration = 200,
  skipDelayDuration = 300,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  />
);

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export interface TooltipContentProps
  extends ComponentProps<typeof TooltipPrimitive.Content> {
  /** Printed beside the label as key caps; the shortcut the hint names. */
  shortcut?: string;
}

export const TooltipContent = ({
  className,
  sideOffset = 6,
  shortcut,
  children,
  ...props
}: TooltipContentProps) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      className={cn(
        'z-50 flex max-w-xs items-center gap-2 rounded border border-evidence-ink/10 bg-evidence-ink px-1.5 py-1 text-[11px] text-white shadow-hud',
        'data-[state=delayed-open]:animate-[evidence-fade-in_100ms_ease-out]',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {shortcut === undefined ? null : (
        <KbdChord
          chord={shortcut}
          className="[&>kbd]:border-white/20 [&>kbd]:bg-white/10 [&>kbd]:text-white/80"
        />
      )}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
);
