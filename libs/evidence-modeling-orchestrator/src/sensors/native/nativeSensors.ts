import type {
  ScenarioResult,
  SimulationReport,
} from '@evidence-poc/evidence-model-core';

import {
  buildSensorReport,
  type KeyDataAuditReport,
} from '../sensorReport.js';
import type { SensorOutcome } from '../sensorsEngine.js';

import { loadModelSources, runNativeFmCheck } from './modelSources.js';
import { runNativeKeyDataAudit } from './nativeKeyDataAudit.js';

/**
 * The native sensor set, in one pass over one model read.
 *
 * The document, the validation suite and the digest are loaded once, so every
 * sensor describes the same bytes. That is what makes a fresh verdict comparable
 * with a saved one.
 */

export interface NativeSensorsInput {
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  /** Context IDs to completeness-check; omitted means consistency only. */
  scopeRefs?: readonly string[];
  signal?: AbortSignal;
  /** Skip the second digest read, which a debounced background run does not need. */
  detectInputChange?: boolean;
  /** Injected clock, so a report's timestamp is reproducible in a test. */
  now?: () => Date;
}

export interface NativeSensorsOutcome extends SensorOutcome {
  /** Scenario rows, so a caller can show what executed and what it asserted. */
  scenarioResults: readonly ScenarioResult[];
  simulation: SimulationReport | null;
}

/** The scenario rows the desktop shows beside the verdict. */
export const scenarioResultsOf = (
  simulation: SimulationReport | null,
): readonly ScenarioResult[] => simulation?.scenarioResults ?? [];

/**
 * Runs the whole native sensor set and folds the reports into one verdict.
 *
 * The model is the only input: there is no interview record to reconcile, so a
 * verdict describes what the sources say and nothing else.
 */
export const runNativeSensors = async (
  input: NativeSensorsInput,
): Promise<NativeSensorsOutcome> => {
  const sources = await loadModelSources(input.modelRoot);
  const { report: fmCheck, traceability, simulation } = await runNativeFmCheck(
    sources,
    {
      ...(input.scopeRefs === undefined ? {} : { scopeRefs: input.scopeRefs }),
      ...(input.detectInputChange === false ? { detectInputChange: false } : {}),
    },
  );
  const keyData = runNativeKeyDataAudit(sources.model, traceability);

  const report = buildSensorReport({
    fmCheck,
    ...(keyData === undefined ? {} : { keyData }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  return {
    report,
    fmCheck,
    ...(keyData === undefined ? {} : { keyData: keyData as KeyDataAuditReport }),
    scenarioResults: scenarioResultsOf(simulation),
    simulation,
  };
};
