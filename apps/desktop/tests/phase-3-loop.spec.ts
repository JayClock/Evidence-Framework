import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PinnedPythonMissingError,
  createPythonEnvResolver,
  type ScriptRunResult,
} from '@evidence-poc/evidence-agent-core';
import {
  calculateFrontier,
  createSensorsEngine,
  type InterviewTraceDocument,
  type ModelPatchRequest,
  type SensorReport,
} from '@evidence-poc/evidence-modeling-orchestrator';
import {
  createModelSession,
  decodeModelPatch,
  readModelDirectory,
} from '@evidence-poc/evidence-model-core';
import type { EntityAST } from '@evidence-poc/evidence-schema';

import type {
  EvidenceAgentSession,
  EvidenceAgentSessionOptions,
} from '@evidence-poc/evidence-agent-core';

import { createAgentRuntime } from '../src/main/agentRuntime';

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  '../../../packages/evidence-schema/tests/fixtures/product-procurement',
);

const PROJECT_ROOT = '/models/procurement';

/** Pinned interpreter stand-in that answers with canned script output. */
const fakeResolver = (responses: Readonly<Record<string, string>>) =>
  createPythonEnvResolver({
    projectRoot: PROJECT_ROOT,
    fileExists: () => true,
    runProcess: async (_command, args): Promise<ScriptRunResult> => {
      const script = args[0] ?? '';
      const key = script.slice(script.lastIndexOf('/') + 1);

      return {
        code: 0,
        stdout: responses[key] ?? '',
        stderr: '',
      };
    },
  });

const trace: InterviewTraceDocument = {
  schemaVersion: '5.0',
  modelId: 'product-procurement-full-lifecycle',
  traces: [
    {
      traceId: 'trace-1',
      timestamp: '2026-11-11T08:00:00.000Z',
      focus: {
        contextRef: 'context.product-procurement',
        evidenceRef: 'request.payment',
        roleRef: 'role.seller',
      },
      narrative: {
        judgment: '付款以银行回单为证明',
        story: '客户提出付款请求，卖方以银行回单确认收款。',
        keyData: ['request.payment#requested_minor_units'],
      },
      qa: [
        {
          questionId: 'Q1',
          question: '运费由谁提供、怎么算？',
          targetAttribute: 'request.payment#freight',
        },
      ],
      userInput: { rawText: '客户财务口头说明', confirmedFacts: [] },
      targetBindings: [],
    },
  ],
};

type ToolStub = {
  name: string;
  execute: (
    callId: string,
    params: Record<string, unknown>,
  ) => Promise<{ details: unknown; isError?: boolean }>;
};

/** Registers the real evidence tools on a stubbed Pi API. */
const toolsOf = (
  sessionOptions: EvidenceAgentSessionOptions,
): Map<string, ToolStub> => {
  const tools = new Map<string, ToolStub>();
  const extension = sessionOptions.extensionFactories?.[0];

  if (typeof extension !== 'function') {
    throw new Error('the evidence tools extension was not registered');
  }

  extension({
    registerTool: (tool: ToolStub) => tools.set(tool.name, tool),
  } as never);

  return tools;
};

const fakeSession = (): EvidenceAgentSession => ({
  projectRoot: PROJECT_ROOT,
  start: async () => undefined,
  getSession: () => null,
  prompt: async () => undefined,
  steer: async () => 'queued',
  abort: async () => undefined,
  subscribe: () => () => undefined,
  dispose: () => undefined,
});

const sensorReport = (): SensorReport => ({
  timestamp: '2026-11-11T09:00:00.000Z',
  passed: false,
  blockCount: 0,
  warnCount: 1,
  infoCount: 0,
  issues: [
    {
      issueId: 'audit_key_data:KEY_DATA_DECISION_OWED:1',
      severity: 'warn',
      source: 'audit_key_data',
      code: 'KEY_DATA_DECISION_OWED',
      message: 'request.payment#requested_minor_units 尚未给出提供方结论',
      targetNodeId: 'request.payment#requested_minor_units',
      contextRef: 'context.product-procurement',
    },
  ],
  keyDataSummary: {
    totalItems: 2,
    resolvedCount: 1,
    decisionOwedCount: 1,
    unresolvedItems: [{ path: 'request.payment#requested_minor_units' }],
  },
  isStageGateReady: false,
  unavailableSensors: [],
});

describe('phase 3 control loop', () => {
  it('runs sensors, applies an agent patch and keeps it undoable', async () => {
    const parsed = await readModelDirectory(FIXTURE_ROOT);
    const session = createModelSession({ document: parsed.document });
    const before = session.getDocument();

    const published: SensorReport[] = [];
    const applied: ModelPatchRequest[] = [];
    let captured: EvidenceAgentSessionOptions | null = null;
    const auditor: EntityAST = {
      type: 'entity',
      id: 'party.auditor',
      category: 'participant',
      kind: 'party',
      label: '审计员',
    };

    const runtime = createAgentRuntime({
      rootPath: PROJECT_ROOT,
      resolver: fakeResolver({}),
      sensors: {
        runFullSensors: async () => ({ report: sensorReport() }),
        checkStageGate: async () => {
          throw new Error('not used');
        },
      },
      sessionFactory: (options) => {
        captured = options;

        return fakeSession();
      },
      transport: {
        publishEvent: () => undefined,
        publishReport: (report) => published.push(report),
        requestPatch: async (patch) => {
          applied.push(patch);
          const commands = decodeModelPatch(patch.commands);

          session.dispatchAll(commands, `agent:${patch.rationale}`);

          return {
            success: true,
            appliedCommands: commands.map((command) => command.type),
          };
        },
      },
    });

    const outcome = await runtime.runSensors(['context.product-procurement']);

    expect(outcome.report.blockCount).toBe(0);
    expect(outcome.report.isStageGateReady).toBe(false);
    expect(published).toEqual([outcome.report]);

    await runtime.prompt('补一个审计员参与方');

    const options = captured as EvidenceAgentSessionOptions | null;

    expect(options).not.toBeNull();

    const tools = toolsOf(options as EvidenceAgentSessionOptions);
    const apply = tools.get('apply_model_patch');
    const sensors = tools.get('run_sensors');

    expect([...tools.keys()]).toEqual([
      'run_sensors',
      'apply_model_patch',
      'get_canvas_selection',
    ]);

    const appliedResult = await apply?.execute('call-1', {
      rationale: '补一个审计员参与方',
      commands: [{ type: 'create-entity', entity: auditor }],
    });

    expect(appliedResult?.isError).toBeUndefined();
    expect(applied).toEqual([
      {
        rationale: '补一个审计员参与方',
        commands: [{ type: 'create-entity', entity: auditor }],
      },
    ]);
    expect(
      session.getDocument().entities.some((e) => e.id === auditor.id),
    ).toBe(true);

    session.undo();
    expect(session.getDocument()).toEqual(before);

    const sensorResult = await sensors?.execute('call-2', {});

    expect(sensorResult?.details).toMatchObject({
      blockCount: 0,
      isStageGateReady: false,
    });
    expect(published.length).toBeGreaterThanOrEqual(2);

    runtime.dispose();
  });

  it('derives the frontier from the trace against the live model', async () => {
    const parsed = await readModelDirectory(FIXTURE_ROOT);
    const frontier = calculateFrontier({
      trace,
      entityIds: parsed.document.entities.map((entity) => entity.id),
    });

    expect(frontier.contextRef).toBe('context.product-procurement');
    expect(frontier.openQuestions).toHaveLength(1);
    expect(frontier.gaps).toEqual([]);
    expect(frontier.closed).toBe(false);
  });

  it('blocks the loop when the pinned interpreter is missing', async () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      fileExists: () => false,
    });
    const engine = createSensorsEngine({ resolver });

    const outcome = await engine.runFullSensors({
      modelRoot: `${PROJECT_ROOT}/.evidence/fm`,
    });

    expect(outcome.report.passed).toBe(false);
    expect(outcome.report.unavailableSensors).toEqual([
      'check_fm',
      'audit_key_data',
    ]);
    expect(outcome.report.issues[0]?.suggestion).toContain('./init.sh');
  });

  it('throws the pinned-interpreter error instead of running a script', async () => {
    const resolver = createPythonEnvResolver({
      projectRoot: PROJECT_ROOT,
      fileExists: () => false,
    });

    await expect(
      resolver.runScript('.agents/skills/evidence-fm/scripts/check_fm.py'),
    ).rejects.toBeInstanceOf(PinnedPythonMissingError);
  });
});
