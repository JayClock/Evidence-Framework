import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentPromptResult } from '@evidence-poc/desktop-contracts/agentIpc';
import { installDesktopApi } from '@evidence-poc/desktop-testing/desktopApi';
import { usePiConversation } from './usePiConversation';

const root = '/models/procurement';
const holdPrompt = () => {
  let resolve = (_result: AgentPromptResult): void => undefined;
  const promise = new Promise<AgentPromptResult>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};

describe('usePiConversation', () => {
  it('keeps the turn locked until prompt IPC finishes even after stop/settled', async () => {
    const api = installDesktopApi();
    const { promise, resolve } = holdPrompt();
    const execute = vi.fn(() => promise);
    const { result } = renderHook(() =>
      usePiConversation(api.agent, root, execute),
    );
    let pending!: Promise<AgentPromptResult>;
    act(() => {
      pending = result.current.submit(' 问题 ', { nodeId: 'evidence.payment' });
    });
    expect(execute).toHaveBeenCalledWith(
      { rootPath: root, text: '问题', focus: { nodeId: 'evidence.payment' } },
      expect.any(Function),
    );
    await act(() => result.current.stop());
    expect(api.calls.abort).toEqual([root]);
    act(() =>
      api.agentMock.emitEvent({ type: 'agent-settled', aborted: true }),
    );
    expect(result.current.running).toBe(true);
    expect(await result.current.submit('不能插队')).toMatchObject({
      success: false,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ success: true });
      expect(await pending).toMatchObject({ success: false });
    });
    expect(result.current.running).toBe(false);
    expect(result.current.messages.at(-1)?.status).toEqual({
      type: 'incomplete',
      reason: 'cancelled',
    });
  });

  it('ignores a late IPC result and events after switching projects', async () => {
    const api = installDesktopApi();
    const { promise, resolve } = holdPrompt();
    const execute = () => promise;
    const { result, rerender } = renderHook(
      ({ path }) => usePiConversation(api.agent, path, execute),
      { initialProps: { path: root } },
    );
    act(() => {
      void result.current.submit('旧项目');
    });
    rerender({ path: '/models/next' });
    await act(async () => {
      api.agentMock.emitEvent({ type: 'agent-error', message: '过期事件' });
      resolve({ success: false, error: '过期响应' });
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.running).toBe(false);
  });
});
