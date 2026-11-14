import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';

/**
 * A panel that slides over the model instead of replacing it.
 *
 * The rail answers one field at a time; a contract with forty fields needs the
 * other question on a screen wide enough to hold columns. A sheet keeps the
 * canvas mounted underneath, so stepping back is a dismissal, not a route.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    data-slot="sheet-overlay"
    className={cn(
      'fixed inset-0 z-50 bg-evidence-ink/20',
      'data-[state=open]:animate-[evidence-fade-in_120ms_ease-out]',
      'data-[state=closed]:animate-[evidence-fade-out_100ms_ease-in]',
      className,
    )}
    {...props}
  />
);

const sheetVariants = cva(
  'fixed z-50 flex flex-col gap-0 border-evidence-line bg-white shadow-overlay',
  {
    variants: {
      side: {
        right:
          'inset-y-0 right-0 h-full w-full max-w-2xl border-l data-[state=open]:animate-[evidence-slide-in-right_160ms_ease-out] data-[state=closed]:animate-[evidence-slide-out-right_140ms_ease-in]',
        left: 'inset-y-0 left-0 h-full w-full max-w-md border-r data-[state=open]:animate-[evidence-slide-in-left_160ms_ease-out] data-[state=closed]:animate-[evidence-slide-out-left_140ms_ease-in]',
        bottom:
          'inset-x-0 bottom-0 max-h-[80vh] w-full border-t data-[state=open]:animate-[evidence-slide-in-bottom_160ms_ease-out] data-[state=closed]:animate-[evidence-slide-out-bottom_140ms_ease-in]',
        top: 'inset-x-0 top-0 max-h-[80vh] w-full border-b data-[state=open]:animate-[evidence-slide-in-top_160ms_ease-out] data-[state=closed]:animate-[evidence-slide-out-top_140ms_ease-in]',
      },
    },
    defaultVariants: { side: 'right' },
  },
);

export interface SheetContentProps
  extends ComponentProps<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  showClose?: boolean;
}

export const SheetContent = ({
  className,
  children,
  side = 'right',
  showClose = true,
  ...props
}: SheetContentProps) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      data-slot="sheet-content"
      data-side={side}
      className={cn(sheetVariants({ side }), className)}
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
  </SheetPortal>
);

export const SheetHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="sheet-header"
    className={cn(
      'flex shrink-0 flex-col gap-0.5 border-b border-evidence-line px-4 py-3 pr-10',
      className,
    )}
    {...props}
  />
);

export const SheetBody = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="sheet-body"
    className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-3', className)}
    {...props}
  />
);

export const SheetFooter = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    data-slot="sheet-footer"
    className={cn(
      'flex shrink-0 items-center justify-end gap-1.5 border-t border-evidence-line px-4 py-2.5',
      className,
    )}
    {...props}
  />
);

export const SheetTitle = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    data-slot="sheet-title"
    className={cn('text-[13px] font-medium text-evidence-ink', className)}
    {...props}
  />
);

export const SheetDescription = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    data-slot="sheet-description"
    className={cn('text-[11px] text-evidence-muted', className)}
    {...props}
  />
);
