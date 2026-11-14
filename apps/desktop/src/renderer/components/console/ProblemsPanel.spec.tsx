import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SensorIssue } from '@evidence-poc/evidence-agent/browser';

import { ProblemsPanel } from './ProblemsPanel';
import { healthyReport } from '../../test-support/desktopApi';

const issue = (
  overrides: Partial<SensorIssue> & Pick<SensorIssue, 'issueId'>,
): SensorIssue => ({
  severity: 'warn',
  source: 'check_fm',
  code: 'FM_SCOPE_GAP',
  message: '采购协议缺少确认端',
  ...overrides,
});

const report = () =>
  healthyReport({
    passed: false,
    blockCount: 1,
    warnCount: 1,
    infoCount: 1,
    issues: [
      issue({
        issueId: 'block-1',
        severity: 'block',
        message: '采购协议缺少确认端',
        targetNodeId: 'evidence.contract#signed_at',
        suggestion: '补齐履约配对。',
      }),
      issue({ issueId: 'warn-1', severity: 'warn', message: '派生规则重复' }),
      issue({ issueId: 'info-1', severity: 'info', message: '建议补充业务时间' }),
    ],
  });

const setup = (
  overrides: {
    report?: ReturnType<typeof healthyReport> | null;
    stale?: boolean;
    activeIssueId?: string | null;
  } = {},
) => {
  const handlers = {
    onFocusIssue: vi.fn(),
    onRerun: vi.fn(),
    onClose: vi.fn(),
  };

  render(
    <ProblemsPanel
      {...handlers}
      report={overrides.report === undefined ? report() : overrides.report}
      reportStale={overrides.stale ?? false}
      reportLoading={false}
      reportError={null}
      activeIssueId={overrides.activeIssueId ?? null}
    />,
  );

  return handlers;
};

describe('ProblemsPanel', () => {
  it('lists every finding with its severity and code', () => {
    setup();

    expect(screen.getByRole('region', { name: '门禁问题面板' })).toBeVisible();
    expect(screen.getByText('采购协议缺少确认端')).toBeInTheDocument();
    expect(screen.getAllByText(/FM_SCOPE_GAP/).length).toBeGreaterThan(0);
    expect(screen.getByText('全部 3')).toBeInTheDocument();
  });

  it('filters to one severity at a time', () => {
    setup();

    fireEvent.click(screen.getByRole('tab', { name: '警告 1' }));

    expect(screen.getByText('派生规则重复')).toBeInTheDocument();
    expect(screen.queryByText('采购协议缺少确认端')).toBeNull();
    expect(screen.queryByText('建议补充业务时间')).toBeNull();
  });

  it('says so when a severity has nothing to show', () => {
    setup({ report: healthyReport({ issues: [] }) });

    expect(
      screen.getByText('本轮没有发现项。机器检查不等于业务批准。'),
    ).toBeInTheDocument();
  });

  it('locates the object a finding names', () => {
    const handlers = setup();

    fireEvent.click(
      screen.getByRole('button', { name: '定位到 采购协议缺少确认端' }),
    );

    expect(handlers.onFocusIssue).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'block-1' }),
    );
  });

  it('marks the finding the modeler was sent to', () => {
    setup({ activeIssueId: 'warn-1' });

    expect(
      document.querySelector('[data-issue-id="warn-1"]'),
    ).toHaveAttribute('data-active', 'true');
    expect(
      document.querySelector('[data-issue-id="block-1"]'),
    ).toHaveAttribute('data-active', 'false');
  });

  it('says when the verdict no longer describes the model on screen', () => {
    setup({ stale: true });

    expect(screen.getByText('结果已过期')).toBeInTheDocument();
  });

  it('reports a missing run instead of pretending it passed', () => {
    setup({ report: null });

    expect(screen.getAllByText('尚未运行检查器').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('重新检查'));

    expect(screen.getByRole('button', { name: '收合问题面板' })).toBeVisible();
  });
});
