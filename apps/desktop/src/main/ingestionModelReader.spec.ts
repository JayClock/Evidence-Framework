import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type {
  AgentStreamEvent,
  EvidenceAgentSession,
  EvidenceAgentSessionOptions,
} from '@evidence-poc/evidence-agent-core';

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
  }) as unknown as typeof import('@evidence-poc/evidence-agent-core').createEvidenceAgentSession;
};

describe('reading prose with the configured model', () => {
  it('returns the streamed reply as one string', async () => {
    const log: EvidenceAgentSessionOptions[] = [];
    const workingDirectory = await mkdtemp(path.join(tmpdir(), 'ingestion-test-'));

    const read = createModelIngestionReader({
      sessionFactory: scriptedSession(
        [
          { type: 'text-delta', delta: '```json\n' },
          { type: 'text-delta', delta: '{"modelName":"x"}' },
          { type: 'text-delta', delta: '\n```' },
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

    expect(reply).toContain('modelName');
    expect(log[0]?.instructions).toEqual(['读法']);
  });

  it('reads with no tools and in the caller’s scratch directory', async () => {
    const log: EvidenceAgentSessionOptions[] = [];

    const read = createModelIngestionReader({
      sessionFactory: scriptedSession([{ type: 'agent-settled', aborted: false }], log),
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
          { type: 'text-delta', delta: '读到这里' },
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
