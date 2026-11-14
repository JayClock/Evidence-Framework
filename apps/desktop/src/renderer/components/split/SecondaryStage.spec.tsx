import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SecondaryStage } from './SecondaryStage';

const setup = (
  overrides: Partial<Parameters<typeof SecondaryStage>[0]> = {},
) => {
  const props = {
    activePane: 'ledger' as const,
    onPaneChange: vi.fn(),
    onRotateDirection: vi.fn(),
    onClose: vi.fn(),
    direction: 'horizontal' as const,
    panes: {
      ledger: <p>台账内容</p>,
      openapi: <p>契约内容</p>,
      cel: <p>规则内容</p>,
      simulation: <p>仿真内容</p>,
    },
    ...overrides,
  };

  return { ...render(<SecondaryStage {...props} />), props };
};

describe('SecondaryStage', () => {
  it('shows one projection at a time and asks for the next one', () => {
    const { props } = setup();

    expect(screen.getByText('台账内容')).toBeInTheDocument();
    expect(screen.queryByText('契约内容')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /交付契约/ }));

    expect(props.onPaneChange).toHaveBeenCalledWith('openapi');
  });

  it('prints the pane badge when the pane has something to report', () => {
    setup({ badges: { openapi: 7 } });

    const tab = screen.getByRole('tab', { name: /交付契约/ });
    expect(tab).toHaveTextContent('7');
  });

  it('rotates, closes and maximises through the rail', () => {
    const { props } = setup();

    fireEvent.click(screen.getByRole('button', { name: '切换分屏方向' }));
    expect(props.onRotateDirection).toHaveBeenCalledTimes(1);

    const stage = screen.getByLabelText('副视口');
    expect(stage.className).not.toContain('fixed');

    fireEvent.click(screen.getByRole('button', { name: '最大化副屏' }));
    expect(screen.getByLabelText('副视口').className).toContain('fixed');
    expect(screen.getByRole('button', { name: '还原分屏' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭分屏' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    // Closing a maximised stage must not leave it covering the canvas.
    expect(screen.getByLabelText('副视口').className).not.toContain('fixed');
  });

  it('names the direction it is laid out in', () => {
    setup({ direction: 'vertical' });

    expect(screen.getByLabelText('副视口')).toHaveAttribute(
      'data-direction',
      'vertical',
    );
  });
});
