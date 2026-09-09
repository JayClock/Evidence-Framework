import { vi } from 'vitest';
import { REQUIREMENTS_PATH } from '../../contracts/paths.ts';
import { digestText } from '../../modeling/digest.ts';
import type { DiscoveryRepository } from '../../modeling/discovery/ports.ts';
import { projectDiscovery } from '../../modeling/discovery/replay.ts';
import { createResolutionChecks } from '../../modeling/discovery/resolutions.ts';
import {
  initialDiscovery,
  type DiscoveryEntry,
} from '../../modeling/discovery/schema.ts';
import { createDiscoveryService } from '../../modeling/discovery/service.ts';
import type { EvidenceState } from '../../types.ts';
import { discoveryContent, fixtureSubmission } from './discovery-fixtures.ts';

// Synthetic, in-memory state; intentionally imports neither Pi nor production I/O.
export function memoryModeling() {
  const root = '/synthetic-modeling';
  const now = '2026-01-01T00:00:00.000Z';
  const state: EvidenceState = {
    version: 6,
    runId: 'headless-test',
    projectName: '合成测试',
    goal: '验证建模服务边界',
    phase: 'modeling',
    status: 'running',
    execution: null,
    paused: false,
    round: 1,
    currentArtifactIndex: 0,
    pendingGate: null,
    feedback: null,
    lastReport: null,
    lastError: null,
    discovery: initialDiscovery(),
    modeling: {
      applicable: null,
      rationale: null,
      files: [],
      machineValidated: false,
      simulationPassed: null,
    },
    coding: {
      storyIds: [],
      currentStoryIndex: 0,
      changedFiles: [],
      baseline: null,
      planDigest: null,
      cycles: [],
      verifications: [],
      revisionStart: 0,
      records: {},
      tdd: { stage: 'red', binding: null, red: null, green: null },
    },
    history: [],
    createdAt: now,
    updatedAt: now,
  };
  const entries: DiscoveryEntry[] = [];
  const sources = new Map([
    [REQUIREMENTS_PATH, '合成输入：正常、边界和异常均按已声明的身份规则判断。'],
  ]);
  const readText = vi.fn(
    async (_root: string, path: string) => sources.get(path) ?? '',
  );
  const { markChangedResolutionSources } = createResolutionChecks(readText);
  const repository: DiscoveryRepository = {
    readText,
    loadDiscoveryEntries: async () => structuredClone(entries),
    loadDiscovery: async () => {
      const snapshot = projectDiscovery(state.runId, entries);
      await markChangedResolutionSources(root, snapshot);
      return snapshot;
    },
    nextDiscoveryEntry: (current, event) => ({
      version: 6,
      runId: current.runId,
      revision: current.discovery.revision + 1,
      previousDigest: current.discovery.digest,
      recordedAt: now,
      event,
    }),
    appendDiscoveryEvent: async (_root, current, event) => {
      const entry = repository.nextDiscoveryEntry(
        current,
        structuredClone(event),
      );
      projectDiscovery(current.runId, [...entries, entry]);
      entries.push(entry);
      current.discovery = {
        ...current.discovery,
        revision: entry.revision,
        path: `synthetic/revision-${entry.revision}.json`,
        digest: digestText(`${JSON.stringify(entry, null, 2)}\n`),
      };
    },
    captureSources: async (_root, refs) =>
      Object.fromEntries(
        [REQUIREMENTS_PATH, ...refs.map((ref) => ref.path)].map((path) => [
          path,
          digestText(sources.get(path) ?? ''),
        ]),
      ),
    saveState: vi.fn(async () => undefined),
    appendHistory: vi.fn(),
  };
  const service = createDiscoveryService(repository);
  async function consolidate() {
    const snapshot = await repository.loadDiscovery(root, state);
    await service.appendDiscoveryRecords(
      root,
      state,
      fixtureSubmission(discoveryContent(), snapshot),
    );
  }
  return { root, state, sources, entries, repository, service, consolidate };
}
