import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityDrawer } from './ActivityDrawer';

const setup = (pinned = false) => {
  const onTogglePinned = vi.fn();
  const onClose = vi.fn();

  render(
    <ActivityDrawer
      title="业务结构"
      pinned={pinned}
      onTogglePinned={onTogglePinned}
      onClose={onClose}
    >
      <p>抽屉内容</p>
    </ActivityDrawer>,
  );

  return { onTogglePinned, onClose };
};

describe('ActivityDrawer', () => {
  it('names the panel it wraps', () => {
    setup();

    expect(screen.getByRole('region', { name: '业务结构' })).toBeVisible();
    expect(screen.getByText('抽屉内容')).toBeInTheDocument();
  });

  it('pins and unpins without closing', () => {
    const { onTogglePinned, onClose } = setup();

    const pin = screen.getByRole('button', { name: '固定面板' });

    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);

    expect(onTogglePinned).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from its own header', () => {
    const { onClose } = setup(true);

    fireEvent.click(screen.getByRole('button', { name: '关闭面板' }));

    expect(onClose).toHaveBeenCalled();
  });
});
