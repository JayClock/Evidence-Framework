import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeModelDirectory } from '@evidence-poc/evidence-model-io';
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
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

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
  it('retries missing configuration, resets only the AI session and preserves transcript/canvas state', async () => {
    const first = createFakeSession();
    first.session.getSessionFile = () => '/desktop/session.jsonl';
    const second = createFakeSession();
    const created: EvidenceAgentSessionOptions[] = [];
    const getModelOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error('AI_NOT_CONFIGURED'))
      .mockResolvedValue({
        agentDir: '/desktop/ai',
        modelRuntime: {},
        model: { id: 'configured' },
      });
    const runtime = createAgentRuntime({
      rootPath: '/models/procurement',
      transport: createTransport().transport,
      sensors: sensorEngine(),
      getModelOptions,
      sessionFactory: (options) => {
        created.push(options);
        return created.length === 1 ? first.session : second.session;
      },
    });
    await expect(runtime.prompt('before setup')).rejects.toThrow(
      'AI_NOT_CONFIGURED',
    );
    await runtime.prompt('after setup');
    expect(created[0]).toMatchObject({
      agentDir: '/desktop/ai',
      model: { id: 'configured' },
    });
    const context = {
      projectRoot: '/models/procurement',
      selection: { nodeId: 'contract', attributeName: null },
    };
    runtime.setCanvasContext(context);
    await runtime.resetModel();
    expect(first.aborts).toBe(1);
    expect(first.disposed).toBe(1);
    expect(runtime.getCanvasContext()).toEqual(context);
    await runtime.prompt('new model');
    expect(created[1]?.sessionFile).toBe('/desktop/session.jsonl');
    expect(second.prompts).toEqual(['new model']);
    runtime.dispose();
  });
  it('disposes an obsolete session whose startup finishes after a model switch', async () => {
    const fake = createFakeSession();
    let finish: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const entered = vi.fn();
    fake.session.start = async () => {
      entered();
      await started;
    };
    const runtime = createAgentRuntime({
      rootPath: '/models/procurement',
      transport: createTransport().transport,
      sensors: sensorEngine(),
      sessionFactory: () => fake.session,
    });
    const prompt = runtime.prompt('obsolete');
    await vi.waitFor(() => expect(entered).toHaveBeenCalled());
    await runtime.resetModel();
    finish();
    await expect(prompt).rejects.toThrow('模型配置已变化');
    expect(fake.disposed).toBe(1);
    expect(fake.prompts).toEqual([]);
    expect(runtime.getSession()).toBeNull();
    runtime.dispose();
  });
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

type ToolStub = {
  name: string;
  execute: (
    id: string,
    params: Record<string, unknown>,
  ) => Promise<{ details: unknown; isError?: boolean }>;
};

const registeredTool = (name: string) => {
  const tools: ToolStub[] = [];
  const extension = sessionOptions.at(-1)?.extensionFactories?.[0];
  if (typeof extension !== 'function')
    throw new Error('Evidence tools extension not registered');
  extension({ registerTool: (tool: ToolStub) => tools.push(tool) } as never);
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
};

describe('agent patch transport', () => {
  it.each(['trace', 'what-if'] as const)(
    'pins focus and refuses all patch writes during a %s inquiry',
    async (inquiry) => {
      const { transport, patches } = createTransport();
      const fake = createFakeSession();
      const runtime = runtimeWith({ transport, fake });
      const document = createDesktopFixture();
      runtime.notifyModelChanged({
        rootPath: runtime.rootPath,
        revision: 1,
        document,
        baseDocument: document,
      });
      const modelPatch = {
        rationale: '补齐付款',
        patches: [{ op: 'replace', path: '/manifest/name', value: '不要写入' }],
      };
      fake.session.prompt = async (text) => {
        fake.prompts.push(text);
        const apply = registeredTool('apply_model_patch');
        if (fake.prompts.length === 1) {
          runtime.setCanvasContext({
            projectRoot: runtime.rootPath,
            selection: { nodeId: 'evidence.contract', attributeName: null },
          });
          const focus = await registeredTool(
            'get_focused_node_context',
          ).execute('read', {});
          expect(focus.isError).toBeUndefined();
          expect(focus.details).toMatchObject({
            entity: { id: 'evidence.confirmation' },
          });
          expect((await apply.execute('write', modelPatch)).isError).toBe(true);
          expect(
            (
              await registeredTool('batch_add_evidence_stubs').execute(
                'operator',
                {
                  evidences: [
                    {
                      id: 'evidence.refund',
                      label: '退款确认',
                      stage: 'fulfillment',
                    },
                  ],
                },
              )
            ).isError,
          ).toBe(true);
        } else {
          expect(
            (await apply.execute('write', modelPatch)).isError,
          ).toBeUndefined();
        }
      };
      try {
        await runtime.prompt('打开凭证', {
          nodeId: 'evidence.confirmation',
          inquiry,
        });
        expect(fake.prompts[0]).toContain(
          '【凭证焦点：evidence.confirmation】',
        );
        expect(fake.prompts[0]).toContain(
          inquiry === 'trace' ? '只读节点溯源' : '只读异常探问',
        );
        expect(patches).toEqual([]);
        await runtime.prompt('确认更改', { nodeId: 'evidence.confirmation' });
        expect(patches).toHaveLength(1);
      } finally {
        runtime.dispose();
      }
    },
  );

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

    const result = await registeredTool('apply_model_patch').execute('call-1', {
      rationale: '补齐退货',
      patches: [{ op: 'add', path: '/entities/-', value: {} }],
    });

    expect(result.details).toEqual(applied);
    expect(result.isError).toBe(true);
  });

  it('reads the project tree to guard an evidence batch against concurrent edits', async () => {
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

      const operator = registeredTool('batch_add_evidence_stubs');
      const result = await operator.execute('call-1', {
        evidences: [
          { id: 'evidence.refund', label: '退款确认', stage: 'fulfillment' },
        ],
      });
      expect(result.isError).toBeUndefined();
      expect(patches[0]?.patches).toEqual([
        expect.objectContaining({
          op: 'test',
          path: '',
          value: expect.objectContaining({ entities: expect.any(Array) }),
        }),
        expect.objectContaining({
          op: 'add',
          value: expect.objectContaining({ id: 'evidence.refund' }),
        }),
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
