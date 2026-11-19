import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityRail } from './ActivityRail';

const closed = {
  ledger: false,
  diagnostics: false,
  copilot: false,
  directory: false,
};

describe('ActivityRail', () => {
  it('offers every studio surface as one button', () => {
    render(<ActivityRail pressed={closed} onSelect={vi.fn()} />);

    const rail = screen.getByRole('navigation', { name: '活动导轨' });
    expect(rail).toBeVisible();
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['总台账', '门禁与诊断', 'AI 协同', '实体目录']);
  });

  it('marks ledger independently of the active drawer and reports its click', () => {
    const onSelect = vi.fn();

    render(
      <ActivityRail
        pressed={{ ...closed, ledger: true, copilot: true }}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByRole('button', { name: 'AI 协同' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const ledger = screen.getByRole('button', { name: '总台账' });
    expect(ledger).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(ledger);

    expect(onSelect).toHaveBeenCalledWith('ledger');
  });

  it('prints a blocking count instead of a bare dot', () => {
    render(
      <ActivityRail
        pressed={closed}
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
