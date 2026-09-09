import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { fmPaths } from './paths.js';

export interface ExecutionState {
  id: string;
  sessionId: string | null;
  inputRevision: number;
  startedAt: string;
}

export interface ModelState {
  version: 1;
  runId: string;
  revision: number;
  lastAppliedRevision: number;
  modelRevision: number;
  modelDigest: string | null;
  activeQuestionId: string | null;
  execution: ExecutionState | null;
  stopRequested: boolean;
  stoppedAt: string | null;
  lastDiagnostic: string | null;
}

export type ModelEvent =
  | { kind: 'input-recorded'; sourceId: 'INPUT'; text: string }
  | {
      kind: 'question-asked';
      questionId: string;
      gapKey: string;
      prompt: string;
      impact: string;
      sourceRefs: string[];
    }
  | { kind: 'answer-recorded'; answerId: string; questionId: string; text: string }
  | {
      kind: 'model-published';
      modelRevision: number;
      appliedThroughRevision: number;
      modelDigest: string;
      changedFiles: string[];
      sourceRefs: string[];
      validation: { machineValidated: true; simulationPassed: boolean | null };
    }
  | {
      kind: 'model-publication-failed';
      stage: string;
      diagnostic: string;
      unappliedRevisions: number[];
    }
  | { kind: 'model-noop'; appliedThroughRevision: number; modelDigest: string; sourceRefs: string[] }
  | {
      kind: 'interaction-stopped';
      requestedAt: string;
      lastModelRevision: number;
      lastAppliedRevision: number;
      unappliedRevisions: number[];
    };

export interface EventEnvelope {
  version: 1;
  runId: string;
  revision: number;
  previousDigest: string | null;
  createdAt: string;
  event: ModelEvent;
  digest: string;
}

export interface StateStoreOptions {
  now?: () => Date;
  renameFile?: typeof rename;
}

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function eventPath(root: string, runId: string, revision: number): string {
  return resolve(
    fmPaths(root).runs,
    runId,
    'events',
    `revision-${String(revision).padStart(6, '0')}.json`,
  );
}

async function atomicWrite(path: string, content: string, renameFile: typeof rename): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await renameFile(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function immutableWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function assertState(value: unknown): asserts value is ModelState {
  if (!value || typeof value !== 'object') throw new Error('FM state is not an object');
  const state = value as Partial<ModelState>;
  if (state.version !== 1) throw new Error(`Unsupported FM state version: ${String(state.version)}`);
  if (typeof state.runId !== 'string' || !Number.isInteger(state.revision)) {
    throw new Error('Invalid FM state');
  }
}

export class StateStore {
  private readonly now: () => Date;
  private readonly renameFile: typeof rename;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly root: string,
    options: StateStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.renameFile = options.renameFile ?? rename;
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async loadState(): Promise<ModelState | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(fmPaths(this.root).state, 'utf8'));
      assertState(parsed);
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async saveState(state: ModelState): Promise<void> {
    await atomicWrite(
      fmPaths(this.root).state,
      `${JSON.stringify(state, null, 2)}\n`,
      this.renameFile,
    );
  }

  async createRun(runId: string, text: string): Promise<ModelState> {
    return this.serial(async () => {
      if (!text.trim()) throw new Error('需求不能为空');
      const existing = await this.loadState();
      if (existing && !existing.stoppedAt) throw new Error('已有 FM Modeling Run');
      const state: ModelState = {
        version: 1,
        runId,
        revision: 0,
        lastAppliedRevision: 0,
        modelRevision: 0,
        modelDigest: null,
        activeQuestionId: null,
        execution: null,
        stopRequested: false,
        stoppedAt: null,
        lastDiagnostic: null,
      };
      const created = await this.appendUnlocked(state, 0, {
        kind: 'input-recorded',
        sourceId: 'INPUT',
        text,
      });
      return created.state;
    });
  }

  async appendEvent(
    expectedRevision: number,
    event: ModelEvent,
    update: (state: ModelState) => ModelState = (state) => state,
  ): Promise<{ state: ModelState; envelope: EventEnvelope }> {
    return this.serial(async () => {
      const state = await this.loadState();
      if (!state) throw new Error('没有活动的 FM Modeling Run');
      return this.appendUnlocked(state, expectedRevision, event, update);
    });
  }

  private async appendUnlocked(
    current: ModelState,
    expectedRevision: number,
    event: ModelEvent,
    update: (state: ModelState) => ModelState = (state) => state,
  ): Promise<{ state: ModelState; envelope: EventEnvelope }> {
    if (current.revision !== expectedRevision) {
      throw new Error(`Revision conflict: expected ${expectedRevision}, current ${current.revision}`);
    }
    const previous = expectedRevision === 0 ? null : await this.readEvent(current.runId, expectedRevision);
    const unsigned = {
      version: 1 as const,
      runId: current.runId,
      revision: expectedRevision + 1,
      previousDigest: previous?.digest ?? null,
      createdAt: this.now().toISOString(),
      event,
    };
    const envelope: EventEnvelope = { ...unsigned, digest: digest(unsigned) };
    await immutableWrite(
      eventPath(this.root, current.runId, envelope.revision),
      `${JSON.stringify(envelope, null, 2)}\n`,
    );
    const state = update({ ...current, revision: envelope.revision });
    await this.saveState(state);
    return { state, envelope };
  }

  async readEvent(runId: string, revision: number): Promise<EventEnvelope> {
    const source = await readFile(eventPath(this.root, runId, revision), 'utf8');
    let parsed: EventEnvelope;
    try {
      parsed = JSON.parse(source) as EventEnvelope;
    } catch (error) {
      throw new Error(`Invalid event JSON at revision ${revision}`, { cause: error });
    }
    if (parsed.version !== 1 || parsed.runId !== runId || parsed.revision !== revision) {
      throw new Error(`Invalid event envelope at revision ${revision}`);
    }
    const { digest: actual, ...unsigned } = parsed;
    if (digest(unsigned) !== actual) throw new Error(`Event digest mismatch at revision ${revision}`);
    return parsed;
  }

  async readEvents(state: ModelState): Promise<EventEnvelope[]> {
    const events: EventEnvelope[] = [];
    let previousDigest: string | null = null;
    for (let revision = 1; revision <= state.revision; revision += 1) {
      const event = await this.readEvent(state.runId, revision);
      if (event.previousDigest !== previousDigest) {
        throw new Error(`Event chain mismatch at revision ${revision}`);
      }
      events.push(event);
      previousDigest = event.digest;
    }
    return events;
  }

  async recover(): Promise<{ state: ModelState | null; events: EventEnvelope[] }> {
    const state = await this.loadState();
    if (!state) return { state: null, events: [] };
    return { state, events: await this.readEvents(state) };
  }
}

export function createRunId(now = new Date()): string {
  return `FM-${now.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
