import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ToolActivityItem } from './ToolActivityItem';
import type { AgentActivity } from '../../state/useAgentSession';

const activity = (overrides: Partial<AgentActivity> = {}): AgentActivity => ({
  id: 'call-1',
  toolName: 'run_sensors',
  status: 'completed',
  input: { stage: 'draft' },
  ...overrides,
});

describe('ToolActivityItem', () => {
  it('names the tool in business terms and keeps the raw name adjacent', () => {
    render(<ToolActivityItem activity={activity()} />);

    expect(screen.getByText('运行检查器')).toBeInTheDocument();
    expect(screen.getByText('run_sensors')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('falls back to the raw name when the tool has no title', () => {
    render(
      <ToolActivityItem activity={activity({ toolName: 'describe_thing' })} />,
    );

    expect(screen.getAllByText('describe_thing')).toHaveLength(2);
  });

  it('reveals the input of a call only when asked', () => {
    render(<ToolActivityItem activity={activity()} />);

    expect(screen.queryByText(/"stage": "draft"/)).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText(/"stage": "draft"/)).toBeInTheDocument();
  });

  it('explains a failed call instead of looking identical to a success', () => {
    render(<ToolActivityItem activity={activity({ status: 'failed' })} />);

    const item = screen.getByLabelText('工具调用 run_sensors');

    expect(item).toHaveAttribute('data-activity-status', 'failed');
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('says so when a call carried no input', () => {
    render(<ToolActivityItem activity={activity({ input: undefined })} />);

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('（无入参）')).toBeInTheDocument();
  });
});
