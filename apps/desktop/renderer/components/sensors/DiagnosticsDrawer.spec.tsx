import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiagnosticsDrawer } from './DiagnosticsDrawer';
import { healthyReport } from '../../test-support/desktopApi';
import type { SensorReport } from '@evidence-poc/evidence-modeling-orchestrator/browser';

const blockedReport = (overrides: Partial<SensorReport> = {}): SensorReport =>
  healthyReport({
    passed: false,
    blockCount: 1,
    warnCount: 1,
    infoCount: 0,
    isStageGateReady: false,
    issues: [
      {
        issueId: 'check_fm:FM_INCONSISTENT:1',
        severity: 'block',
        source: 'check_fm',
        code: 'FM_INCONSISTENT',
        message: 'request.payment 缺少确认端',
        targetNodeId: 'request.payment',
        suggestion: '补齐履约配对。',
      },
      {
        issueId: 'audit_key_data:KEY_DATA_DECISION_OWED:2',
        severity: 'warn',
        source: 'audit_key_data',
        code: 'KEY_DATA_DECISION_OWED',
        message: 'request.payment#expired_at 尚未给出提供方结论',
      },
    ],
    keyDataSummary: {
      totalItems: 4,
      resolvedCount: 3,
      decisionOwedCount: 1,
      unresolvedItems: [
        {
          path: 'request.payment#expired_at',
          meaning: '付款截止时间',
        },
      ],
    },
    ...overrides,
  });

describe('DiagnosticsDrawer', () => {
  it('lists findings with severity, source and the owed key data', () => {
    render(
      <DiagnosticsDrawer
        report={blockedReport()}
        onClose={() => undefined}
        onFocusIssue={() => undefined}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent?.includes('阻塞 1 · 警告 1 · 提示 0') === true,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('request.payment 缺少确认端')).toBeInTheDocument();
    expect(screen.getByText('阻塞')).toBeInTheDocument();
    expect(screen.getByText('警告')).toBeInTheDocument();
    expect(
      screen.getByText('check_fm · FM_INCONSISTENT · request.payment'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('关键数据待决 1 项，阶段门禁保持关闭。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('request.payment#expired_at：付款截止时间'),
    ).toBeInTheDocument();
  });

  it('jumps to the issue target on click', () => {
    const onFocusIssue = vi.fn();

    render(
      <DiagnosticsDrawer
        report={blockedReport()}
        onClose={() => undefined}
        onFocusIssue={onFocusIssue}
      />,
    );

    fireEvent.click(screen.getByText('request.payment 缺少确认端'));

    expect(onFocusIssue).toHaveBeenCalledWith(
      expect.objectContaining({ targetNodeId: 'request.payment' }),
    );
  });

  it('says there is nothing rather than inventing a finding', () => {
    render(
      <DiagnosticsDrawer
        report={healthyReport()}
        onClose={() => undefined}
        onFocusIssue={() => undefined}
      />,
    );

    expect(screen.getByText('本轮没有发现项。')).toBeInTheDocument();
  });

  it('closes through the header button', () => {
    const onClose = vi.fn();

    render(
      <DiagnosticsDrawer
        report={blockedReport()}
        onClose={onClose}
        onFocusIssue={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText('收起'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
