import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';
import { Kbd, KbdChord } from './Kbd';

describe('Badge', () => {
  it('reads as a status word, not a control', () => {
    render(<Badge>3 项发现</Badge>);

    const badge = screen.getByText('3 项发现');

    expect(badge).toHaveAttribute('data-slot', 'badge');
    expect(badge.tagName).toBe('SPAN');
  });

  it('carries the evidence palette for an evidence marker', () => {
    render(<Badge variant="evidence">已确认</Badge>);

    expect(screen.getByText('已确认')).toHaveClass('text-evidence-evidence');
  });
});

describe('Kbd', () => {
  it('renders one cap per key of a chord', () => {
    render(<KbdChord chord="⌘+Shift+K" />);

    expect(screen.getAllByText(/⌘|Shift|K/)).toHaveLength(3);
  });

  it('keeps a single key as a single cap', () => {
    render(<Kbd>Esc</Kbd>);

    expect(screen.getByText('Esc')).toHaveAttribute('data-slot', 'kbd');
  });
});
