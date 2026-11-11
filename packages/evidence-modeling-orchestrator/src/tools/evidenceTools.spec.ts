import { describe, expect, it } from 'vitest';

import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';

import {
  TOOL_NAMES,
  createEvidenceToolsExtension,
  type CanvasContext,
  type EvidenceToolsHandlers,
  type ModelPatchRequest,
  type ModelPatchResult,
} from './evidenceTools.js';
import type { SensorReport } from '../sensors/sensorReport.js';

type Registered = ToolDefinition<never, unknown, unknown>;

const createFakePi = () => {
  const tools: Registered[] = [];
  const pi = {
    registerTool: (tool: Registered) => {
      tools.push(tool);
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    tools,
    tool: (name: string): Registered => {
      const found = tools.find((candidate) => candidate.name === name);

      if (found === undefined) {
        throw new Error(`tool ${name} was not registered`);
      }

      return found;
    },
  };
};

const REPORT: SensorReport = {
  timestamp: '2026-11-11T09:00:00.000Z',
  passed: false,
  blockCount: 1,
  warnCount: 0,
  infoCount: 0,
  issues: [
    {
      issueId: 'check_fm:FM_INCONSISTENT:x',
      severity: 'block',
      source: 'check_fm',
      code: 'FM_INCONSISTENT',
      message: '缺失确认端',
    },
  ],
  keyDataSummary: {
    totalItems: 3,
    resolvedCount: 3,
    decisionOwedCount: 0,
    unresolvedItems: [],
  },
  isStageGateReady: false,
  unavailableSensors: [],
};

const canvasContext: CanvasContext = {
  projectRoot: '/project',
  modelId: 'product-procurement',
  selection: { nodeId: 'request.payment', attributeName: 'expired_at' },
  selected: {
    nodeId: 'request.payment',
    label: '支付请求',
    kind: 'evidence',
    contextRef: 'ctx.purchase',
  },
};

const createHandlers = (overrides: Partial<EvidenceToolsHandlers> = {}) => {
  const patches: ModelPatchRequest[] = [];
  const scopes: (string | undefined)[] = [];
  const handlers: EvidenceToolsHandlers = {
    modelRoot: '/project/.evidence/fm',
    runSensors: async ({ scope }) => {
      scopes.push(scope);

      return REPORT;
    },
    applyModelPatch: async (patch) => {
      patches.push(patch);

      return {
        success: true,
        appliedCommands: patch.commands.map(
          (command) => (command as { type: string }).type,
        ),
      } satisfies ModelPatchResult;
    },
    getCanvasContext: async () => canvasContext,
    ...overrides,
  };

  return { handlers, patches, scopes };
};

const invoke = async <TParams>(
  tool: Registered,
  params: TParams,
): Promise<{
  content: { type: string; text: string }[];
  details: unknown;
  isError?: boolean;
}> =>
  (await tool.execute(
    'call-1',
    params as never,
    undefined,
    undefined,
    {} as never,
  )) as never;

describe('createEvidenceToolsExtension', () => {
  it('registers exactly the three modeling tools', () => {
    const fake = createFakePi();
    const { handlers } = createHandlers();

    createEvidenceToolsExtension(handlers)(fake.pi);

    expect(fake.tools.map(({ name }) => name)).toEqual([
      TOOL_NAMES.runSensors,
      TOOL_NAMES.applyModelPatch,
      TOOL_NAMES.getCanvasSelection,
    ]);
  });

  it('runs the sensors over the project model root', async () => {
    const fake = createFakePi();
    const { handlers, scopes } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.runSensors), {
      scope: 'ctx.purchase',
    });

    expect(scopes).toEqual(['ctx.purchase']);
    expect(result.details).toBe(REPORT);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual({
      passed: false,
      isStageGateReady: false,
      blockCount: 1,
      warnCount: 0,
      decisionOwed: 0,
      issues: REPORT.issues,
    });
  });

  it('applies a patch and names the command types back to the model', async () => {
    const fake = createFakePi();
    const { handlers, patches } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.applyModelPatch), {
      rationale: '补齐退货确认端',
      commands: [
        { type: 'create-entity', entity: { id: 'evidence.return' } },
        { type: 'create-relationship', id: 'relation.return' },
      ],
    });

    expect(patches).toEqual([
      {
        rationale: '补齐退货确认端',
        commands: [
          { type: 'create-entity', entity: { id: 'evidence.return' } },
          { type: 'create-relationship', id: 'relation.return' },
        ],
      },
    ]);
    expect(result.content[0]?.text).toBe(
      '补丁已应用（create-entity, create-relationship）：补齐退货确认端',
    );
    expect(result.isError).toBeUndefined();
  });

  it('marks a rejected patch as an error result instead of throwing', async () => {
    const fake = createFakePi();
    const { handlers } = createHandlers({
      applyModelPatch: async () => ({
        success: false,
        error: 'key data keeps no provider',
      }),
    });
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.applyModelPatch), {
      rationale: '尝试',
      commands: [{ type: 'create-entity' }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe(
      '补丁被拒绝：key data keeps no provider',
    );
  });

  it('rejects a command without a type before touching the session', async () => {
    const fake = createFakePi();
    const { handlers, patches } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    await expect(
      invoke(fake.tool(TOOL_NAMES.applyModelPatch), {
        rationale: '坏补丁',
        commands: [{ entity: {} }],
      }),
    ).rejects.toThrow('commands[0] 缺少字符串 type 字段。');
    expect(patches).toEqual([]);
  });

  it('reports the current canvas selection', async () => {
    const fake = createFakePi();
    const { handlers } = createHandlers();
    createEvidenceToolsExtension(handlers)(fake.pi);

    const result = await invoke(fake.tool(TOOL_NAMES.getCanvasSelection), {});

    expect(result.details).toEqual(canvasContext);
    expect(JSON.parse(result.content[0]?.text ?? '{}')).toEqual(canvasContext);
  });
});
