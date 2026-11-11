import { readFile } from 'node:fs/promises';

import type {
  ScenarioResult,
  SimulationReport,
} from '@evidence-poc/evidence-model-core';

import {
  buildSensorReport,
  finalizeSensorReport,
  type KeyDataAuditReport,
  type SensorIssue,
  type SensorReport,
} from '../sensorReport.js';
import type { SensorOutcome } from '../sensorsEngine.js';

import { loadModelSources, runNativeFmCheck } from './modelSources.js';
import { runNativeKeyDataAudit } from './nativeKeyDataAudit.js';
import { checkInterviewTrace, type TraceCheckResult } from './nativeTraceCheck.js';

/**
 * The native sensor set, in one pass over one model read.
 *
 * The Python engine started a process per script; here the document, the
 * validation suite and the digest are loaded once, so every sensor describes the
 * same bytes. That is what makes a native verdict comparable with a saved one.
 */

export interface NativeSensorsInput {
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  /** Absolute path of `.evidence/traces/interview-trace.json`, when present. */
  tracePath?: string;
  /** Context IDs to completeness-check; omitted means consistency only. */
  scopeRefs?: readonly string[];
  signal?: AbortSignal;
  /** Reads the trace document; defaults to reading the file as JSON. */
  readTrace?: (tracePath: string) => Promise<unknown>;
  /** Skip the second digest read, which a debounced background run does not need. */
  detectInputChange?: boolean;
}

export interface NativeSensorsOutcome extends SensorOutcome {
  /** Scenario rows, so a caller can show what executed and what it asserted. */
  scenarioResults: readonly ScenarioResult[];
  simulation: SimulationReport | null;
}

const readTraceFile = async (tracePath: string): Promise<unknown> =>
  JSON.parse(await readFile(tracePath, 'utf8')) as unknown;

/** The scenario rows the desktop shows beside the verdict. */
export const scenarioResultsOf = (
  simulation: SimulationReport | null,
): readonly ScenarioResult[] => simulation?.scenarioResults ?? [];

/** A trace that could not even be read still has to fail the check. */
const unreadableTrace = (error: unknown): TraceCheckResult => ({
  valid: false,
  traceCount: 0,
  errors: [
    `unreadable trace file: ${error instanceof Error ? error.message : String(error)}`,
  ],
  limitations: [],
});

/**
 * Runs the whole native sensor set and folds the reports into one verdict.
 *
 * A missing or malformed trace is reported as an invalid trace rather than a
 * crash: the status bar still has to describe the model when the record is gone.
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
  const traceCheck =
    input.tracePath === undefined
      ? undefined
      : await (input.readTrace ?? readTraceFile)(input.tracePath)
          .then((document) => checkInterviewTrace(document, sources.model))
          .catch(unreadableTrace);

  const base = buildSensorReport({
    fmCheck,
    ...(keyData === undefined ? {} : { keyData }),
  });
  const traceIssues: SensorIssue[] =
    traceCheck === undefined || traceCheck.valid
      ? []
      : traceCheck.errors.map((message) => ({
          issueId: `check_interview_trace:TRACE_INVALID:${message}`,
          severity: 'block' as const,
          source: 'check_interview_trace' as const,
          code: 'TRACE_INVALID',
          message,
        }));

  const report: SensorReport =
    traceIssues.length === 0
      ? base
      : finalizeSensorReport({
          issues: [...base.issues, ...traceIssues],
          keyDataSummary: base.keyDataSummary,
        });

  return {
    report,
    fmCheck,
    ...(keyData === undefined ? {} : { keyData: keyData as KeyDataAuditReport }),
    ...(traceCheck === undefined ? {} : { traceCheck }),
    scenarioResults: scenarioResultsOf(simulation),
    simulation,
  };
};
