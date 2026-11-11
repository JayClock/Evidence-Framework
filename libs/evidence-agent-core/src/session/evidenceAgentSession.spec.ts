import { describe, expect, it, vi } from 'vitest';

import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

import {
  createEvidenceAgentSession,
  type PiSdkPort,
} from './evidenceAgentSession.js';
import { projectSessionEvent } from './streamEvents.js';

type Listener = (event: AgentSessionEvent) => void;

const createFakeSdk = () => {
  const listeners = new Set<Listener>();
  const prompts: string[] = [];
  const steers: string[] = [];
  const reloads: number[] = [];
  const loaderOptions: unknown[] = [];
  const createdOptions: unknown[] = [];
  let aborts = 0;
  let disposed = 0;

  const session = {
    sessionManager: {
      getSessionFile: () => '/home/modeler/.pi/agent/sessions/x.jsonl',
    },
    prompt: async (text: string) => {
      prompts.push(text);
    },
    steer: async (text: string) => {
      steers.push(text);

      return 'queued' as const;
    },
    abort: async () => {
      aborts += 1;
    },
    dispose: () => {
      disposed += 1;
      listeners.clear();
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };

  const sdk: PiSdkPort = {
    getAgentDir: () => '/home/modeler/.pi/agent',
    createResourceLoader: (options) => {
      loaderOptions.push(options);

      return {
        reload: async () => {
          reloads.push(reloads.length + 1);
        },
      };
    },
    createSessionManager: (cwd, sessionDirectory) => ({
      cwd,
      sessionDirectory,
    }),
    openSessionManager: (sessionFile) => ({ sessionFile }),
    createAgentSession: async (options) => {
      createdOptions.push(options);

      return { session: session as never };
    },
  };

  return {
    sdk,
    session,
    prompts,
    steers,
    reloads,
    loaderOptions,
    createdOptions,
    emit: (event: AgentSessionEvent) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    get aborts() {
      return aborts;
    },
    get disposed() {
      return disposed;
    },
  };
};

describe('projectSessionEvent', () => {
  it('keeps text deltas and drops unrelated assistant updates', () => {
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
        assistantMessageEvent: { type: 'thinking_delta' } as never,
      }),
    ).toEqual([]);
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

describe('createEvidenceAgentSession', () => {
  it('loads the project skill tree and creates the session once', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: fake.sdk,
    });

    await session.start();
    await session.start();

    expect(fake.reloads).toHaveLength(1);
    expect(fake.loaderOptions).toEqual([
      {
        cwd: '/workspace/project',
        agentDir: '/home/modeler/.pi/agent',
        skillDirectories: ['/workspace/project/.agents/skills'],
      },
    ]);
    expect(fake.createdOptions).toEqual([
      {
        cwd: '/workspace/project',
        resourceLoader: { reload: expect.any(Function) },
        sessionManager: {
          cwd: '/workspace/project',
          sessionDirectory: undefined,
        },
      },
    ]);
  });

  it('passes custom tools and a session directory through', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sessionDirectory: '/home/modeler/.pi/sessions/evidence',
      customTools: [{ name: 'run_sensors' } as never],
      tools: ['read', 'run_sensors'],
      sdk: fake.sdk,
    });

    await session.start();

    expect(fake.createdOptions).toEqual([
      {
        cwd: '/workspace/project',
        resourceLoader: { reload: expect.any(Function) },
        sessionManager: {
          cwd: '/workspace/project',
          sessionDirectory: '/home/modeler/.pi/sessions/evidence',
        },
        customTools: [{ name: 'run_sensors' }],
        tools: ['read', 'run_sensors'],
      },
    ]);
  });

  it('resumes a branch transcript instead of creating a new one', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sessionFile: '/workspace/project/.evidence/branches/br-a/session.jsonl',
      sdk: fake.sdk,
    });

    await session.start();

    expect(fake.createdOptions).toEqual([
      {
        cwd: '/workspace/project',
        resourceLoader: { reload: expect.any(Function) },
        sessionManager: {
          sessionFile: '/workspace/project/.evidence/branches/br-a/session.jsonl',
        },
      },
    ]);
  });

  it('reports the transcript file the session persists to', async () => {
    const fake = createFakeSdk();
    const before = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: fake.sdk,
    });

    expect(before.getSessionFile()).toBeNull();

    await before.start();

    expect(before.getSessionFile()).toBe('/home/modeler/.pi/agent/sessions/x.jsonl');
  });

  it('streams projected events to subscribers', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: fake.sdk,
    });
    const received: unknown[] = [];
    const unsubscribe = session.subscribe((event) => received.push(event));

    await session.start();
    fake.emit({
      type: 'message_update',
      message: { role: 'assistant' } as never,
      assistantMessageEvent: { type: 'text_delta', delta: '合同' } as never,
    });
    fake.emit({
      type: 'tool_execution_start',
      toolCallId: 'call-9',
      toolName: 'apply_model_patch',
      args: { commands: [] },
    });
    unsubscribe();
    fake.emit({ type: 'agent_settled', aborted: false });

    expect(received).toEqual([
      { type: 'text-delta', delta: '合同' },
      {
        type: 'tool-call-started',
        toolCallId: 'call-9',
        toolName: 'apply_model_patch',
        input: { commands: [] },
      },
    ]);
  });

  it('prompts, steers and aborts through the live session', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: fake.sdk,
    });

    await session.prompt('澄清退货履约');
    await expect(session.steer('运费由买方承担')).resolves.toBe('queued');
    await session.abort();

    expect(fake.prompts).toEqual(['澄清退货履约']);
    expect(fake.steers).toEqual(['运费由买方承担']);
    expect(fake.aborts).toBe(1);
  });

  it('does not abort before the session exists', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: fake.sdk,
    });

    await session.abort();

    expect(fake.aborts).toBe(0);
  });

  it('disposes the SDK session and stops streaming', async () => {
    const fake = createFakeSdk();
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: fake.sdk,
    });
    const received: unknown[] = [];
    session.subscribe((event) => received.push(event));

    await session.start();
    session.dispose();
    fake.emit({ type: 'agent_settled', aborted: false });

    expect(fake.disposed).toBe(1);
    expect(session.getSession()).toBeNull();
    expect(received).toEqual([]);
  });

  it('retries the starter after a failed initialization', async () => {
    const fake = createFakeSdk();
    const createAgentSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('no model'))
      .mockResolvedValueOnce({ session: fake.session as never });
    const session = createEvidenceAgentSession({
      projectRoot: '/workspace/project',
      sdk: { ...fake.sdk, createAgentSession },
    });

    await expect(session.start()).rejects.toThrow('no model');
    await session.start();

    expect(createAgentSession).toHaveBeenCalledTimes(2);
  });
});
