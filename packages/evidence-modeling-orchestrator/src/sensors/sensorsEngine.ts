import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const DEFAULT_SKILLS_DIRECTORY = path.join('.agents', 'skills');

export interface SensorsEngineOptions {
  resolver: PythonEnvResolver;
  /** Defaults to `<projectRoot>/.agents/skills`, the only skill source. */
  skillsRoot?: string;
  discoverySkillDirectory?: string;
  fmSkillDirectory?: string;
  modelingSkillDirectory?: string;
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
  skillsRoot,
  discoverySkillDirectory,
  fmSkillDirectory,
  modelingSkillDirectory,
  now = () => new Date(),
}: SensorsEngineOptions) => {
  const root =
    skillsRoot ?? path.join(resolver.projectRoot, DEFAULT_SKILLS_DIRECTORY);
  const fmSkill = fmSkillDirectory ?? path.join(root, 'evidence-fm');
  const discoverySkill =
    discoverySkillDirectory ?? path.join(root, 'evidence-discovery');
  const modelingSkill =
    modelingSkillDirectory ?? path.join(root, 'evidence-modeling');

  const runCheckFm = async (
    input: RunSensorsInput,
  ): Promise<FmCheckReport | undefined> => {
    const script = path.join(fmSkill, 'scripts', 'check_fm.py');
    const args = [
      input.modelRoot,
      ...(input.scopeRefs ?? []).flatMap((scope) => ['--scope', scope]),
    ];
    const result = await resolver.runScript(script, args, {
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    return parseJson<FmCheckReport>(script, result);
  };

  const runKeyDataAudit = async (
    input: RunSensorsInput,
  ): Promise<KeyDataAuditReport | undefined> => {
    const script = path.join(fmSkill, 'scripts', 'audit_key_data.py');
    const result = await resolver.runScript(script, [input.modelRoot], {
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
    const result = await resolver.runScript(
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

  const runFullSensors = async (
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
  const checkStageGate = async (
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
      const result = await resolver.runScript(
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

  return {
    skillsRoot: root,
    runFullSensors,
    checkStageGate,
  };
};

export type SensorsEngine = ReturnType<typeof createSensorsEngine>;
