import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { useAgentSession } from './useAgentSession';

const Harness = ({ rootPath }: { rootPath: string }) => {
  const agent = useAgentSession(window.evidenceAPI.agent, rootPath);

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

const holdPrompt = (api: ReturnType<typeof installDesktopApi>) => {
  const prompt = api.agent.prompt;
  let finish: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  api.agent.prompt = async (input) => {
    const result = await prompt(input);
    await pending;
    return result;
  };
  return finish;
};

describe('useAgentSession', () => {
  it('sends a prompt and streams the reply and tool calls', async () => {
    const api = installDesktopApi();
    const finish = holdPrompt(api);

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
    finish();
    await waitFor(() =>
      expect(screen.getByTestId('running')).toHaveTextContent('idle'),
    );
  });

  it('does not start or steer a second turn before the first IPC call finishes', async () => {
    const api = installDesktopApi();
    const finish = holdPrompt(api);
    render(<Harness rootPath="/models/procurement" />);
    fireEvent.click(screen.getByText('提交'));
    act(() =>
      api.agentMock.emitEvent({ type: 'agent-settled', aborted: false }),
    );

    fireEvent.click(screen.getByText('提交'));
    expect(screen.getByTestId('running')).toHaveTextContent('running');
    expect(api.calls.steer).toHaveLength(0);
    expect(api.calls.prompt).toHaveLength(1);
    finish();
    await waitFor(() =>
      expect(screen.getByTestId('running')).toHaveTextContent('idle'),
    );
  });

  it('surfaces a streamed error and ignores unrelated events once idle', async () => {
    const api = installDesktopApi();
    const finish = holdPrompt(api);
    render(<Harness rootPath="/models/procurement" />);
    fireEvent.click(screen.getByText('提交'));
    act(() =>
      api.agentMock.emitEvent({ type: 'agent-error', message: '缺少模型凭据' }),
    );
    expect(screen.getByTestId('error')).toHaveTextContent('缺少模型凭据');
    finish();
    await waitFor(() =>
      expect(screen.getByTestId('running')).toHaveTextContent('idle'),
    );
    act(() =>
      api.agentMock.emitEvent({ type: 'text-delta', delta: '过期回复' }),
    );
    expect(screen.getByTestId('transcript')).toBeEmptyDOMElement();
  });

  it('aborts an active turn through the API', async () => {
    const api = installDesktopApi();
    const finish = holdPrompt(api);
    render(<Harness rootPath="/models/procurement" />);
    fireEvent.click(screen.getByText('提交'));
    fireEvent.click(screen.getByText('停止'));
    expect(api.calls.abort).toEqual(['/models/procurement']);
    finish();
    await waitFor(() =>
      expect(screen.getByTestId('running')).toHaveTextContent('idle'),
    );
  });
});
