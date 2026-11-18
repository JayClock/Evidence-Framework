import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityRail } from './ActivityRail';

describe('ActivityRail', () => {
  it('offers every studio surface as one button', () => {
    render(
      <ActivityRail activeTab={null} ledgerActive={false} onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('navigation', { name: '活动导轨' })).toBeVisible();
    for (const label of [
      '总台账',
      '门禁与诊断',
      '生产漂移',
      'AI 协同',
      '条款审计',
      '共创工作坊',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('marks ledger independently of the active drawer and reports its click', () => {
    const onSelect = vi.fn();

    render(<ActivityRail activeTab="copilot" ledgerActive onSelect={onSelect} />);

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
        activeTab={null}
        ledgerActive={false}
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
