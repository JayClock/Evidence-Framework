import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeModelDirectory } from '@evidence-poc/evidence-model-core';
import { describe, expect, it, vi } from 'vitest';

import type {
  EvidenceAgentSession,
  EvidenceAgentSessionOptions,
  ModelPatchRequest,
  ModelPatchResult,
  SensorOutcome,
  SensorReport,
  SensorsEngine,
} from '@evidence-poc/evidence-agent';

import { createAgentRuntime, type AgentRuntimeTransport } from './agentRuntime';
import { createDesktopFixture } from '../renderer/test-support/modelFixture';

const REPORT: SensorReport = {
  timestamp: '2026-11-11T09:00:00.000Z',
  passed: true,
  blockCount: 0,
  warnCount: 0,
  infoCount: 0,
  issues: [],
  keyDataSummary: {
    totalItems: 2,
    resolvedCount: 2,
    decisionOwedCount: 0,
    unresolvedItems: [],
  },
  isStageGateReady: false,
  unavailableSensors: [],
};

const OUTCOME: SensorOutcome = { report: REPORT };

const createTransport = () => {
  const events: unknown[] = [];
  const reports: SensorReport[] = [];
  const patches: ModelPatchRequest[] = [];
  const transport: AgentRuntimeTransport = {
    publishEvent: (event) => events.push(event),
    publishReport: (report) => reports.push(report),
    requestPatch: async (patch) => {
      patches.push(patch);

      return { success: true, appliedCommands: ['create-entity'] };
    },
  };

  return { transport, events, reports, patches };
};

const createFakeSession = () => {
  const listeners = new Set<(event: never) => void>();
  const prompts: string[] = [];
  const steers: string[] = [];
  let starts = 0;
  let aborts = 0;
  let disposed = 0;

  const session: EvidenceAgentSession = {
    projectRoot: '/models/procurement',
    start: async () => {
      starts += 1;
    },
    getSession: () => null,
    getSessionFile: () => null,
    prompt: async (text) => {
      prompts.push(text);
    },
    steer: async (text) => {
      steers.push(text);

      return 'queued';
    },
    abort: async () => {
      aborts += 1;
    },
    subscribe: (listener) => {
      listeners.add(listener as (event: never) => void);

      return () => listeners.delete(listener as (event: never) => void);
    },
    dispose: () => {
      disposed += 1;
    },
  };

  return {
    session,
    prompts,
    steers,
    emit: (event: never) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    get starts() {
      return starts;
    },
    get aborts() {
      return aborts;
    },
    get disposed() {
      return disposed;
    },
  };
};

const sensorEngine = (
  outcome: SensorOutcome = OUTCOME,
): Pick<SensorsEngine, 'runFullSensors' | 'checkStageGate'> & {
  calls: { modelRoot: string; scopeRefs?: readonly string[] }[];
} => {
  const calls: { modelRoot: string; scopeRefs?: readonly string[] }[] = [];

  return {
    calls,
    runFullSensors: async (input) => {
      calls.push({
        modelRoot: input.modelRoot,
        ...(input.scopeRefs === undefined
          ? {}
          : { scopeRefs: input.scopeRefs }),
      });

      return outcome;
    },
    checkStageGate: async () => {
      throw new Error('not used in this test');
    },
  };
};

const sessionOptions: EvidenceAgentSessionOptions[] = [];

const runtimeWith = (options: {
  transport: AgentRuntimeTransport;
  fake: ReturnType<typeof createFakeSession>;
  sensors?: ReturnType<typeof sensorEngine>;
  sensorDelayMs?: number;
  rootPath?: string;
}) =>
  createAgentRuntime({
    rootPath: options.rootPath ?? '/models/procurement',
    transport: options.transport,
    sensors: options.sensors ?? sensorEngine(),
    sessionFactory: (created) => {
      sessionOptions.push(created);

      return options.fake.session;
    },
    ...(options.sensorDelayMs === undefined
      ? {}
      : { sensorDelayMs: options.sensorDelayMs }),
  });

describe('live agent analysis', () => {
  it('uses the latest unsaved document, preserves the first baseline and discards obsolete runs', async () => {
    const { transport, reports } = createTransport();
    const resolvers: ((outcome: SensorOutcome) => void)[] = [];
    const runFullSensors = vi.fn<SensorsEngine['runFullSensors']>(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const runtime = createAgentRuntime({
      rootPath: '/models/procurement',
      transport,
      sensors: {
        runFullSensors,
        checkStageGate: async () => {
          throw new Error('unused');
        },
      },
    });
    const baseDocument = createDesktopFixture();
    const input = {
      rootPath: '/models/procurement',
      revision: 1,
      document: baseDocument,
      baseDocument,
    };
    runtime.notifyModelChanged(input);
    const first = runtime.runSensors();
    const next = structuredClone(baseDocument);
    next.entities[0]!.label = 'new';
    runtime.notifyModelChanged({
      ...input,
      revision: 2,
      document: next,
      baseDocument: next,
    });
    const second = runtime.runSensors();
    expect(runFullSensors.mock.calls[1]![0]).toMatchObject({
      document: next,
      baseDocument,
    });
    resolvers[0]!(OUTCOME);
    await first;
    expect(reports).toHaveLength(0);
    resolvers[1]!(OUTCOME);
    await second;
    expect(reports).toHaveLength(1);
    expect(reports[0]?.documentRevision).toBe(2);
    runtime.notifyModelChanged(input);
    expect(runtime.latestReport()?.documentRevision).toBe(2);
    runtime.dispose();
  });
});

describe('createAgentRuntime', () => {
  it('resolves the model root and starts the session only on the first prompt', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    expect(runtime.modelRoot).toBe('/models/procurement/.evidence/fm');
    expect(runtime.getSession()).toBeNull();
    expect(fake.starts).toBe(0);

    await runtime.prompt('澄清退货履约');
    await runtime.prompt('继续');

    expect(fake.starts).toBe(1);
    expect(fake.prompts).toEqual(['澄清退货履约', '继续']);
  });

  it('hands the session its tools and no skill directory to discover', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await runtime.prompt('开工');

    const created = sessionOptions.at(-1);

    expect(created?.projectRoot).toBe('/models/procurement');
    expect(created?.extensionFactories).toHaveLength(1);
    // The modeling instructions travel with the session; the runtime neither
    // points at a skill tree nor publishes a path for a shell to read.
    expect(created).not.toHaveProperty('skillDirectories');
    expect(created).not.toHaveProperty('instructions');
    expect(process.env.EVIDENCE_SKILLS_ROOT).toBeUndefined();
    expect(process.env.FM_SKILL_DIR).toBeUndefined();
  });

  it('streams projected session events to the renderer', async () => {
    const { transport, events } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await runtime.prompt('开工');
    fake.emit({ type: 'text-delta', delta: '合同' } as never);

    expect(events).toEqual([{ type: 'text-delta', delta: '合同' }]);
  });

  it('refuses to steer before a session exists', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await expect(runtime.steer('运费由买方承担')).rejects.toThrow(
      '还没有正在进行的访谈，无法插话。',
    );
  });

  it('steers and aborts through a live session', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await runtime.prompt('开工');
    await expect(runtime.steer('运费由买方承担')).resolves.toBe('queued');
    await runtime.abort();

    expect(fake.steers).toEqual(['运费由买方承担']);
    expect(fake.aborts).toBe(1);
  });

  it('runs the sensors on the project model root and publishes the report', async () => {
    const { transport, reports } = createTransport();
    const fake = createFakeSession();
    const sensors = sensorEngine();
    const runtime = runtimeWith({ transport, fake, sensors });

    const outcome = await runtime.runSensors(['context.purchase']);

    expect(outcome.report).toBe(REPORT);
    expect(sensors.calls).toEqual([
      {
        modelRoot: '/models/procurement/.evidence/fm',
        scopeRefs: ['context.purchase'],
      },
    ]);
    expect(reports).toEqual([REPORT]);
    expect(runtime.latestReport()).toBe(REPORT);
  });

  it('debounces background checks after model edits', async () => {
    vi.useFakeTimers();

    try {
      const { transport } = createTransport();
      const fake = createFakeSession();
      const sensors = sensorEngine();
      const runtime = runtimeWith({
        transport,
        fake,
        sensors,
        sensorDelayMs: 800,
      });

      for (let index = 0; index < 5; index += 1) {
        runtime.notifyModelChanged();
      }

      await vi.advanceTimersByTimeAsync(800);

      expect(sensors.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes the canvas selection to the tools', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    runtime.setCanvasContext({
      projectRoot: '/models/procurement',
      selection: { nodeId: 'request.payment', attributeName: null },
      selected: {
        nodeId: 'request.payment',
        label: '支付请求',
        kind: 'evidence',
      },
    });

    expect(runtime.getCanvasContext().selected?.label).toBe('支付请求');
  });

  it('disposes the session and stops pending work', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await runtime.prompt('开工');
    runtime.notifyModelChanged();
    runtime.dispose();

    expect(fake.disposed).toBe(1);
    expect(runtime.getSession()).toBeNull();
  });
});

describe('agent patch transport', () => {
  it('returns the renderer verdict to the tool', async () => {
    const applied: ModelPatchResult = {
      success: false,
      error: 'key data keeps no provider',
    };
    const { transport } = createTransport();
    transport.requestPatch = async (patch) => {
      void patch;

      return applied;
    };
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await runtime.prompt('开工');

    const extension = sessionOptions.at(-1)?.extensionFactories?.[0];

    if (typeof extension !== 'function') {
      throw new Error('the evidence tools extension was not registered');
    }
    type ToolStub = {
      name: string;
      execute: (
        callId: string,
        params: Record<string, unknown>,
        signal: undefined,
        onUpdate: undefined,
        context: unknown,
      ) => Promise<{ details: unknown; isError?: boolean }>;
    };
    const tools: ToolStub[] = [];
    const pi = {
      registerTool: (tool: ToolStub) => tools.push(tool),
    };

    extension?.(pi as never);
    const apply = tools.find(({ name }) => name === 'apply_model_patch');

    if (apply === undefined) {
      throw new Error('apply_model_patch was not registered');
    }

    const result = await apply.execute(
      'call-1',
      { rationale: '补齐退货', commands: [{ type: 'create-entity' }] },
      undefined,
      undefined,
      {} as never,
    );

    expect(result.details).toEqual(applied);
    expect(result.isError).toBe(true);
  });

  it('reads the project tree so an operator can name the root contract', async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), 'evidence-operator-'),
    );
    const { transport, patches } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake, rootPath: tempRoot });

    await writeModelDirectory(
      path.join(tempRoot, '.evidence', 'fm'),
      createDesktopFixture(),
    );

    try {
      await runtime.prompt('补一组退款履约');

      const extension = sessionOptions.at(-1)?.extensionFactories?.[0];

      if (typeof extension !== 'function') {
        throw new Error('the evidence tools extension was not registered');
      }

      type ToolStub = {
        name: string;
        execute: (
          callId: string,
          params: Record<string, unknown>,
        ) => Promise<{ details: unknown; isError?: boolean }>;
      };
      const tools: ToolStub[] = [];

      extension({
        registerTool: (tool: ToolStub) => tools.push(tool),
      } as never);

      const operator = tools.find(
        ({ name }) => name === 'introduce_fulfillment_pair',
      );

      if (operator === undefined) {
        throw new Error('introduce_fulfillment_pair was not registered');
      }

      const result = await operator.execute('call-1', {
        contextRef: 'context.procurement',
        request: {
          id: 'request.refund',
          label: '退款申请',
          responsibleRoleRef: 'role.buyer',
        },
        confirmation: {
          id: 'confirmation.refund',
          label: '退款确认',
          responsibleRoleRef: 'role.supplier',
        },
      });

      expect(result.isError).toBeUndefined();
      expect(patches[0]?.commands).toEqual([
        expect.objectContaining({
          type: 'create-fulfillment-pair',
          input: expect.objectContaining({
            contextRef: 'context.procurement',
            contractReferenceId: 'relation.request.refund-references-contract',
          }),
        }),
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
