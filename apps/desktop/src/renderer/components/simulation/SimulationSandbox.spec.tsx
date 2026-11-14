import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { McpScenarioReplay } from '../../../shared/simulation';
import { installDesktopApi } from '../../test-support/desktopApi';
import { SimulationSandbox } from './SimulationSandbox';

const replay = (): McpScenarioReplay => ({
  modelId: 'procurement',
  passed: true,
  scenarios: [
    {
      scenarioId: 'scenario.payment',
      label: '按期付款',
      stepCount: 2,
      checkpointCount: 1,
      passed: true,
      errors: [],
    },
    {
      scenarioId: 'scenario.overdue',
      label: '逾期未付',
      stepCount: 1,
      checkpointCount: 1,
      passed: false,
      errors: ['scenario.overdue: breached != pending'],
    },
  ],
  frames: [
    {
      sequence: 1,
      actingRoleRef: 'role.buyer',
      instanceRef: 'instance.payment-request',
      entityRef: 'request.payment',
      at: '2026-09-01T09:00:00Z',
      derivations: [
        {
          ruleRef: 'rule.payment-amount',
          target: 'request.payment#amount',
          result: 19900,
        },
      ],
      checkpoints: [],
      fulfillmentStates: [
        { requestInstanceRef: 'instance.payment-request', status: 'pending' },
      ],
    },
    {
      sequence: 2,
      actingRoleRef: 'role.buyer',
      instanceRef: 'instance.payment-confirmation',
      entityRef: 'confirmation.payment',
      at: '2026-09-01T09:10:00Z',
      derivations: [],
      checkpoints: [
        { ruleRef: 'rule.payment-completed', actual: true, passed: true },
      ],
      fulfillmentStates: [
        { requestInstanceRef: 'instance.payment-request', status: 'completed' },
      ],
    },
  ],
  errors: [],
});

describe('SimulationSandbox', () => {
  it('plays a scenario frame by frame and shows the state each step reached', async () => {
    installDesktopApi({ replayResult: replay() });

    render(
      <SimulationSandbox rootPath="/models/procurement" onClose={() => undefined} />,
    );

    expect(await screen.findByText('按期付款')).toBeInTheDocument();
    expect(screen.getByText('逾期未付')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /按期付款/ }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-progress')).toHaveTextContent(
        '第 1 / 2 步',
      );
    });
    expect(screen.getByTestId('fulfillment-instance.payment-request')).toHaveTextContent(
      '待履约',
    );
    expect(screen.getByText('request.payment#amount = 19900')).toBeInTheDocument();

    // The step-forward control is the whole point: the frame before a
    // confirmation must not already show the request as complete.
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await waitFor(() => {
      expect(screen.getByTestId('replay-progress')).toHaveTextContent(
        '第 2 / 2 步',
      );
    });
    expect(screen.getByTestId('fulfillment-instance.payment-request')).toHaveTextContent(
      '已完成',
    );
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
  });

  it('asks for the frames of the scenario the modeler chose', async () => {
    const api = installDesktopApi({ replayResult: replay() });

    render(
      <SimulationSandbox rootPath="/models/procurement" onClose={() => undefined} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /逾期未付/ }));

    await waitFor(() => {
      expect(api.calls.replay).toEqual([
        { rootPath: '/models/procurement' },
        { rootPath: '/models/procurement', scenarioId: 'scenario.overdue' },
      ]);
    });
  });

  it('selects the object a frame instantiates on the canvas', async () => {
    installDesktopApi({ replayResult: replay() });
    const focus = vi.fn();

    render(
      <SimulationSandbox
        rootPath="/models/procurement"
        onClose={() => undefined}
        onFocusEntity={focus}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /按期付款/ }));
    fireEvent.click(await screen.findByRole('button', { name: '在画布定位' }));

    expect(focus).toHaveBeenCalledWith('request.payment');
  });

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
      <SimulationSandbox rootPath="/models/procurement" onClose={() => undefined} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: '生产漂移' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择 trace 文件' }));

    expect(await screen.findByText('派生值被当成人参')).toBeInTheDocument();
    expect(
      screen.getByText('把该字段从写入路径上撤下。'),
    ).toBeInTheDocument();
    expect(screen.getByText('存在阻塞漂移')).toBeInTheDocument();
  });

  it('keeps the previous audit when the file picker is cancelled', async () => {
    const api = installDesktopApi({ traceDialogResult: { canceled: true } });

    render(
      <SimulationSandbox rootPath="/models/procurement" onClose={() => undefined} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: '生产漂移' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择 trace 文件' }));

    await waitFor(() => {
      expect(screen.getByText('还没有比对过任何 trace')).toBeInTheDocument();
    });
    expect(api.calls.drift).toEqual([]);
  });
});

describe('SimulationSandbox in the console', () => {
  it('docks as a region instead of a blocking dialog', () => {
    installDesktopApi({ replayResult: replay() });

    render(
      <SimulationSandbox
        rootPath="/models/procurement"
        onClose={() => undefined}
        embedded
      />,
    );

    expect(screen.getByRole('region', { name: '场景沙盒' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
