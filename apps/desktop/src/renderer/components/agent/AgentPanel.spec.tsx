import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AgentPanel } from './AgentPanel';
import type { AgentSessionController } from '../../state/useAgentSession';

const controller = (
  overrides: Partial<AgentSessionController['state']> = {},
): AgentSessionController => ({
  state: {
    running: false,
    transcript: '',
    activities: [],
    error: null,
    activeToolName: null,
    ...overrides,
  },
  submit: async () => undefined,
  stop: async () => undefined,
  dismissError: () => undefined,
});

const renderPanel = (
  props: Partial<Parameters<typeof AgentPanel>[0]> = {},
) => {
  render(<AgentPanel controller={controller()} {...props} />);
};

describe('AgentPanel', () => {
  it('renders the tool stream with per-call status', () => {
    renderPanel({
      controller: controller({
        activities: [
          {
            id: 'call-1',
            toolName: 'run_sensors',
            status: 'completed',
            input: {},
          },
          {
            id: 'call-2',
            toolName: 'apply_model_patch',
            status: 'failed',
            input: {},
          },
        ],
      }),
    });

    expect(screen.getByText('run_sensors')).toBeInTheDocument();
    expect(screen.getByText('apply_model_patch')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✕')).toBeInTheDocument();
  });

  it('shows the streamed reply and a dismissible error', () => {
    const dismissError = vi.fn();

    renderPanel({
      controller: {
        ...controller({
          transcript: '退货履约同样需要确认端。',
          error: '缺少模型凭据',
        }),
        dismissError,
      },
    });

    expect(screen.getByText('退货履约同样需要确认端。')).toBeInTheDocument();
    expect(screen.getByText('缺少模型凭据')).toBeInTheDocument();

    fireEvent.click(screen.getByText('知道了'));
    expect(dismissError).toHaveBeenCalledTimes(1);
  });
});
