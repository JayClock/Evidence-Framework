import type { EvidenceState } from '../../types.ts';
import type {
  DiscoveryContent,
  DiscoveryEntry,
  DiscoveryEvent,
  DiscoverySnapshot,
} from './schema.ts';

export type ReadSource = (root: string, path: string) => Promise<string>;
export interface DiscoveryRepository {
  loadDiscovery(root: string, state: EvidenceState): Promise<DiscoverySnapshot>;
  loadDiscoveryEntries(
    root: string,
    state: EvidenceState,
  ): Promise<DiscoveryEntry[]>;
  appendDiscoveryEvent(
    root: string,
    state: EvidenceState,
    event: DiscoveryEvent,
  ): Promise<void>;
  nextDiscoveryEntry(
    state: EvidenceState,
    event: DiscoveryEvent,
  ): DiscoveryEntry;
  captureSources(
    root: string,
    sources: DiscoveryContent['sources'],
  ): Promise<Record<string, string>>;
  readText: ReadSource;
  saveState(root: string, state: EvidenceState): Promise<void>;
  appendHistory(state: EvidenceState, event: string, detail?: string): void;
}
