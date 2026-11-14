import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

/**
 * The subset of Pi session activity the desktop surfaces.
 *
 * Everything is a plain value so it can cross the IPC boundary unchanged and be
 * asserted in tests without a live model.
 */
export type AgentStreamEvent =
  | { type: 'text-delta'; delta: string }
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
 * Unknown Pi events (thinking deltas, retries, compaction) are dropped here
 * instead of leaking the SDK's event vocabulary into the renderer.
 */
export const projectSessionEvent = (
  event: AgentSessionEvent,
): readonly AgentStreamEvent[] => {
  switch (event.type) {
    case 'message_update': {
      const update = event.assistantMessageEvent;

      return update.type === 'text_delta'
        ? [{ type: 'text-delta', delta: update.delta }]
        : [];
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

      return message.role === 'assistant' &&
        message.stopReason === 'error' &&
        typeof message.errorMessage === 'string'
        ? [{ type: 'agent-error', message: message.errorMessage }]
        : [];
    }

    default:
      return [];
  }
};
