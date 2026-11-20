import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

/**
 * The subset of Pi session activity the desktop surfaces.
 *
 * Everything is a plain value so it can cross the IPC boundary unchanged and be
 * asserted in tests without a live model.
 */
export type AgentStreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'thinking-delta'; delta: string }
  | { type: 'assistant-message-ended'; text: string; thinking: string }
  | {
      type: 'tool-call-started';
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: 'tool-call-completed';
      toolCallId: string;
      toolName: string;
      output: unknown;
      isError: boolean;
    }
  | { type: 'agent-settled'; aborted: boolean }
  | { type: 'agent-error'; message: string };

/**
 * Projects one Pi event onto zero or more desktop stream events.
 *
 * Low-level agent_end is not a terminal event: retries can follow it.
 */
export const projectSessionEvent = (
  event: AgentSessionEvent,
): readonly AgentStreamEvent[] => {
  switch (event.type) {
    case 'message_update': {
      const update = event.assistantMessageEvent;

      if (update.type === 'text_delta')
        return [{ type: 'text-delta', delta: update.delta }];
      if (update.type === 'thinking_delta')
        return [{ type: 'thinking-delta', delta: update.delta }];
      return [];
    }

    case 'tool_execution_start':
      return [
        {
          type: 'tool-call-started',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.args,
        },
      ];

    case 'tool_execution_end':
      return [
        {
          type: 'tool-call-completed',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          output: event.result,
          isError: event.isError,
        },
      ];

    case 'agent_settled':
      return [{ type: 'agent-settled', aborted: event.aborted }];

    case 'message_end': {
      const message = event.message;

      if (message.role !== 'assistant') return [];
      if (message.stopReason === 'error') {
        return [
          {
            type: 'agent-error',
            message: message.errorMessage ?? '模型请求失败。',
          },
        ];
      }
      if (message.stopReason === 'aborted') return [];
      return [
        {
          type: 'assistant-message-ended',
          text: message.content
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join(''),
          thinking: message.content
            .map((part) =>
              part.type === 'thinking' && !part.redacted ? part.thinking : '',
            )
            .join(''),
        },
      ];
    }

    default:
      return [];
  }
};
