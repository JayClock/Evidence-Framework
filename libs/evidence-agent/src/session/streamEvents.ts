import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

type AssistantPart =
  | { type: 'text' | 'reasoning'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };

/** Browser-safe snapshots without provider metadata or redacted reasoning. */
export type AgentStreamEvent =
  | {
      type: 'assistant-message';
      parts: readonly AssistantPart[];
      done: boolean;
    }
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

/** Project Pi's snapshots rather than rebuilding text from deltas in the UI. */
export const projectSessionEvent = (
  event: AgentSessionEvent,
): readonly AgentStreamEvent[] => {
  switch (event.type) {
    case 'message_update':
    case 'message_end': {
      const { message } = event;
      if (message.role !== 'assistant') return [];
      const done = event.type === 'message_end';
      if (done && message.stopReason === 'error')
        return [
          {
            type: 'agent-error',
            message: message.errorMessage ?? '模型请求失败。',
          },
        ];
      if (done && message.stopReason === 'aborted') return [];
      const parts = message.content.flatMap<AssistantPart>((part) => {
        if (part.type === 'text') return [{ type: 'text', text: part.text }];
        if (part.type === 'thinking' && !part.redacted)
          return [{ type: 'reasoning', text: part.thinking }];
        if (part.type === 'toolCall' && part.id && part.name)
          return [
            {
              type: 'tool-call',
              toolCallId: part.id,
              toolName: part.name,
              input: part.arguments,
            },
          ];
        return [];
      });
      return [{ type: 'assistant-message', parts, done }];
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

    // Low-level agent_end is not terminal: Pi may retry after it.
    case 'agent_settled':
      return [{ type: 'agent-settled', aborted: event.aborted }];

    default:
      return [];
  }
};
