import type { EntityAST } from '@evidence-poc/evidence-schema';

/** The local business facts that participate in a step's cache identity. */
export interface StepFingerprintInput {
  readonly entityId: string;
  readonly entityKind: EntityAST['kind'];
  readonly actingRoleRef?: string;
  readonly asOf: string;
  readonly basedOn: readonly string[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly derivedAssertions?: Readonly<Record<string, unknown>>;
}

/** A declared example's deterministic business-fact snapshot, not a test run. */
export interface FlowStepTrace extends StepFingerprintInput {
  readonly sequence: number;
  /** SHA-256 fingerprint, independent of sequence and presentation metadata. */
  readonly stepHash: string;
  readonly entityLabel: string;
  readonly contextRef?: string;
  readonly responsibleRoleRef?: string;
  readonly exampleLabel: string;
  /** Entity/attribute gaps from a caller-supplied FM check report. */
  readonly gaps: readonly string[];
}

/** A business flow in causal order, with time and example-ref tie breakers. */
export interface FlowScenarioTrace {
  readonly flowId: string;
  /** The declared flow ID; the model does not declare a separate flow title. */
  readonly flowTitle: string;
  readonly involvedContextRefs: readonly string[];
  readonly involvedRoleRefs: readonly string[];
  readonly steps: readonly FlowStepTrace[];
  /** Fingerprint of the ordered, concatenated step hashes. */
  readonly traceDigest: string;
}
