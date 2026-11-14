import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins conditional class names and lets the last Tailwind utility win.
 *
 * Components accept a `className` override, so a caller that narrows a border
 * or a padding must not fight the component's own utilities in the cascade.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
