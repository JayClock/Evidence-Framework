import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createSensorsEngine,
  type EvidenceAgentSession,
  type EvidenceAgentSessionOptions,
  type ModelPatchRequest,
  type SensorReport,
} from '@evidence-poc/evidence-agent';
import {
  createModelSession,
  decodeModelPatch,
  readModelDirectory,
} from '@evidence-poc/evidence-model-core';
import type { EntityAST } from '@evidence-poc/evidence-schema';

import { createAgentRuntime } from '../src/main/agentRuntime';

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  '../../../libs/evidence-schema/tests/fixtures/product-procurement',
);

const PROJECT_ROOT = '/models/procurement';

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
  getSessionFile: () => null,
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
      'get_api_diff',
      'sync_api_projection',
      'run_sensors',
      'apply_model_patch',
      'get_canvas_selection',
      'annotate_contract_clauses',
      'read_service_blueprint',
      'introduce_fulfillment_pair',
      'add_breach_compensation',
      'roleify_and_invert_dependency',
      'isolate_domain_calculator',
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

  it('checks the same project without an interpreter', async () => {
    const engine = createSensorsEngine();

    const outcome = await engine.runFullSensors({ modelRoot: FIXTURE_ROOT });

    expect(outcome.report.unavailableSensors).toEqual([]);
    expect(outcome.report.blockCount).toBe(0);
    expect(outcome.fmCheck?.valid).toBe(true);
    expect(outcome.keyData?.keyDataCount).toBeGreaterThan(0);
  });
});
