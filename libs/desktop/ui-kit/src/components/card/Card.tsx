import { Slot } from '@radix-ui/react-slot';
import type { ComponentProps } from 'react';

import { cn } from '../../utils';

interface CardProps extends ComponentProps<'div'> {
  /** Apply the surface to a semantic child, e.g. a button or an article. */
  asChild?: boolean;
}

export const Card = ({ asChild = false, className, ...props }: CardProps) => {
  const Component = asChild ? Slot : 'div';

  return (
    <Component
      data-slot="card"
      className={cn(
        'rounded-lg border border-workbench-border bg-evidence-panel',
        className,
      )}
      {...props}
    />
  );
};
