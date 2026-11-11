import { describe, expect, it, vi } from 'vitest';

import type {
  EvidenceAgentSession,
  EvidenceAgentSessionOptions,
} from '@evidence-poc/evidence-agent-core';
import type {
  ModelPatchRequest,
  ModelPatchResult,
  SensorOutcome,
  SensorReport,
  SensorsEngine,
} from '@evidence-poc/evidence-modeling-orchestrator';

import { createAgentRuntime, type AgentRuntimeTransport } from './agentRuntime';

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
}) =>
  createAgentRuntime({
    rootPath: '/models/procurement',
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

  it('registers the three evidence tools and the project skill tree', async () => {
    const { transport } = createTransport();
    const fake = createFakeSession();
    const runtime = runtimeWith({ transport, fake });

    await runtime.prompt('开工');

    const created = sessionOptions.at(-1);

    expect(created?.projectRoot).toBe('/models/procurement');
    expect(created?.extensionFactories).toHaveLength(1);
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
});
