import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-evidence-accent text-white',
        secondary:
          'border-evidence-line bg-evidence-surface text-evidence-muted',
        outline: 'border-evidence-line bg-white text-evidence-muted',
        evidence:
          'border-evidence-evidence/30 bg-[#fdf3f1] text-evidence-evidence',
        participant:
          'border-evidence-participant/30 bg-[#eef5f0] text-evidence-participant',
        role: 'border-evidence-role/30 bg-[#faf4e6] text-evidence-role',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

export interface BadgeProps
  extends ComponentProps<'span'>,
    VariantProps<typeof badgeVariants> {}

/** A short, non-interactive status word: counts, staleness, contract kinds. */
export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span
    data-slot="badge"
    className={cn(badgeVariants({ variant }), className)}
    {...props}
  />
);
