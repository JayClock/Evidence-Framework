import * as PopoverPrimitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';

/** Anchored floating surface: filters, dense legends, inline hints. */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = ({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      data-slot="popover-content"
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-64 rounded-md border border-evidence-line bg-white p-2 shadow-overlay outline-none',
        'data-[state=open]:animate-[evidence-zoom-in_120ms_ease-out]',
        'data-[state=closed]:animate-[evidence-fade-out_100ms_ease-in]',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
);
