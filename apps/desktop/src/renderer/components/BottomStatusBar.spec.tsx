import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DomainGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import type { ValidationResult } from '@evidence-poc/evidence-schema';

import { BottomStatusBar } from './BottomStatusBar';
import { healthyReport } from '../test-support/desktopApi';

const layout = {
  nodes: [],
  fulfillmentGroups: [],
  contextGroups: [],
  omittedContextIds: [],
} as unknown as DomainGraphLayout;

const valid: ValidationResult = { valid: true, issues: [] };

const renderBar = (
  props: Partial<Parameters<typeof BottomStatusBar>[0]> = {},
) => {
  const onToggleDiagnostics = vi.fn();
  const onRerunSensors = vi.fn();

  render(
    <BottomStatusBar
      layout={layout}
      validation={valid}
      report={healthyReport()}
      sensorLoading={false}
      sensorError={null}
      diagnosticsOpen={false}
      onToggleDiagnostics={onToggleDiagnostics}
      onRerunSensors={onRerunSensors}
      dirty={false}
      savedAt={null}
      saveError={null}
      externalChangeAt={null}
      onReload={() => undefined}
      onDismissExternalChange={() => undefined}
      {...props}
    />,
  );

  return { onToggleDiagnostics, onRerunSensors };
};

describe('BottomStatusBar sensor summary', () => {
  it('never presents an old revision as ready for release', () => {
    renderBar({
      reportStale: true,
      report: healthyReport({ isStageGateReady: true }),
    });
    expect(screen.getByText('检查结果已过期')).toBeInTheDocument();
    expect(screen.queryByText('门禁：可交下游')).toBeNull();
  });

  it('distinguishes API review gaps from ledger decisions', () => {
    renderBar({
      report: healthyReport({
        apiSummary: {
          totalRoutes: 4,
          coverageRatio: 0.5,
          uncoveredEntities: ['evidence.pending'],
          breakingChangeCount: 1,
          hasBaseline: true,
          modelDigest: 'digest',
        },
      }),
    });
    expect(screen.getByText('门禁：等待 API 契约审查')).toBeInTheDocument();
    expect(screen.getByText('API 4 路由 · 覆盖 50%')).toBeInTheDocument();
  });
  it('keeps the gate closed while key data still owes a decision', () => {
    renderBar({
      report: healthyReport({
        warnCount: 2,
        keyDataSummary: {
          totalItems: 3,
          resolvedCount: 1,
          decisionOwedCount: 2,
          unresolvedItems: [],
        },
      }),
    });

    expect(screen.getByText('门禁：等待台账决议')).toBeInTheDocument();
    expect(screen.getByText('警告 2')).toBeInTheDocument();
  });

  it('says the checker is unavailable instead of reporting success', () => {
    renderBar({
      report: healthyReport({
        passed: false,
        blockCount: 2,
        unavailableSensors: ['check_fm', 'audit_key_data'],
      }),
    });

    expect(screen.getByText('检查器不可用')).toBeInTheDocument();
    expect(screen.getByText('阻塞 2')).toBeInTheDocument();
  });

  it('opens the diagnostics drawer from the summary', () => {
    const { onToggleDiagnostics } = renderBar();

    fireEvent.click(screen.getByTitle('展开检查结果'));

    expect(onToggleDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('reruns the sensors on demand', () => {
    const { onRerunSensors } = renderBar();

    fireEvent.click(screen.getByText('重新检查'));

    expect(onRerunSensors).toHaveBeenCalledTimes(1);
  });

  it('shows a run failure with a retry instead of a stale verdict', () => {
    renderBar({ report: null, sensorError: '传感器引擎未能读取模型目录' });

    expect(screen.getByText('传感器引擎未能读取模型目录')).toBeInTheDocument();
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  it('reports that the checker has not run yet', () => {
    renderBar({ report: null });

    expect(screen.getByText('尚未运行检查器')).toBeInTheDocument();
  });
});
