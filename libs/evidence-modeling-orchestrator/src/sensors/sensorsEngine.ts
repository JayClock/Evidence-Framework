import { readFile } from 'node:fs/promises';

import {
  stageGateSummaryOf,
  type FmCheckReport,
  type KeyDataAuditReport,
  type SensorReport,
  type StageGateSummary,
} from './sensorReport.js';
import { checkNativeStageGate } from './native/nativeStageGate.js';
import { runNativeSensors } from './native/nativeSensors.js';

/**
 * The sensor engine.
 *
 * One implementation, in-process: every check reads the model tree once and
 * decides from that read. There is no mode to select, no interpreter to resolve
 * and no install directory to locate — the checks and the schemas are the code.
 */

export interface SensorsEngineOptions {
  /** Injected clock, so a report's timestamp is reproducible in a test. */
  now?: () => Date;
}

export interface RunSensorsInput {
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  /** Absolute path of `.evidence/traces/interview-trace.json`, when present. */
  tracePath?: string;
  /** Context IDs to completeness-check; omitted means consistency only. */
  scopeRefs?: readonly string[];
  signal?: AbortSignal;
}

export interface SensorOutcome {
  report: SensorReport;
  fmCheck?: FmCheckReport;
  keyData?: KeyDataAuditReport;
  traceCheck?: { valid: boolean; errors: readonly string[] };
}

export interface StageGateInput {
  target: 'api' | 'visualization';
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  tracePath: string;
  scopeRefs?: readonly string[];
  /** Saved `check` report; a fresh one is produced when omitted. */
  fmCheck?: FmCheckReport;
  signal?: AbortSignal;
}

/** Reads the trace a gate needs; an unreadable file closes the gate. */
const readTrace = async (tracePath: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(tracePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
};

/** Runs every sensor against one model root. */
export const createSensorsEngine = ({
  now = () => new Date(),
}: SensorsEngineOptions = {}) => {
  const runFullSensors = async (
    input: RunSensorsInput,
  ): Promise<SensorOutcome> =>
    runNativeSensors({
      modelRoot: input.modelRoot,
      ...(input.tracePath === undefined ? {} : { tracePath: input.tracePath }),
      ...(input.scopeRefs === undefined ? {} : { scopeRefs: input.scopeRefs }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      now,
    });

  /**
   * Decides the downstream hand-off from the saved report and the trace.
   *
   * The gate reads evidence rather than re-deriving it, so a caller that already
   * ran the check passes its report in and nothing is computed twice.
   */
  const checkStageGate = async (
    input: StageGateInput,
  ): Promise<StageGateSummary> => {
    const report =
      input.fmCheck ??
      (
        await runFullSensors({
          modelRoot: input.modelRoot,
          ...(input.scopeRefs === undefined
            ? {}
            : { scopeRefs: input.scopeRefs }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        })
      ).fmCheck;

    if (report === undefined) {
      return {
        target: input.target,
        passed: false,
        scopeRefs: [],
        errors: ['缺少 FM 检查结果，无法判定阶段门禁。'],
        limitations: [],
      };
    }

    return stageGateSummaryOf(
      checkNativeStageGate({
        target: input.target,
        fmCheck: report,
        trace: await readTrace(input.tracePath),
        scopes: input.scopeRefs ?? [],
      }),
    );
  };

  return {
    runFullSensors,
    checkStageGate,
  };
};

export type SensorsEngine = ReturnType<typeof createSensorsEngine>;
