import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  PinnedPythonMissingError,
  type PythonEnvResolver,
  type ScriptRunResult,
} from '@evidence-poc/evidence-agent-core';

import {
  buildSensorReport,
  finalizeSensorReport,
  stageGateSummaryOf,
  type FmCheckReport,
  type KeyDataAuditReport,
  type SensorIssue,
  type SensorReport,
  type SensorSource,
  type StageGateReport,
  type StageGateSummary,
} from './sensorReport.js';

import { checkNativeStageGate } from './native/nativeStageGate.js';
import { runNativeSensors } from './native/nativeSensors.js';
import { compareSensorOutcomes } from './sensorParity.js';

const DEFAULT_SKILLS_DIRECTORY = path.join('.agents', 'skills');

/** Which implementation produces the verdict. */
export type SensorsEngineMode = 'python' | 'native' | 'shadow';

/** Every mode the engine implements, for a caller that has to offer a choice. */
export const SENSORS_ENGINE_MODES: readonly SensorsEngineMode[] = [
  'python',
  'native',
  'shadow',
];

/** Environment variable that picks the mode when a caller does not. */
export const SENSORS_ENGINE_ENVIRONMENT_VARIABLE = 'EVIDENCE_SENSORS_ENGINE';

export interface SensorsEngineOptions {
  /**
   * Pinned interpreter used by `python` and `shadow`.
   *
   * Native runs do not start a process, so they need no resolver; a mode that
   * does and finds none fails loudly instead of silently degrading.
   */
  resolver?: PythonEnvResolver;
  /** Defaults to `EVIDENCE_SENSORS_ENGINE`, then to `native`. */
  mode?: SensorsEngineMode;
  /** Environment the mode is read from; injected by tests. */
  environment?: NodeJS.ProcessEnv;
  /** Defaults to `<projectRoot>/.agents/skills`, the only skill source. */
  skillsRoot?: string;
  discoverySkillDirectory?: string;
  fmSkillDirectory?: string;
  modelingSkillDirectory?: string;
  now?: () => Date;
}

/** Reads the configured mode, rejecting a value that is not one of the three. */
export const sensorsEngineModeOf = (
  environment: NodeJS.ProcessEnv = process.env,
): SensorsEngineMode => {
  const configured = environment[SENSORS_ENGINE_ENVIRONMENT_VARIABLE];

  if (configured === undefined || configured === '') {
    return 'native';
  }

  if (configured === 'python' || configured === 'native' || configured === 'shadow') {
    return configured;
  }

  throw new Error(
    `${SENSORS_ENGINE_ENVIRONMENT_VARIABLE} must be python, native or shadow, found '${configured}'`,
  );
};

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
  /** Saved `check_fm.py` report; a fresh one is produced when omitted. */
  fmCheck?: FmCheckReport;
  signal?: AbortSignal;
}

export class SensorScriptError extends Error {
  readonly script: string;
  readonly result: ScriptRunResult;

  constructor(script: string, result: ScriptRunResult) {
    super(
      `${path.basename(script)} 输出无法解析：${result.stderr.trim() || result.stdout.trim() || '空输出'}`,
    );
    this.name = 'SensorScriptError';
    this.script = script;
    this.result = result;
  }
}

const parseJson = <T>(script: string, result: ScriptRunResult): T => {
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new SensorScriptError(script, result);
  }
};

const isPinnedPythonMissing = (error: unknown): boolean =>
  error instanceof PinnedPythonMissingError;

/**
 * Runs the pinned Python sensors and folds their JSON reports into one verdict.
 *
 * Every script is read-only by contract, so the engine can run the whole set on
 * every model change without touching the source tree.
 */
export const createSensorsEngine = ({
  resolver,
  mode,
  environment,
  skillsRoot,
  discoverySkillDirectory,
  fmSkillDirectory,
  modelingSkillDirectory,
  now = () => new Date(),
}: SensorsEngineOptions = {}) => {
  const selectedMode = mode ?? sensorsEngineModeOf(environment);
  const root =
    skillsRoot ??
    path.join(
      resolver?.projectRoot ?? process.cwd(),
      DEFAULT_SKILLS_DIRECTORY,
    );
  const fmSkill = fmSkillDirectory ?? path.join(root, 'evidence-fm');
  const discoverySkill =
    discoverySkillDirectory ?? path.join(root, 'evidence-discovery');
  const modelingSkill =
    modelingSkillDirectory ?? path.join(root, 'evidence-modeling');

  const pythonResolver = (): PythonEnvResolver => {
    if (resolver === undefined) {
      throw new Error(
        `sensor mode '${selectedMode}' needs a pinned interpreter; pass a resolver or use mode 'native'`,
      );
    }

    return resolver;
  };

  const runCheckFm = async (
    input: RunSensorsInput,
  ): Promise<FmCheckReport | undefined> => {
    const script = path.join(fmSkill, 'scripts', 'check_fm.py');
    const args = [
      input.modelRoot,
      ...(input.scopeRefs ?? []).flatMap((scope) => ['--scope', scope]),
    ];
    const result = await pythonResolver().runScript(script, args, {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    return parseJson<FmCheckReport>(script, result);
  };

  const runKeyDataAudit = async (
    input: RunSensorsInput,
  ): Promise<KeyDataAuditReport | undefined> => {
    const script = path.join(fmSkill, 'scripts', 'audit_key_data.py');
    const result = await pythonResolver().runScript(script, [input.modelRoot], {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    return parseJson<KeyDataAuditReport>(script, result);
  };

  const runTraceCheck = async (
    input: RunSensorsInput,
  ): Promise<{ valid: boolean; errors: readonly string[] } | undefined> => {
    if (input.tracePath === undefined) {
      return undefined;
    }

    const script = path.join(
      discoverySkill,
      'scripts',
      'check_interview_trace.py',
    );
    const result = await pythonResolver().runScript(
      script,
      [
        input.tracePath,
        '--schema',
        path.join(fmSkill, 'schemas', 'interview-trace.schema.json'),
        '--fm-root',
        input.modelRoot,
      ],
      { ...(input.signal === undefined ? {} : { signal: input.signal }) },
    );

    return result.code === 0
      ? { valid: true, errors: [] }
      : {
          valid: false,
          errors: `${result.stdout}${result.stderr}`
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== ''),
        };
  };

  const runPythonSensors = async (
    input: RunSensorsInput,
  ): Promise<SensorOutcome> => {
    const unavailableSensors: SensorSource[] = [];

    const collect = async <T>(
      source: SensorSource,
      work: () => Promise<T>,
    ): Promise<T | undefined> => {
      try {
        return await work();
      } catch (error) {
        if (isPinnedPythonMissing(error)) {
          unavailableSensors.push(source);

          return undefined;
        }

        throw error;
      }
    };

    const fmCheck = await collect('check_fm', () => runCheckFm(input));
    const keyData = await collect('audit_key_data', () =>
      runKeyDataAudit(input),
    );
    const traceCheck = await collect('check_interview_trace', () =>
      runTraceCheck(input),
    );

    const base = buildSensorReport({
      ...(fmCheck === undefined ? {} : { fmCheck }),
      ...(keyData === undefined ? {} : { keyData }),
      unavailableSensors,
      now,
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

    return {
      report:
        traceIssues.length === 0
          ? base
          : finalizeSensorReport({
              issues: [...base.issues, ...traceIssues],
              keyDataSummary: base.keyDataSummary,
              unavailableSensors,
              now,
            }),
      ...(fmCheck === undefined ? {} : { fmCheck }),
      ...(keyData === undefined ? {} : { keyData }),
      ...(traceCheck === undefined ? {} : { traceCheck }),
    };
  };

  /**
   * Runs `check_stage_gate.py` against a saved FM report, because the gate reads
   * evidence from a file rather than from a pipe.
   */
  const checkPythonStageGate = async (
    input: StageGateInput,
  ): Promise<StageGateSummary> => {
    const closedGate = (errors: readonly string[]): StageGateSummary => ({
      target: input.target,
      passed: false,
      scopeRefs: [],
      errors,
      limitations: [],
    });

    let fmCheck = input.fmCheck;

    if (fmCheck === undefined) {
      try {
        fmCheck = await runCheckFm({
          modelRoot: input.modelRoot,
          ...(input.scopeRefs === undefined
            ? {}
            : { scopeRefs: input.scopeRefs }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
      } catch (error) {
        if (isPinnedPythonMissing(error)) {
          return closedGate([
            '未找到锁定的 Python 解释器，无法生成 FM 检查结果；请运行 ./init.sh。',
          ]);
        }

        throw error;
      }
    }

    if (fmCheck === undefined) {
      return closedGate(['缺少 FM 检查结果，无法判定阶段门禁。']);
    }

    const directory = await mkdtemp(path.join(tmpdir(), 'evidence-gate-'));
    const reportPath = path.join(directory, 'fm-check.json');

    try {
      await writeFile(
        reportPath,
        `${JSON.stringify(fmCheck, null, 2)}\n`,
        'utf8',
      );

      const script = path.join(modelingSkill, 'scripts', 'check_stage_gate.py');
      const result = await pythonResolver().runScript(
        script,
        [
          '--target',
          input.target,
          '--fm-check',
          reportPath,
          '--trace',
          input.tracePath,
          ...(input.scopeRefs ?? []).flatMap((scope) => ['--scope', scope]),
        ],
        { ...(input.signal === undefined ? {} : { signal: input.signal }) },
      );

      return stageGateSummaryOf(parseJson<StageGateReport>(script, result));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };

  /** Reads the trace a native gate needs; the Python path hands the path over. */
  const readTraceDocument = async (tracePath: string): Promise<unknown> =>
    JSON.parse(await readFile(tracePath, 'utf8')) as unknown;

  /** Appends parity findings so a shadow run reports its own disagreement. */
  const withDrift = (
    outcome: SensorOutcome,
    differences: readonly string[],
  ): SensorOutcome => {
    if (differences.length === 0) {
      return outcome;
    }

    const issues: SensorIssue[] = [
      ...outcome.report.issues,
      {
        issueId: 'shadow:SENSOR_DRIFT',
        severity: 'warn',
        source: 'check_fm',
        code: 'SENSOR_DRIFT',
        message: `原生传感器与 Python 传感器结论不一致（${differences.length} 项）。`,
        suggestion: differences.join('; '),
      },
    ];
    const blockCount = issues.filter((issue) => issue.severity === 'block').length;

    return {
      ...outcome,
      report: {
        ...outcome.report,
        issues,
        warnCount: issues.filter((issue) => issue.severity === 'warn').length,
        passed: blockCount === 0,
      },
    };
  };

  const runFullSensors = async (
    input: RunSensorsInput,
  ): Promise<SensorOutcome> => {
    if (selectedMode === 'python') {
      return runPythonSensors(input);
    }

    const native = await runNativeSensors({
      modelRoot: input.modelRoot,
      ...(input.tracePath === undefined ? {} : { tracePath: input.tracePath }),
      ...(input.scopeRefs === undefined ? {} : { scopeRefs: input.scopeRefs }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      readTrace: readTraceDocument,
    });

    if (selectedMode === 'native') {
      return native;
    }

    const differences = compareSensorOutcomes(
      await runPythonSensors(input),
      native,
    );

    return withDrift(native, differences);
  };

  const checkStageGate = async (
    input: StageGateInput,
  ): Promise<StageGateSummary> => {
    if (selectedMode === 'python') {
      return checkPythonStageGate(input);
    }

    const report =
      input.fmCheck ??
      (
        await runNativeSensors({
          modelRoot: input.modelRoot,
          ...(input.scopeRefs === undefined
            ? {}
            : { scopeRefs: input.scopeRefs }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          detectInputChange: false,
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

    const trace = await readTraceDocument(input.tracePath).catch(() => null);
    const gate = checkNativeStageGate({
      target: input.target,
      fmCheck: report,
      trace,
      scopes: input.scopeRefs ?? [],
    });
    const summary = stageGateSummaryOf(gate);

    if (selectedMode === 'native') {
      return summary;
    }

    const pythonGate = await checkPythonStageGate({
      ...input,
      fmCheck: report,
    }).catch(() => null);

    if (pythonGate === null || pythonGate.passed === summary.passed) {
      return summary;
    }

    return {
      ...summary,
      errors: [
        ...summary.errors,
        `原生门禁与 Python 门禁结论不一致：python=${pythonGate.passed}，native=${summary.passed}`,
      ],
      passed: false,
    };
  };

  return {
    skillsRoot: root,
    mode: selectedMode,
    runFullSensors,
    checkStageGate,
  };
};

export type SensorsEngine = ReturnType<typeof createSensorsEngine>;
