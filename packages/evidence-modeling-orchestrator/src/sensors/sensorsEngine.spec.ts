import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PinnedPythonMissingError,
  type PythonEnvResolver,
} from '@evidence-poc/evidence-agent-core';

import { SensorScriptError, createSensorsEngine } from './sensorsEngine.js';
import type { StageGateSummary } from './sensorReport.js';

interface RecordedCall {
  script: string;
  args: readonly string[];
}

const createFakeResolver = ({
  responses,
  missing = false,
}: {
  responses: Readonly<Record<string, string>>;
  missing?: boolean;
}) => {
  const calls: RecordedCall[] = [];
  const resolver: PythonEnvResolver = {
    projectRoot: '/project',
    resolveVenvPath: () => '/project/node_modules/.cache/evidence-fm-runtime',
    resolvePinnedPython: () => ({
      executablePath:
        '/project/node_modules/.cache/evidence-fm-runtime/bin/python',
      venvPath: '/project/node_modules/.cache/evidence-fm-runtime',
      isValid: !missing,
      ...(missing ? { driftReport: '未找到解释器，请运行 ./init.sh' } : {}),
    }),
    runScript: async (script, args = []) => {
      calls.push({ script, args });

      if (missing) {
        throw new PinnedPythonMissingError(resolver.resolvePinnedPython());
      }

      const key = path.basename(script);

      return { code: 0, stdout: responses[key] ?? '', stderr: '' };
    },
    checkLock: async () => ({ ok: true, output: '' }),
  };

  return { resolver, calls };
};

const engineFor = (options: Parameters<typeof createFakeResolver>[0]) => {
  const fake = createFakeResolver(options);
  const engine = createSensorsEngine({
    resolver: fake.resolver,
    now: () => new Date('2026-11-11T09:00:00.000Z'),
  });

  return { ...fake, engine };
};

const FM_REPORT = JSON.stringify({
  valid: true,
  consistent: true,
  errors: [],
  gaps: [],
  executedScenarioCount: 2,
});

const KEY_DATA_REPORT = JSON.stringify({
  keyDataCount: 8,
  needsDecision: [{ path: 'request.payment#expired_at' }],
});

describe('createSensorsEngine', () => {
  it('runs the whole read-only sensor set with the pinned interpreter', async () => {
    const { engine, calls } = engineFor({
      responses: {
        'check_fm.py': FM_REPORT,
        'audit_key_data.py': KEY_DATA_REPORT,
      },
    });

    const outcome = await engine.runFullSensors({
      modelRoot: '/project/.evidence/fm',
      scopeRefs: ['ctx.purchase', 'ctx.return'],
    });

    expect(calls.map(({ script }) => path.basename(script))).toEqual([
      'check_fm.py',
      'audit_key_data.py',
    ]);
    expect(calls[0]?.args).toEqual([
      '/project/.evidence/fm',
      '--scope',
      'ctx.purchase',
      '--scope',
      'ctx.return',
    ]);
    expect(calls[0]?.script).toBe(
      '/project/.agents/skills/evidence-fm/scripts/check_fm.py',
    );
    expect(outcome.report.passed).toBe(true);
    expect(outcome.report.keyDataSummary.decisionOwedCount).toBe(1);
    expect(outcome.report.isStageGateReady).toBe(false);
  });

  it('adds the trace check when a trace path is provided', async () => {
    const { engine, calls } = engineFor({
      responses: {
        'check_fm.py': FM_REPORT,
        'audit_key_data.py': KEY_DATA_REPORT,
      },
    });

    await engine.runFullSensors({
      modelRoot: '/project/.evidence/fm',
      tracePath: '/project/.evidence/traces/interview-trace.json',
    });

    expect(calls.map(({ script }) => path.basename(script))).toEqual([
      'check_fm.py',
      'audit_key_data.py',
      'check_interview_trace.py',
    ]);
    expect(calls[2]?.args).toEqual([
      '/project/.evidence/traces/interview-trace.json',
      '--schema',
      '/project/.agents/skills/evidence-fm/schemas/interview-trace.schema.json',
      '--fm-root',
      '/project/.evidence/fm',
    ]);
  });

  it('blocks with unavailable sensors when the environment drifted', async () => {
    const { engine } = engineFor({ responses: {}, missing: true });

    const outcome = await engine.runFullSensors({
      modelRoot: '/project/.evidence/fm',
    });

    expect(outcome.report.passed).toBe(false);
    expect(outcome.report.unavailableSensors).toEqual([
      'check_fm',
      'audit_key_data',
    ]);
    expect(
      outcome.report.issues.filter(({ code }) => code === 'SENSOR_UNAVAILABLE'),
    ).toHaveLength(2);
    expect(outcome.report.issues[0]?.suggestion).toContain('./init.sh');
  });

  it('refuses to guess when a script emits non-JSON output', async () => {
    const { engine } = engineFor({
      responses: { 'check_fm.py': 'Traceback (most recent call last):' },
    });

    await expect(
      engine.runFullSensors({ modelRoot: '/project/.evidence/fm' }),
    ).rejects.toBeInstanceOf(SensorScriptError);
  });

  it('writes the FM report to a file before gating on it', async () => {
    const { engine, calls } = engineFor({
      responses: {
        'check_fm.py': FM_REPORT,
        'check_stage_gate.py': JSON.stringify({
          passed: true,
          target: 'api',
          scopeRefs: ['ctx.purchase'],
          errors: [],
          limitations: ['human approval stays a human statement'],
        } satisfies StageGateSummary),
      },
    });

    const summary = await engine.checkStageGate({
      target: 'api',
      modelRoot: '/project/.evidence/fm',
      tracePath: '/project/.evidence/traces/interview-trace.json',
      scopeRefs: ['ctx.purchase'],
    });

    expect(summary.passed).toBe(true);
    expect(summary.scopeRefs).toEqual(['ctx.purchase']);
    expect(calls.map(({ script }) => path.basename(script))).toEqual([
      'check_fm.py',
      'check_stage_gate.py',
    ]);
    expect(calls[1]?.args).toContain('--fm-check');
    expect(calls[1]?.args).toContain(
      '/project/.evidence/traces/interview-trace.json',
    );
    expect(calls[1]?.args).toContain('--target');
  });

  it('closes the gate when the FM report is unavailable', async () => {
    const { engine, calls } = engineFor({ responses: {}, missing: true });

    const summary = await engine.checkStageGate({
      target: 'visualization',
      modelRoot: '/project/.evidence/fm',
      tracePath: '/project/.evidence/traces/interview-trace.json',
    });

    expect(summary.passed).toBe(false);
    expect(summary.target).toBe('visualization');
    expect(summary.errors).toEqual([
      '未找到锁定的 Python 解释器，无法生成 FM 检查结果；请运行 ./init.sh。',
    ]);
    expect(calls.map(({ script }) => path.basename(script))).toEqual([
      'check_fm.py',
    ]);
  });
});
