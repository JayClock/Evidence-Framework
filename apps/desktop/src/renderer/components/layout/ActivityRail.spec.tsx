import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityRail } from './ActivityRail';

describe('ActivityRail', () => {
  it('offers every studio surface as one button', () => {
    render(<ActivityRail activeTab={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: '活动导轨' })).toBeVisible();
    for (const label of ['业务结构', '门禁与诊断', '场景仿真', 'AI 协同'])
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('marks the open drawer and reports the click', () => {
    const onSelect = vi.fn();

    render(<ActivityRail activeTab="topology" onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: '业务结构' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '场景仿真' }));

    expect(onSelect).toHaveBeenCalledWith('simulation');
  });

  it('prints a blocking count instead of a bare dot', () => {
    render(
      <ActivityRail
        activeTab={null}
        onSelect={vi.fn()}
        badges={{
          diagnostics: { count: 3, tone: 'error' },
          copilot: { tone: 'default' },
        }}
      />,
    );

    expect(
      screen.getByRole('button', { name: '门禁与诊断' }),
    ).toHaveTextContent('3');
    expect(
      screen
        .getByRole('button', { name: 'AI 协同' })
        .querySelectorAll('span[aria-hidden="true"]').length,
    ).toBeGreaterThan(0);
  });
});
