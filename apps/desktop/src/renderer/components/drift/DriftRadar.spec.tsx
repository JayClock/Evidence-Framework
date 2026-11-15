import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installDesktopApi } from '../../test-support/desktopApi';
import { DriftRadar } from './DriftRadar';

describe('DriftRadar', () => {
  it('shows the drift findings a trace produced, with their remedy', async () => {
    installDesktopApi({
      traceDialogResult: { canceled: false, path: '/traces/checkout.json' },
      driftResult: {
        modelId: 'procurement',
        spanCount: 6,
        commitCount: 2,
        counts: { DERIVED_VALUE_SUPPLIED: 1 },
        findings: [
          {
            kind: 'DERIVED_VALUE_SUPPLIED',
            severity: 'block',
            message: '服务直接写入了派生字段 request.payment#amount。',
            evidenceRef: 'request.payment',
            contextRef: 'context.payment',
            remediation: '把该字段从写入路径上撤下。',
          },
        ],
        passed: false,
        errors: [],
      },
    });

    render(
      <DriftRadar rootPath="/models/procurement" onClose={() => undefined} />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: '选择 trace 文件' }),
    );

    expect(await screen.findByText('派生值被当成人参')).toBeInTheDocument();
    expect(screen.getByText('把该字段从写入路径上撤下。')).toBeInTheDocument();
    expect(screen.getByText('存在阻塞漂移')).toBeInTheDocument();
  });

  it('keeps the previous audit when the file picker is cancelled', async () => {
    const api = installDesktopApi({ traceDialogResult: { canceled: true } });

    render(
      <DriftRadar rootPath="/models/procurement" onClose={() => undefined} />,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: '选择 trace 文件' }),
    );

    await waitFor(() => {
      expect(screen.getByText('还没有比对过任何 trace')).toBeInTheDocument();
    });
    expect(api.calls.drift).toEqual([]);
  });
});

describe('DriftRadar in the console', () => {
  it('docks as a region instead of a blocking dialog', () => {
    installDesktopApi();

    render(
      <DriftRadar
        rootPath="/models/procurement"
        onClose={() => undefined}
        embedded
      />,
    );

    expect(
      screen.getByRole('region', { name: '生产漂移' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
