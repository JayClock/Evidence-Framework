import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessLegend } from './BusinessLegend';
import { pointOnRoute } from './edgeLabels';

describe('BusinessLegend', () => {
  beforeEach(() => localStorage.clear());
  it('explains actual shapes and edges, remembers expansion, and is excluded from captures', () => {
    const { container, unmount } = render(<BusinessLegend />);
    expect(screen.getByRole('button', { name: '图例说明' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: '图例说明' }));
    expect(screen.getByRole('button', { name: '图例说明' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('虚线：跨业务边界或角色扮演')).toBeVisible();
    expect(screen.queryByText(/法定/)).toBeNull();
    expect(container.firstChild).toHaveAttribute('data-evidence-capture-hide');
    unmount();
    render(<BusinessLegend />);
    expect(screen.getByRole('button', { name: '图例说明' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '图例说明' }));
    expect(screen.getByText('虚线：跨业务边界或角色扮演')).not.toBeVisible();
  });
  it('moves above the composer in a narrow canvas', () => {
    const { container } = render(<BusinessLegend compact />);
    expect(container.firstChild).toHaveClass('top-[76px]', 'max-h-[35%]');
    expect(container.firstChild).not.toHaveClass('bottom-16');
  });

  it('works when preference storage is unavailable', () => {
    const read = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    render(<BusinessLegend />);
    fireEvent.click(screen.getByRole('button', { name: '图例说明' }));
    expect(screen.getByRole('button', { name: '图例说明' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    read.mockRestore();
    write.mockRestore();
  });
});

describe('routed labels', () => {
  it('keeps the label on an asymmetric multi-segment route', () => {
    expect(
      pointOnRoute(
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 20 },
        ],
        0.5,
      ),
    ).toEqual({ x: 60, y: 0 });
    expect(
      pointOnRoute(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        0.5,
      ),
    ).toEqual({ x: 0, y: 0 });
    expect(pointOnRoute([], 0.5)).toEqual({ x: 0, y: 0 });
  });
});
