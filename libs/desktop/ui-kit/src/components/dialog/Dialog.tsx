import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';
import { X } from 'lucide-react';

import { cn } from '../../utils';

/**
 * Modal shell.
 *
 * Radix owns focus trapping, `Escape` and the portal; this file only names the
 * chrome. The motion lives in `styles.css` keyframes because Tailwind v4 has no
 * `animate-in` utilities without the plugin, and a dialog that appears without
 * a fade reads as a layout glitch rather than a layer above the model.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    data-slot="dialog-overlay"
    className={cn(
      'fixed inset-0 z-50 bg-evidence-ink/25 backdrop-blur-[1px]',
      'data-[state=open]:animate-[evidence-fade-in_120ms_ease-out]',
      'data-[state=closed]:animate-[evidence-fade-out_100ms_ease-in]',
      className,
    )}
    {...props}
  />
);

export const DialogContent = ({
  className,
  children,
  showClose = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  /** The command palette draws its own header and keeps the corner free. */
  showClose?: boolean;
}) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn(
        'fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
        'rounded-lg border border-evidence-line bg-white shadow-overlay',
        'data-[state=open]:animate-[evidence-zoom-in_130ms_ease-out]',
        'data-[state=closed]:animate-[evidence-zoom-out_100ms_ease-in]',
        className,
      )}
      {...props}
    >
      {children}
      {showClose ? (
        <DialogPrimitive.Close
          aria-label="关闭"
          className="absolute top-2.5 right-2.5 rounded p-1 text-evidence-muted outline-none hover:bg-evidence-hover hover:text-evidence-ink focus-visible:ring-2 focus-visible:ring-evidence-ring"
        >
          <X className="size-3.5" />
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
);

export const DialogHeader = ({
  className,
  ...props
}: ComponentProps<'div'>) => (
  <div
    data-slot="dialog-header"
    className={cn('flex flex-col gap-0.5 px-4 pt-3.5 pb-2', className)}
    {...props}
  />
);

export const DialogFooter = ({
  className,
  ...props
}: ComponentProps<'div'>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      'flex items-center justify-end gap-1.5 border-t border-evidence-line px-4 py-2.5',
      className,
    )}
    {...props}
  />
);

export const DialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    data-slot="dialog-title"
    className={cn('text-[13px] font-medium text-evidence-ink', className)}
    {...props}
  />
);

export const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    data-slot="dialog-description"
    className={cn('text-[11px] text-evidence-muted', className)}
    {...props}
  />
);
