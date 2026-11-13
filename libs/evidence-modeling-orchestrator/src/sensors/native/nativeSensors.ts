import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { checkNativeApiSensor } from './nativeApiSensor.js';
import type {
  ScenarioResult,
  SimulationReport,
} from '@evidence-poc/evidence-model-core';

import {
  buildSensorReport,
  finalizeSensorReport,
  type KeyDataAuditReport,
} from '../sensorReport.js';
import type { SensorOutcome } from '../sensorsEngine.js';

import {
  loadModelSources,
  modelSourcesFromDocument,
  runNativeFmCheck,
} from './modelSources.js';
import { runNativeKeyDataAudit } from './nativeKeyDataAudit.js';

/**
 * The native sensor set, in one pass over one model read.
 *
 * The document, the validation suite and the digest are loaded once, so every
 * sensor describes the same bytes. That is what makes a fresh verdict comparable
 * with a saved one.
 */

export interface NativeSensorsInput {
  document?: DomainModelDocument;
  baseDocument?: DomainModelDocument;
  apiMode?: 'draft' | 'release';
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
  input.signal?.throwIfAborted();
  const sources =
    input.document === undefined
      ? await loadModelSources(input.modelRoot)
      : modelSourcesFromDocument(input.document);
  const {
    report: fmCheck,
    traceability,
    simulation,
  } = await runNativeFmCheck(sources, {
    ...(input.scopeRefs === undefined ? {} : { scopeRefs: input.scopeRefs }),
    ...(input.detectInputChange === false ? { detectInputChange: false } : {}),
  });
  const keyData = runNativeKeyDataAudit(sources.model, traceability);

  const baseReport = buildSensorReport({
    fmCheck,
    ...(keyData === undefined ? {} : { keyData }),
    ...(input.now === undefined ? {} : { now: input.now }),
  });

  input.signal?.throwIfAborted();
  let report = baseReport;
  try {
    const api = checkNativeApiSensor({
      currentDocument: sources.model,
      ...(input.baseDocument === undefined
        ? {}
        : { baseDocument: input.baseDocument }),
      ...(input.apiMode === undefined ? {} : { mode: input.apiMode }),
    });
    report = finalizeSensorReport({
      ...baseReport,
      issues: [...baseReport.issues, ...api.issues],
      apiSummary: api.summary,
      ...(input.now === undefined ? {} : { now: input.now }),
    });
  } catch (error) {
    report = finalizeSensorReport({
      ...baseReport,
      issues: [
        ...baseReport.issues,
        {
          issueId: 'audit_api:SENSOR_UNAVAILABLE',
          source: 'audit_api',
          severity: 'block',
          code: 'SENSOR_UNAVAILABLE',
          message: `API 分析不可用: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      unavailableSensors: [...baseReport.unavailableSensors, 'audit_api'],
      ...(input.now === undefined ? {} : { now: input.now }),
    });
  }

  return {
    report,
    fmCheck,
    ...(keyData === undefined
      ? {}
      : { keyData: keyData as KeyDataAuditReport }),
    scenarioResults: scenarioResultsOf(simulation),
    simulation,
  };
};
