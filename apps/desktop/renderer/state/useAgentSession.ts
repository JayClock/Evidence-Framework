import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentStreamEvent } from '@evidence-poc/evidence-agent-core';

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
  activities: readonly AgentActivity[];
  error: string | null;
  /** Tool currently executing, for the dock's status line. */
  activeToolName: string | null;
}

export interface AgentSessionController {
  state: AgentSessionState;
  /** Prompts when idle; steers the live run when busy. */
  submit: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  dismissError: () => void;
}

const MAX_TRANSCRIPT = 8_000;

const reduce = (
  state: AgentSessionState,
  event: AgentStreamEvent,
): AgentSessionState => {
  switch (event.type) {
    case 'text-delta':
      return {
        ...state,
        transcript: (state.transcript + event.delta).slice(-MAX_TRANSCRIPT),
      };
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
      return { ...state, running: false, activeToolName: null };
    case 'agent-error':
      return {
        ...state,
        running: false,
        activeToolName: null,
        error: event.message,
      };
    default:
      return state;
  }
};

const initialState: AgentSessionState = {
  running: false,
  transcript: '',
  activities: [],
  error: null,
  activeToolName: null,
};

/**
 * Owns the renderer side of one Pi conversation.
 *
 * It only reads streamed events; prompts, steers and aborts are main-process
 * calls. The hook therefore works the same whether the model is local or
 * remote, and tests drive it with a scripted event source.
 */
export const useAgentSession = (rootPath: string): AgentSessionController => {
  const [state, setState] = useState<AgentSessionState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(initialState);

    const unsubscribe = window.evidenceAPI.agent.onEvent(({ event }) => {
      setState((current) => reduce(current, event));
    });

    return unsubscribe;
  }, [rootPath]);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();

      if (trimmed === '') {
        return;
      }

      setState((current) => ({
        ...current,
        error: null,
        ...(current.running ? {} : { transcript: '', activities: [] }),
        running: true,
        activeToolName: current.running ? current.activeToolName : null,
      }));

      try {
        if (stateRef.current.running) {
          const result = await window.evidenceAPI.agent.steer({
            rootPath,
            text: trimmed,
          });

          if (result.success === false) {
            setState((current) => ({ ...current, error: result.error }));
          }

          return;
        }

        const result = await window.evidenceAPI.agent.prompt({
          rootPath,
          text: trimmed,
        });

        if (result.success === false) {
          setState((current) => ({
            ...current,
            running: false,
            error: result.error,
          }));
        }
      } catch (error) {
        setState((current) => ({
          ...current,
          running: false,
          error: error instanceof Error ? error.message : '访谈请求失败。',
        }));
      } finally {
        setState((current) => ({
          ...current,
          running: false,
          activeToolName: null,
        }));
      }
    },
    [rootPath],
  );

  const stop = useCallback(async () => {
    await window.evidenceAPI.agent.abort({ rootPath });
    setState((current) => ({
      ...current,
      running: false,
      activeToolName: null,
    }));
  }, [rootPath]);

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
  }, []);

  return { state, submit, stop, dismissError };
};
