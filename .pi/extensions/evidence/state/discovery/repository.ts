import { resolve } from 'node:path';
import { Value } from 'typebox/value';
import { digestText } from '../../modeling/digest.ts';
import type { DiscoveryRepository } from '../../modeling/discovery/ports.ts';
import {
  emptyDiscovery,
  projectDiscovery,
} from '../../modeling/discovery/replay.ts';
import { createResolutionChecks } from '../../modeling/discovery/resolutions.ts';
import {
  DiscoveryEntrySchema,
  DiscoverySnapshotSchema,
  type DiscoveryEntry,
  type DiscoveryEvent,
  type DiscoverySnapshot,
} from '../../modeling/discovery/schema.ts';
import {
  appendHistory,
  appendTextAtomic,
  readText,
  saveState,
  writeJsonAtomic,
} from '../../storage.ts';
import type { EvidenceState } from '../../types.ts';
import { captureSources } from './sources.ts';
const { markChangedResolutionSources } = createResolutionChecks(readText);

const locks = new Map<string, Promise<void>>();
export async function withModelingLock<T>(
  root: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = resolve(root);
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const tail = previous.then(() => held);
  locks.set(key, tail);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(key) === tail) locks.delete(key);
  }
}

export function discoveryPath(
  state: EvidenceState,
  revision = state.discovery.revision,
): string {
  return `artifacts/02-modeling/discovery/${state.runId}/revision-${revision}.json`;
}

export function discoveryEvidencePaths(state: EvidenceState): string[] {
  return Array.from({ length: state.discovery.revision }, (_, i) =>
    discoveryPath(state, i + 1),
  );
}

export async function loadDiscoveryEntries(
  root: string,
  state: EvidenceState,
): Promise<DiscoveryEntry[]> {
  if (!state.discovery.path) {
    if (state.discovery.revision !== 0 || state.discovery.digest !== null)
      throw new Error('发现记录路径与当前运行不一致');
    return [];
  }
  if (state.discovery.path !== discoveryPath(state))
    throw new Error('发现记录路径与当前运行不一致');
  const entries: DiscoveryEntry[] = [];
  let digest = state.discovery.digest;
  for (let revision = state.discovery.revision; revision > 0; revision--) {
    const raw = await readText(root, discoveryPath(state, revision));
    if (digestText(raw) !== digest)
      throw new Error('发现记录摘要不一致，请恢复记录或重新初始化');
    let entry: unknown;
    try {
      entry = JSON.parse(raw);
    } catch {
      throw new Error('发现记录不是有效 JSON');
    }
    if (
      entry &&
      typeof entry === 'object' &&
      'version' in entry &&
      entry.version !== 5
    )
      throw new Error('仅支持发现记录 v5，不迁移旧日志；请由人工重新初始化');
    if (
      !Value.Check(DiscoveryEntrySchema, entry) ||
      entry.runId !== state.runId ||
      entry.revision !== revision
    )
      throw new Error('发现记录结构或运行版本不一致');
    entries.push(entry);
    digest = entry.previousDigest;
  }
  if (digest !== null) throw new Error('发现历史链起点无效');
  return entries.reverse();
}

export async function loadDiscovery(
  root: string,
  state: EvidenceState,
): Promise<DiscoverySnapshot> {
  const entries = await loadDiscoveryEntries(root, state);
  const snapshot = entries.length
    ? projectDiscovery(state.runId, entries)
    : emptyDiscovery(state.runId);
  if (!Value.Check(DiscoverySnapshotSchema, snapshot))
    throw new Error('发现投影超限或格式无效');
  await markChangedResolutionSources(root, snapshot);
  return snapshot;
}

export function discoveryViewPath(state: EvidenceState): string {
  return `.evidence/cache/discovery/${state.runId}/current.json`;
}

// One disposable read cache, never a business source or a Gate input. All
// validation/recovery replays the journal, ignoring any cached bytes.
export async function refreshDiscoveryView(
  root: string,
  state: EvidenceState,
  snapshot?: DiscoverySnapshot,
): Promise<DiscoverySnapshot> {
  const view = snapshot ?? (await loadDiscovery(root, state));
  await writeJsonAtomic(root, discoveryViewPath(state), {
    kind: 'derived-discovery-view',
    journalPath: state.discovery.path,
    journalDigest: state.discovery.digest,
    ...view,
  });
  return view;
}

export function nextDiscoveryEntry(
  state: EvidenceState,
  event: DiscoveryEvent,
): DiscoveryEntry {
  return {
    version: 5,
    runId: state.runId,
    revision: state.discovery.revision + 1,
    previousDigest: state.discovery.digest,
    recordedAt: new Date().toISOString(),
    event,
  };
}

export async function appendDiscoveryEvent(
  root: string,
  state: EvidenceState,
  event: DiscoveryEvent,
): Promise<void> {
  const entry = nextDiscoveryEntry(state, event);
  if (!Value.Check(DiscoveryEntrySchema, entry))
    throw new Error('发现记录超限或格式无效，未保存');
  const snapshot = projectDiscovery(state.runId, [
    ...(await loadDiscoveryEntries(root, state)),
    entry,
  ]);
  if (!Value.Check(DiscoverySnapshotSchema, snapshot))
    throw new Error('发现投影超限或格式无效，未保存');
  await markChangedResolutionSources(root, snapshot);
  const text = `${JSON.stringify(entry, null, 2)}\n`;
  const path = discoveryPath(state, entry.revision);
  await appendTextAtomic(root, path, text);
  state.discovery = {
    ...state.discovery,
    revision: entry.revision,
    path,
    digest: digestText(text),
  };
  appendHistory(
    state,
    'discovery_appended',
    `${entry.revision}: ${event.kind}`,
  );
  await saveState(root, state);
  await refreshDiscoveryView(root, state, snapshot);
}
export const fileDiscoveryRepository: DiscoveryRepository = {
  loadDiscovery,
  loadDiscoveryEntries,
  appendDiscoveryEvent,
  nextDiscoveryEntry,
  captureSources,
  readText,
  saveState,
  appendHistory,
};
