import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';

/**
 * The desktop density ladder, expressed once.
 *
 * A modelling surface packs a lot of chrome into the top half of the window, so
 * the default control is 28px tall instead of the 36-40px a web form uses, and
 * the type scale is 11-13px. Every primitive in this library reads its height
 * from here rather than inventing one.
 */
export const controlVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded border font-[inherit]',
    'select-none transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-evidence-ring',
    'disabled:pointer-events-none disabled:opacity-40',
    '[&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default:
          'border-evidence-accent bg-evidence-accent text-white hover:bg-[#274c76]',
        secondary:
          'border-evidence-line bg-evidence-surface text-evidence-ink hover:bg-evidence-hover',
        outline:
          'border-evidence-line bg-white text-evidence-ink hover:border-evidence-accent hover:bg-evidence-hover',
        ghost:
          'border-transparent bg-transparent text-evidence-muted hover:bg-evidence-hover hover:text-evidence-ink',
        destructive:
          'border-[#fecaca] bg-[#fee2e2] text-[#b42318] hover:bg-[#fecaca]',
      },
      size: {
        xs: 'h-6 px-1.5 text-[11px]',
        sm: 'h-7 px-2 text-[11px]',
        md: 'h-8 px-2.5 text-[13px]',
        icon: 'h-7 w-7 p-0',
        'icon-xs': 'h-6 w-6 p-0',
      },
    },
    defaultVariants: { variant: 'outline', size: 'sm' },
  },
);

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof controlVariants> {
  /** Renders the child element with the button classes instead of a `<button>`. */
  asChild?: boolean;
  /** Keeps the control disabled and shows a spinner after the label. */
  loading?: boolean;
}

const Spinner = () => (
  <span
    aria-hidden="true"
    data-slot="button-spinner"
    className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
  />
);

export const Button = ({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) => {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      data-slot="button"
      data-loading={loading ? 'true' : undefined}
      className={cn(controlVariants({ variant, size }), className)}
      disabled={asChild ? undefined : (disabled ?? loading)}
      aria-busy={loading ? true : undefined}
      {...props}
    >
      {children}
      {loading ? <Spinner /> : null}
    </Component>
  );
};
