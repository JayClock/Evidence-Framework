import { describe, expect, it } from 'vitest';
import { PiTurnMessages } from './piTurnMessages';

const text = (text: string) => ({ type: 'text', text }) as const;
const tool = (toolCallId: string) =>
  ({
    type: 'tool-call',
    toolCallId,
    toolName: 'run_sensors',
    input: { scope: 'context.sales' },
  }) as const;

describe('PiTurnMessages', () => {
  it('replaces provisional parts and joins parallel tool results by call ID', () => {
    const turn = new PiTurnMessages();
    turn.receive({
      type: 'assistant-message',
      done: false,
      parts: [text('核')],
    });
    turn.receive({
      type: 'assistant-message',
      done: true,
      parts: [{ type: 'reasoning', text: '核对来源' }, tool('a'), tool('b')],
    });
    const pending = turn.content();
    turn.receive({
      type: 'tool-call-completed',
      toolCallId: 'b',
      toolName: 'run_sensors',
      output: '失效',
      isError: true,
    });
    turn.receive({
      type: 'tool-call-completed',
      toolCallId: 'a',
      toolName: 'run_sensors',
      output: '通过',
      isError: false,
    });
    const fullText = '答'.repeat(8100);
    turn.receive({
      type: 'assistant-message',
      done: true,
      parts: [text(fullText)],
    });
    expect(turn.content()).toEqual([
      { type: 'reasoning', text: '核对来源' },
      expect.objectContaining({
        toolCallId: 'a',
        argsText: '{"scope":"context.sales"}',
        result: '通过',
        isError: false,
      }),
      expect.objectContaining({
        toolCallId: 'b',
        result: '失效',
        isError: true,
      }),
      text(fullText),
    ]);
    expect(pending[1]).not.toHaveProperty('result');
  });

  it('drops only the failed attempt when Pi retries', () => {
    const turn = new PiTurnMessages();
    turn.receive({
      type: 'assistant-message',
      done: true,
      parts: [text('already complete')],
    });
    turn.receive({
      type: 'assistant-message',
      done: false,
      parts: [text('failed partial')],
    });
    turn.receive({ type: 'agent-error', message: 'retry' });
    expect(turn.content()).toEqual([text('already complete')]);
    turn.receive({
      type: 'assistant-message',
      done: true,
      parts: [text('recovered')],
    });
    expect(turn.failure).toBeNull();
    expect(turn.content()).toEqual([
      text('already complete'),
      text('recovered'),
    ]);
  });
});
