import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewModeSegmentedControl } from './ViewModeSegmentedControl';

describe('ViewModeSegmentedControl', () => {
  it('marks the current surface as pressed', () => {
    render(<ViewModeSegmentedControl mode="table" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /总台账/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /拓扑图/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the surface the modeler picked', () => {
    const onChange = vi.fn();

    render(<ViewModeSegmentedControl mode="graph" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /分屏/ }));

    expect(onChange).toHaveBeenCalledWith('split');
  });
});
