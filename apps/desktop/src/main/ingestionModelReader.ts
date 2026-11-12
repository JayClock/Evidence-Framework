import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createEvidenceAgentSession } from '@evidence-poc/evidence-agent-core';

import type { IngestionTextGenerator } from './ingestionIpc';

/**
 * Reads business prose with the configured model, once, with no tools.
 *
 * Ingestion happens before a project exists, so this runs in a scratch
 * directory: a project the user has not chosen should not grow `.evidence/`
 * files. Tools are off because the only thing this turn may produce is text —
 * a model that starts editing files while reading a contract clause is not
 * reading a contract clause.
 *
 * The reply is assembled from the text stream and returned whole; turning it
 * into a draft stays in one place, shared with the offline reader.
 */
export const createModelIngestionReader = ({
  sessionFactory = createEvidenceAgentSession,
  workingDirectory,
  timeoutMs = 120_000,
}: {
  sessionFactory?: typeof createEvidenceAgentSession;
  workingDirectory?: () => Promise<string>;
  timeoutMs?: number;
} = {}): IngestionTextGenerator => {
  return async ({ systemPrompt, userPrompt }) => {
    const cwd =
      workingDirectory === undefined
        ? await mkdtemp(path.join(tmpdir(), 'evidence-ingestion-'))
        : await workingDirectory();

    const session = sessionFactory({
      projectRoot: cwd,
      instructions: [systemPrompt],
      noTools: 'all',
    });

    let reply = '';
    let failure: string | null = null;

    const unsubscribe = session.subscribe((event) => {
      if (event.type === 'text-delta') {
        reply += event.delta;
      }

      // A subscriber runs inside Pi's dispatch loop, so an error is recorded and
      // rethrown after the turn instead of being thrown into a void.
      if (event.type === 'agent-error') {
        failure = event.message;
      }
    });

    try {
      await session.start();
      await withTimeout(session.prompt(userPrompt), timeoutMs);

      if (failure !== null) {
        throw new Error(failure);
      }

      return reply;
    } finally {
      unsubscribe();
      session.dispose();

      if (workingDirectory === undefined) {
        await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`读取超时（${Math.round(timeoutMs / 1000)} 秒）。`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
