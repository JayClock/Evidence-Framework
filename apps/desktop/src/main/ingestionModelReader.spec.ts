import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  AgentStreamEvent,
  EvidenceAgentSession,
  EvidenceAgentSessionOptions,
} from '@evidence-poc/evidence-agent';

import { createModelIngestionReader } from './ingestionModelReader';

/** A session that answers with a scripted stream and records how it started. */
const scriptedSession = (
  script: readonly AgentStreamEvent[],
  log: EvidenceAgentSessionOptions[],
) => {
  const listeners = new Set<(event: AgentStreamEvent) => void>();

  const session: EvidenceAgentSession = {
    projectRoot: '/tmp/ingestion',
    start: async () => undefined,
    getSession: () => null,
    getSessionFile: () => null,
    prompt: async () => {
      for (const event of script) {
        for (const listener of listeners) {
          listener(event);
        }
      }
    },
    steer: async () => 'handled',
    abort: async () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    dispose: () => undefined,
  };

  return ((options: EvidenceAgentSessionOptions) => {
    log.push(options);
    return session;
  }) as unknown as typeof import('@evidence-poc/evidence-agent').createEvidenceAgentSession;
};

const snapshot = (text: string, done = false): AgentStreamEvent => ({
  type: 'assistant-message',
  parts: [{ type: 'text', text }],
  done,
});

describe('reading prose with the configured model', () => {
  it('injects the same explicit model dependencies as other desktop entry points', async () => {
    const log: EvidenceAgentSessionOptions[] = [];
    const modelOptions = {
      agentDir: '/desktop/ai',
      modelRuntime: {} as never,
      model: { id: 'private' } as never,
      thinkingLevel: 'medium' as const,
    };
    const read = createModelIngestionReader({
      sessionFactory: scriptedSession([snapshot('ok', true)], log),
      workingDirectory: async () => '/tmp/scratch',
      getModelOptions: async () => modelOptions,
    });
    expect(await read({ systemPrompt: 's', userPrompt: 'u' })).toBe('ok');
    expect(log[0]).toMatchObject(modelOptions);
  });
  it('does not create scratch directories or sessions when AI is unconfigured', async () => {
    const log: EvidenceAgentSessionOptions[] = [];
    let scratchCreated = false;
    const read = createModelIngestionReader({
      sessionFactory: scriptedSession([], log),
      workingDirectory: async () => {
        scratchCreated = true;
        return '/tmp/scratch';
      },
      getModelOptions: async () => {
        throw new Error('AI_NOT_CONFIGURED');
      },
    });
    await expect(read({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow(
      'AI_NOT_CONFIGURED',
    );
    expect(scratchCreated).toBe(false);
    expect(log).toEqual([]);
  });
  it('returns the streamed reply as one string', async () => {
    const log: EvidenceAgentSessionOptions[] = [];
    const workingDirectory = await mkdtemp(
      path.join(tmpdir(), 'ingestion-test-'),
    );

    const read = createModelIngestionReader({
      sessionFactory: scriptedSession(
        [
          snapshot('```json\n'),
          snapshot('```json\n{"modelName":"x"}'),
          snapshot('```json\n{"modelName":"x"}\n```', true),
          { type: 'agent-settled', aborted: false },
        ],
        log,
      ),
      workingDirectory: async () => workingDirectory,
    });

    const reply = await read({
      systemPrompt: '读法',
      userPrompt: '### 业务原文',
    });

    expect(reply).toBe('```json\n{"modelName":"x"}\n```');
    expect(log[0]?.instructions).toEqual(['读法']);
  });

  it('reads with no tools and in the caller’s scratch directory', async () => {
    const log: EvidenceAgentSessionOptions[] = [];

    const read = createModelIngestionReader({
      sessionFactory: scriptedSession(
        [{ type: 'agent-settled', aborted: false }],
        log,
      ),
      workingDirectory: async () => '/tmp/scratch',
    });

    await read({ systemPrompt: 's', userPrompt: 'u' });

    // A reading turn may only produce text: a model that starts editing files
    // while reading a contract clause is not reading a contract clause.
    expect(log[0]?.noTools).toBe('all');
    expect(log[0]?.projectRoot).toBe('/tmp/scratch');
  });

  it('surfaces a model error instead of returning a half reply', async () => {
    const log: EvidenceAgentSessionOptions[] = [];

    const read = createModelIngestionReader({
      sessionFactory: scriptedSession(
        [
          snapshot('读到这里'),
          { type: 'agent-error', message: '模型没有配置' },
        ],
        log,
      ),
      workingDirectory: async () => '/tmp/scratch',
    });

    await expect(read({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow(
      '模型没有配置',
    );
  });

  it('gives up on a turn that never settles', async () => {
    const log: EvidenceAgentSessionOptions[] = [];
    const stuck = scriptedSession([], log);
    const neverSettles = ((options: EvidenceAgentSessionOptions) => {
      const session = stuck(options);

      return {
        ...session,
        prompt: () => new Promise<void>(() => undefined),
      };
    }) as unknown as typeof stuck;

    const read = createModelIngestionReader({
      sessionFactory: neverSettles,
      workingDirectory: async () => '/tmp/scratch',
      timeoutMs: 10,
    });

    await expect(read({ systemPrompt: 's', userPrompt: 'u' })).rejects.toThrow(
      '读取超时',
    );
  });
});
