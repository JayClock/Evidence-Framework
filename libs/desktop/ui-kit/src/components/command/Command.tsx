import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';
import { KbdChord } from '../badge/Kbd';
import { Dialog, DialogContent, DialogTitle } from '../dialog/Dialog';

/**
 * Command-palette primitives around `cmdk`.
 *
 * `cmdk` owns filtering, roving focus and `aria-activedescendant`; this file
 * only decides that the palette is a dense list of one-line rows with a group
 * caption and a right-aligned chord, because that is the shape a modeller can
 * scan at 200 items without reading.
 */
export const Command = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>) => (
  <CommandPrimitive
    data-slot="command"
    className={cn('flex h-full w-full flex-col overflow-hidden', className)}
    {...props}
  />
);

export interface CommandDialogProps
  extends Omit<ComponentProps<typeof CommandPrimitive>, 'label'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name for the palette; also its only heading. */
  label: string;
  className?: string;
}

/**
 * The palette as a modal.
 *
 * It is anchored near the top rather than centred: a list that grows downward
 * should grow into the empty half of the window, and a centred box would jump
 * every time the query narrowed.
 */
export const CommandDialog = ({
  open,
  onOpenChange,
  label,
  className,
  children,
  ...props
}: CommandDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      showClose={false}
      className={cn(
        'top-[15%] max-w-[560px] translate-y-0 overflow-hidden p-0',
        'border-evidence-border shadow-overlay',
        className,
      )}
    >
      <DialogTitle className="sr-only">{label}</DialogTitle>
      <CommandPrimitive data-slot="command" label={label} {...props}>
        {children}
      </CommandPrimitive>
    </DialogContent>
  </Dialog>
);

export const CommandInput = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>) => (
  <div
    data-slot="command-input-wrapper"
    className="flex h-9 shrink-0 items-center gap-2 border-b border-evidence-line px-3"
  >
    <Search className="size-3.5 shrink-0 text-evidence-muted" />
    <CommandPrimitive.Input
      data-slot="command-input"
      className={cn(
        'h-full w-full bg-transparent text-[12px] text-evidence-ink outline-none',
        'placeholder:text-evidence-muted disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
);

export const CommandList = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List
    data-slot="command-list"
    className={cn(
      'max-h-[380px] min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-1',
      className,
    )}
    {...props}
  />
);

export const CommandEmpty = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>) => (
  <CommandPrimitive.Empty
    data-slot="command-empty"
    className={cn(
      'py-6 text-center text-[11px] text-evidence-muted',
      className,
    )}
    {...props}
  />
);

export const CommandGroup = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Group>) => (
  <CommandPrimitive.Group
    data-slot="command-group"
    className={cn(
      'overflow-hidden text-evidence-ink',
      '[&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1',
      '[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-evidence-muted [&_[cmdk-group-heading]]:uppercase',
      className,
    )}
    {...props}
  />
);

export const CommandItem = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    data-slot="command-item"
    className={cn(
      'flex cursor-default items-center gap-2 rounded px-1.5 py-1 text-[11px] outline-none select-none',
      'data-[selected=true]:bg-evidence-active data-[selected=true]:text-evidence-ink',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
      className,
    )}
    {...props}
  />
);

/** The chord printed at the right edge of a row. */
export const CommandShortcut = ({ chord }: { chord: string }) => (
  <KbdChord chord={chord} className="ml-auto shrink-0" />
);

export const CommandSeparator = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Separator>) => (
  <CommandPrimitive.Separator
    data-slot="command-separator"
    className={cn('my-1 h-px bg-evidence-line', className)}
    {...props}
  />
);

export const CommandLoading = ({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Loading>) => (
  <CommandPrimitive.Loading
    data-slot="command-loading"
    className={cn('px-1.5 py-2 text-[11px] text-evidence-muted', className)}
    {...props}
  />
);
