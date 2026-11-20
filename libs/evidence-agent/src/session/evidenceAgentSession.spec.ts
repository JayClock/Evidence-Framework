import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ModelRuntime,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import {
  createEvidenceAgentSession,
  openEvidenceSessionRuntime,
} from './evidenceAgentSession.js';
import { projectSessionEvent } from './streamEvents.js';

describe('projectSessionEvent', () => {
  it('projects separate text and thinking deltas', () => {
    expect(
      projectSessionEvent({
        type: 'message_update',
        message: { role: 'assistant' } as never,
        assistantMessageEvent: {
          type: 'text_delta',
          delta: '先说履约',
        } as never,
      }),
    ).toEqual([{ type: 'text-delta', delta: '先说履约' }]);

    expect(
      projectSessionEvent({
        type: 'message_update',
        message: { role: 'assistant' } as never,
        assistantMessageEvent: {
          type: 'thinking_delta',
          delta: '核对来源',
        } as never,
      }),
    ).toEqual([{ type: 'thinking-delta', delta: '核对来源' }]);
  });

  it('projects final text and unredacted thinking from message_end', () => {
    expect(
      projectSessionEvent({
        type: 'message_end',
        message: {
          role: 'assistant',
          stopReason: 'stop',
          content: [
            { type: 'thinking', thinking: 'hidden', redacted: true },
            { type: 'thinking', thinking: 'reason' },
            { type: 'text', text: 'answer' },
          ],
        } as never,
      }),
    ).toEqual([
      { type: 'assistant-message-ended', text: 'answer', thinking: 'reason' },
    ]);
  });

  it('maps tool execution to started and completed events', () => {
    expect(
      projectSessionEvent({
        type: 'tool_execution_start',
        toolCallId: 'call-1',
        toolName: 'run_sensors',
        args: { scope: 'context.purchase' },
      }),
    ).toEqual([
      {
        type: 'tool-call-started',
        toolCallId: 'call-1',
        toolName: 'run_sensors',
        input: { scope: 'context.purchase' },
      },
    ]);

    expect(
      projectSessionEvent({
        type: 'tool_execution_end',
        toolCallId: 'call-1',
        toolName: 'run_sensors',
        result: { passed: false },
        isError: false,
      }),
    ).toEqual([
      {
        type: 'tool-call-completed',
        toolCallId: 'call-1',
        toolName: 'run_sensors',
        output: { passed: false },
        isError: false,
      },
    ]);
  });

  it('surfaces settled runs and assistant failures', () => {
    expect(
      projectSessionEvent({ type: 'agent_settled', aborted: true }),
    ).toEqual([{ type: 'agent-settled', aborted: true }]);

    expect(
      projectSessionEvent({
        type: 'message_end',
        message: {
          role: 'assistant',
          stopReason: 'error',
          errorMessage: '缺少模型凭据',
        } as never,
      }),
    ).toEqual([{ type: 'agent-error', message: '缺少模型凭据' }]);
  });

  it('ignores events the desktop does not render', () => {
    expect(projectSessionEvent({ type: 'turn_start' })).toEqual([]);
    expect(projectSessionEvent({ type: 'agent_start' })).toEqual([]);
  });
});

describe('native Evidence sessions', () => {
  const withOptions = async (
    run: (
      options: Parameters<typeof openEvidenceSessionRuntime>[0],
    ) => Promise<void>,
  ) => {
    const root = await mkdtemp(path.join(tmpdir(), 'evidence-sdk-'));
    try {
      await run({
        projectRoot: root,
        agentDir: root,
        modelRuntime: await ModelRuntime.create({
          authPath: path.join(root, 'auth.json'),
          allowModelNetwork: false,
        }),
        inMemory: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };

  it('loads only application tools and replaces the default coding prompt', () =>
    withOptions(async (options) => {
      const session = createEvidenceAgentSession({
        ...options,
        instructions: ['Explicit product prompt'],
        extensionFactories: [
          (pi) =>
            pi.registerTool({
              name: 'evidence_read',
              label: 'Read evidence',
              description: 'Read evidence',
              parameters: { type: 'object', properties: {} },
              execute: async () => ({ content: [], details: {} }),
            }),
        ],
      });
      try {
        await Promise.all([session.start(), session.start()]);
        expect(session.getSession()?.systemPrompt).toContain(
          'Explicit product prompt',
        );
        expect(session.getSession()?.getActiveToolNames()).toEqual([
          'evidence_read',
        ]);
        expect(session.getSessionFile()).toBeNull();
      } finally {
        await session.dispose();
      }
    }));

  it('forks at an SDK history entry and abandons later context', () =>
    withOptions(async (options) => {
      const runtime = await openEvidenceSessionRuntime(options);
      try {
        const previous = runtime.session;
        const manager = previous.sessionManager;
        const point = manager.appendMessage({
          role: 'user',
          content: 'retained',
          timestamp: 1,
        });
        manager.appendMessage({
          role: 'user',
          content: 'abandoned',
          timestamp: 2,
        });
        await expect(
          runtime.fork(point, { position: 'at' }),
        ).resolves.toMatchObject({ cancelled: false });
        expect(runtime.session).not.toBe(previous);
        expect(runtime.session.messages).toEqual([
          { role: 'user', content: 'retained', timestamp: 1 },
        ]);
      } finally {
        await runtime.dispose();
      }
    }));

  it('cannot publish a session after disposal during lazy startup', () =>
    withOptions(async (options) => {
      const session = createEvidenceAgentSession(options);
      const started = expect(session.start()).rejects.toThrow('会话已关闭');
      await session.dispose();
      await started;
      expect(session.getSession()).toBeNull();
    }));
});
