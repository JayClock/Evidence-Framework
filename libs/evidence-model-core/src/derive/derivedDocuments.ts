import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  buildTimeline,
  type EvidenceTimeline,
  type TimelineSummary,
  timelineSummary,
} from '../validation/timeline.js';
import { analyzeTraceability, type TraceabilityDocument } from '../validation/traceability.js';
import { simulateValidationSuite, type SimulationReport } from '../validation/simulation.js';
import type { ValidationSuite } from '../validation/validationSuite.js';

/**
 * The derived documents the FM guides ask for.
 *
 * Each one is a projection of the checked model, never a second source: the
 * model JSON stays the only truth, and a generated file can be deleted and
 * rebuilt at any time. They are built from the objects the checks decided on,
 * not from a second parse of the same files.
 */

export interface DerivedInputs {
  model: DomainModelDocument;
  suite: ValidationSuite;
}

/** Attribute lineage: which attribute each CEL read comes from. */
export const derivedTraceability = (model: DomainModelDocument): TraceabilityDocument =>
  analyzeTraceability(model).document;

/** The deterministic evidence timeline and its summary. */
export const derivedTimeline = ({
  model,
  suite,
}: DerivedInputs): { timeline: EvidenceTimeline; summary: TimelineSummary; errors: readonly string[] } => {
  const { timeline, errors } = buildTimeline(model, suite);

  return { timeline, summary: timelineSummary(timeline), errors };
};

/** Scenario execution, or the static errors that stopped it. */
export const derivedSimulation = (
  { model, suite }: DerivedInputs,
  scenarioIds?: readonly string[],
): { report: SimulationReport; errors: readonly string[] } =>
  simulateValidationSuite(model, suite, scenarioIds);
