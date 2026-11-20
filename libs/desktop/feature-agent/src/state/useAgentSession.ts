import type {
  AgentActionResult,
  AgentTurnFocus,
  EvidenceAgentApi,
} from '@evidence-poc/desktop-contracts/agentIpc';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentStreamEvent } from '@evidence-poc/evidence-agent/browser';

export interface AgentActivity {
  /** Stable id: the tool call id from the stream. */
  id: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  input: unknown;
  output?: unknown;
}

export interface AgentSessionState {
  running: boolean;
  /** Streamed assistant text of the current run. */
  transcript: string;
  thinking: string;
  thinkingActive: boolean;
  activities: readonly AgentActivity[];
  error: string | null;
  /** Tool currently executing, for the dock's status line. */
  activeToolName: string | null;
}

export interface AgentSessionController {
  state: AgentSessionState;
  /** Starts one turn when idle; reports whether it completed successfully. */
  submit: (text: string, focus?: AgentTurnFocus) => Promise<AgentActionResult>;
  stop: () => Promise<void>;
  dismissError: () => void;
  reset: () => void;
}

const MAX_TRANSCRIPT = 8_000;

const append = (left: string, right: string) =>
  (left + right).slice(-MAX_TRANSCRIPT);

type StreamState = AgentSessionState & {
  finalizedText: string;
  finalizedThinking: string;
};

const reduce = (state: StreamState, event: AgentStreamEvent): StreamState => {
  switch (event.type) {
    case 'text-delta':
      return {
        ...state,
        transcript: append(state.transcript, event.delta),
        thinkingActive: false,
      };
    case 'thinking-delta':
      return {
        ...state,
        thinking: append(state.thinking, event.delta),
        thinkingActive: true,
      };
    case 'assistant-message-ended': {
      const text = append(state.finalizedText, event.text);
      const thinking = append(state.finalizedThinking, event.thinking);
      return {
        ...state,
        finalizedText: text,
        finalizedThinking: thinking,
        transcript: text,
        thinking,
        thinkingActive: false,
        error: null,
      };
    }
    case 'tool-call-started':
      return {
        ...state,
        activeToolName: event.toolName,
        activities: [
          ...state.activities,
          {
            id: event.toolCallId,
            toolName: event.toolName,
            status: 'running',
            input: event.input,
          },
        ],
      };
    case 'tool-call-completed':
      return {
        ...state,
        activeToolName:
          state.activeToolName === event.toolName ? null : state.activeToolName,
        activities: state.activities.map((activity) =>
          activity.id === event.toolCallId
            ? {
                ...activity,
                status: event.isError ? 'failed' : 'completed',
                output: event.output,
              }
            : activity,
        ),
      };
    case 'agent-settled':
      return { ...state, activeToolName: null, thinkingActive: false };
    case 'agent-error':
      return {
        ...state,
        activeToolName: null,
        thinkingActive: false,
        transcript: state.finalizedText,
        thinking: state.finalizedThinking,
        error: event.message,
      };
    default:
      return state;
  }
};

const initialState: StreamState = {
  running: false,
  transcript: '',
  thinking: '',
  thinkingActive: false,
  finalizedText: '',
  finalizedThinking: '',
  activities: [],
  error: null,
  activeToolName: null,
};

/**
 * Owns the renderer side of one Pi conversation.
 *
 * It only reads streamed events; prompts and aborts are main-process
 * calls. The hook therefore works the same whether the model is local or
 * remote, and tests drive it with a scripted event source.
 */
export const useAgentSession = (
  api: Pick<EvidenceAgentApi, 'onEvent' | 'prompt' | 'abort'>,
  rootPath: string,
): AgentSessionController => {
  const [state, setState] = useState<StreamState>(initialState);
  const active = useRef<{
    interrupted: boolean;
    failure: string | null;
  } | null>(null);

  useEffect(() => {
    active.current = null;
    setState(initialState);

    const unsubscribe = api.onEvent((payload) => {
      if (payload.rootPath !== rootPath || active.current === null) return;
      const { event } = payload;
      if (event.type === 'agent-settled' && event.aborted)
        active.current.interrupted = true;
      if (event.type === 'agent-error') active.current.failure = event.message;
      if (event.type === 'assistant-message-ended')
        active.current.failure = null;
      setState((current) => reduce(current, event));
    });

    return () => {
      active.current = null;
      unsubscribe();
    };
  }, [api, rootPath]);

  const submit = useCallback(
    async (text: string, focus?: AgentTurnFocus) => {
      const trimmed = text.trim();
      if (trimmed === '' || active.current !== null)
        return { success: false, error: '请等待当前问询结束并输入业务内容。' };

      const turn = { interrupted: false, failure: null as string | null };
      active.current = turn;
      setState({ ...initialState, running: true });

      try {
        const result = await api.prompt({
          rootPath,
          text: trimmed,
          ...(focus === undefined ? {} : { focus }),
        });
        if (active.current !== turn)
          return { success: false, error: '项目已切换。' };
        if (!result.success) {
          setState((current) => ({ ...current, error: result.error }));
          return result;
        }
        if (turn.failure !== null)
          return { success: false, error: turn.failure };
        return turn.interrupted
          ? { success: false, error: '本轮未完成，可以重试。' }
          : result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '访谈请求失败。';
        if (active.current === turn)
          setState((current) => ({ ...current, error: message }));
        return { success: false, error: message };
      } finally {
        if (active.current === turn) {
          active.current = null;
          setState((current) => ({
            ...current,
            running: false,
            thinkingActive: false,
            activeToolName: null,
          }));
        }
      }
    },
    [api, rootPath],
  );

  const stop = useCallback(async () => {
    const turn = active.current;
    if (turn === null) return;
    turn.interrupted = true;
    try {
      const result = await api.abort({ rootPath });
      if (!result.success) throw new Error(result.error);
    } catch (error) {
      if (active.current === turn) {
        turn.interrupted = false;
        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : '停止请求失败。',
        }));
      }
    }
  }, [api, rootPath]);

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  const reset = useCallback(() => {
    if (active.current === null) setState(initialState);
  }, []);

  return { state, submit, stop, dismissError, reset };
};
