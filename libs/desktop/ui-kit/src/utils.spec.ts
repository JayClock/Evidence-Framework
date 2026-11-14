import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('drops falsy conditionals', () => {
    expect(cn('px-2', false, null, undefined, 'text-[11px]')).toBe(
      'px-2 text-[11px]',
    );
  });

  it('lets the caller override a component utility', () => {
    expect(cn('border border-evidence-line', 'border-evidence-accent')).toBe(
      'border border-evidence-accent',
    );
  });
});
