import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewModeSegmentedControl } from './ViewModeSegmentedControl';

describe('ViewModeSegmentedControl', () => {
  it('offers only the two graph layouts and marks the active layout', () => {
    render(<ViewModeSegmentedControl mode="topology" onChange={vi.fn()} />);

    const group = within(screen.getByRole('group', { name: '画布布局' }));
    expect(group.getAllByRole('button')).toHaveLength(2);
    expect(group.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(group.getByRole('button', { name: /业务旅程/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports a graph layout change', () => {
    const onChange = vi.fn();
    render(<ViewModeSegmentedControl mode="journey" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /拓扑图/ }));
    expect(onChange).toHaveBeenCalledWith('topology');
  });
});
