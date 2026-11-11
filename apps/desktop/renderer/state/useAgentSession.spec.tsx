import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installDesktopApi } from '../test-support/desktopApi';
import { useAgentSession } from './useAgentSession';

const Harness = ({ rootPath }: { rootPath: string }) => {
  const agent = useAgentSession(rootPath);

  return (
    <div>
      <p data-testid="running">{agent.state.running ? 'running' : 'idle'}</p>
      <p data-testid="tool">{agent.state.activeToolName ?? 'none'}</p>
      <p data-testid="transcript">{agent.state.transcript}</p>
      <p data-testid="error">{agent.state.error ?? 'none'}</p>
      <ul data-testid="activities">
        {agent.state.activities.map((activity) => (
          <li key={activity.id}>{`${activity.toolName}:${activity.status}`}</li>
        ))}
      </ul>
      <button type="button" onClick={() => void agent.submit('澄清退货履约')}>
        提交
      </button>
      <button type="button" onClick={() => void agent.stop()}>
        停止
      </button>
    </div>
  );
};

describe('useAgentSession', () => {
  it('sends a prompt and streams the reply and tool calls', async () => {
    const api = installDesktopApi();

    render(<Harness rootPath="/models/procurement" />);
    fireEvent.click(screen.getByText('提交'));

    expect(api.calls.prompt).toEqual([
      { rootPath: '/models/procurement', text: '澄清退货履约' },
    ]);

    act(() => {
      api.agentMock.emitEvent({ type: 'text-delta', delta: '退货' });
    });
    expect(screen.getByTestId('transcript')).toHaveTextContent('退货');

    act(() => {
      api.agentMock.emitEvent({
        type: 'tool-call-started',
        toolCallId: 'call-1',
        toolName: 'run_sensors',
        input: {},
      });
    });
    expect(screen.getByTestId('tool')).toHaveTextContent('run_sensors');
    expect(screen.getByTestId('activities')).toHaveTextContent(
      'run_sensors:running',
    );

    act(() => {
      api.agentMock.emitEvent({
        type: 'tool-call-completed',
        toolCallId: 'call-1',
        toolName: 'run_sensors',
        output: {},
        isError: false,
      });
    });
    expect(screen.getByTestId('activities')).toHaveTextContent(
      'run_sensors:completed',
    );
    expect(screen.getByTestId('tool')).toHaveTextContent('none');
  });

  it('steers the live run instead of starting a second one', async () => {
    const api = installDesktopApi();

    render(<Harness rootPath="/models/procurement" />);
    fireEvent.click(screen.getByText('提交'));

    // The main process keeps the invoke pending until the run settles, so the
    // hook still reports the run as active.
    act(() => {
      api.agentMock.emitEvent({
        type: 'tool-call-started',
        toolCallId: 'call-1',
        toolName: 'apply_model_patch',
        input: {},
      });
    });

    fireEvent.click(screen.getByText('提交'));

    expect(api.calls.steer).toHaveLength(1);
    expect(api.calls.prompt).toHaveLength(1);
  });

  it('surfaces a streamed agent error', () => {
    const api = installDesktopApi();

    render(<Harness rootPath="/models/procurement" />);
    act(() => {
      api.agentMock.emitEvent({ type: 'agent-error', message: '缺少模型凭据' });
    });

    expect(screen.getByTestId('error')).toHaveTextContent('缺少模型凭据');
    expect(screen.getByTestId('running')).toHaveTextContent('idle');
  });

  it('stops the run through the api', () => {
    const api = installDesktopApi();

    render(<Harness rootPath="/models/procurement" />);
    fireEvent.click(screen.getByText('停止'));

    expect(api.calls.abort).toEqual(['/models/procurement']);
    expect(screen.getByTestId('running')).toHaveTextContent('idle');
  });

  it('settles to idle when the agent reports it', () => {
    const api = installDesktopApi();

    render(<Harness rootPath="/models/procurement" />);
    act(() => {
      api.agentMock.emitEvent({ type: 'agent-settled', aborted: false });
    });

    expect(screen.getByTestId('running')).toHaveTextContent('idle');
  });
});
