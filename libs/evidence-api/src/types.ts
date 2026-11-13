import type { ModelDelivery } from './delivery/modelDelivery.js';
import type { Diagnostic } from './diagnostics.js';

export type JsonObject = Record<string, unknown>;

/** Explicitly declared navigation, not inferred runtime permissions or business order. */
export interface ApiJourneyStep {
  id: string;
  roleRef: string;
  routeId: string;
  method: string;
  path: string;
  purpose: string;
  nextPossibleSteps: readonly string[];
}

/** One model-driven contract for previews, exports and downstream consumers. */
export interface EvidenceApiSnapshot
  extends Omit<ModelDelivery, 'schemaVersion'> {
  schemaVersion: '5.1';
  apiId: string;
  journeys: readonly ApiJourneyStep[];
  diagnostics: readonly Diagnostic[];
  digests: {
    model: string;
    design?: string;
    checkReport?: string;
  };
  /** A projection is an authoring artifact, never a claim of release readiness. */
  mode: 'draft';
}
