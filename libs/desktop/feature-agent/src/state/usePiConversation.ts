import type { ThreadMessageLike } from '@assistant-ui/react';
import type {
  AgentPromptInput,
  AgentPromptResult,
  AgentTurnFocus,
  EvidenceAgentApi,
} from '@evidence-poc/desktop-contracts/agentIpc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PiTurnMessages } from './piTurnMessages';

type ExecutePrompt = (
  input: AgentPromptInput,
  isCancelled: () => boolean,
) => Promise<AgentPromptResult>;
type Status = NonNullable<ThreadMessageLike['status']>;

/** One in-flight IPC turn per editor, shared by inquiry and canvas storming. */
export const usePiConversation = (
  api: Pick<EvidenceAgentApi, 'onEvent' | 'abort'>,
  rootPath: string,
  executePrompt: ExecutePrompt,
) => {
  const [messages, setMessages] = useState<readonly ThreadMessageLike[]>([]);
  const [running, setRunning] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const active = useRef<(PiTurnMessages & { id: string }) | null>(null);

  const update = useCallback(
    (turn: PiTurnMessages & { id: string }, status: Status) => {
      const content = turn.content();
      setMessages((current) =>
        current.map((message) =>
          message.id === turn.id ? { ...message, content, status } : message,
        ),
      );
    },
    [],
  );

  useEffect(() => {
    setMessages([]);
    setRunning(false);
    setStopError(null);
    const unsubscribe = api.onEvent(({ rootPath: root, event }) => {
      const turn = active.current;
      if (root !== rootPath || turn === null) return;
      turn.receive(event);
      update(turn, { type: 'running' });
    });
    return () => {
      active.current = null;
      unsubscribe();
    };
  }, [api, rootPath, update]);

  const submit = useCallback(
    async (
      text: string,
      focus?: AgentTurnFocus,
    ): Promise<AgentPromptResult> => {
      const trimmed = text.trim();
      if (!trimmed || active.current)
        return { success: false, error: '请等待当前问询结束并输入业务内容。' };
      const turn = Object.assign(new PiTurnMessages(), {
        id: crypto.randomUUID(),
      });
      active.current = turn;
      setRunning(true);
      setStopError(null);
      setMessages((current) => [
        ...current,
        { id: `${turn.id}:user`, role: 'user', content: trimmed },
        {
          id: turn.id,
          role: 'assistant',
          content: [],
          status: { type: 'running' },
        },
      ]);

      let result: AgentPromptResult;
      try {
        // The live-model bridge supplies editorId/revision and replays any
        // missed transactions before releasing the document write lock.
        result = await executePrompt(
          { rootPath, text: trimmed, focus },
          () => turn.interrupted,
        );
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? error.message : '访谈请求失败。',
        };
      }
      if (active.current !== turn)
        return { success: false, error: '项目已切换。' };
      const error = result.success ? turn.failure : result.error;
      update(
        turn,
        turn.interrupted
          ? { type: 'incomplete', reason: 'cancelled' }
          : error !== null
            ? { type: 'incomplete', reason: 'error', error }
            : { type: 'complete', reason: 'stop' },
      );
      active.current = null;
      setRunning(false);
      if (!result.success) return result;
      if (turn.interrupted) return { success: false, error: '本轮已取消。' };
      return error === null ? result : { success: false, error };
    },
    [executePrompt, rootPath, update],
  );

  const stop = useCallback(async () => {
    const turn = active.current;
    if (turn === null || turn.interrupted) return;
    turn.interrupted = true;
    try {
      const result = await api.abort({ rootPath });
      if (!result.success) throw new Error(result.error);
    } catch (error) {
      if (active.current === turn) {
        turn.interrupted = false;
        setStopError(error instanceof Error ? error.message : '停止请求失败。');
      }
    }
  }, [api, rootPath]);

  const reset = useCallback(() => {
    if (active.current === null) {
      setMessages([]);
      setStopError(null);
    }
  }, []);

  return { messages, running, submit, stop, stopError, reset };
};

export type PiConversation = ReturnType<typeof usePiConversation>;
