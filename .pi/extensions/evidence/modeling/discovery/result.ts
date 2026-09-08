import type { DiscoverySnapshot } from './schema.ts';

// A read-only hand-off of the existing journal, not a new persisted protocol or
// approval. Consumers must still bind artifact digests and human Gate decisions.
export interface FinalizedDiscovery {
  readonly runId: string;
  readonly revision: number;
  readonly journalDigest: string | null;
  readonly snapshot: DiscoverySnapshot;
}
