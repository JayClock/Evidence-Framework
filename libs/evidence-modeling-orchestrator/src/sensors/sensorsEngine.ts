import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
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
  document?: DomainModelDocument;
  baseDocument?: DomainModelDocument;
  apiMode?: 'draft' | 'release';
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  /** Context IDs to completeness-check; omitted means consistency only. */
  scopeRefs?: readonly string[];
  signal?: AbortSignal;
}

export interface SensorOutcome {
  report: SensorReport;
  fmCheck?: FmCheckReport;
  keyData?: KeyDataAuditReport;
}

export interface StageGateInput {
  /** Optional published contract baseline; never inferred from the latest edit. */
  baseDocument?: DomainModelDocument;
  target: 'api' | 'visualization';
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  scopeRefs?: readonly string[];
  /** Saved `check` report; a fresh one is produced when omitted. */
  fmCheck?: FmCheckReport;
  signal?: AbortSignal;
}

/** Runs every sensor against one model root. */
export const createSensorsEngine = ({
  now = () => new Date(),
}: SensorsEngineOptions = {}) => {
  const runFullSensors = async (
    input: RunSensorsInput,
  ): Promise<SensorOutcome> =>
    runNativeSensors({
      ...input,
      modelRoot: input.modelRoot,
      ...(input.scopeRefs === undefined ? {} : { scopeRefs: input.scopeRefs }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      now,
    });

  /**
   * FM authorization still comes from a scope check. API hand-off additionally
   * rechecks the saved model and compares any supplied baseline in release mode;
   * a permissive authoring preview never opens this gate.
   */
  const checkStageGate = async (
    input: StageGateInput,
  ): Promise<StageGateSummary> => {
    const fresh =
      input.target === 'api' || input.fmCheck === undefined
        ? await runFullSensors({
            modelRoot: input.modelRoot,
            apiMode: 'release',
            ...(input.baseDocument === undefined
              ? {}
              : { baseDocument: input.baseDocument }),
            ...(input.scopeRefs === undefined
              ? {}
              : { scopeRefs: input.scopeRefs }),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          })
        : undefined;
    const gate = stageGateSummaryOf(
      checkNativeStageGate({
        target: input.target,
        fmCheck: input.fmCheck ?? fresh?.fmCheck,
        scopes: input.scopeRefs ?? [],
      }),
    );
    if (input.target !== 'api' || fresh === undefined) return gate;
    const apiErrors = fresh.report.issues
      .filter(
        (issue) => issue.source === 'audit_api' && issue.severity !== 'info',
      )
      .map((issue) => `${issue.code}: ${issue.message}`);
    if (
      input.fmCheck !== undefined &&
      input.fmCheck.modelDigest !== fresh.fmCheck?.modelDigest
    ) {
      apiErrors.push('FM 检查与当前模型摘要不一致，请重新检查。');
    }
    return {
      ...gate,
      passed: gate.passed && apiErrors.length === 0,
      errors: [...gate.errors, ...apiErrors],
    };
  };

  return {
    runFullSensors,
    checkStageGate,
  };
};

export type SensorsEngine = ReturnType<typeof createSensorsEngine>;
