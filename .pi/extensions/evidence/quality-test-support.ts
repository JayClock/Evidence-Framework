import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { vi } from 'vitest';
import evidenceExtension from './index.ts';
import { getPhaseDefinition } from './phases.ts';
import { seedDiscovery } from './discovery-test-support.ts';
import {
  createInitialState,
  saveState,
  writeJsonAtomic,
  writeTextAtomic,
} from './storage.ts';
import type { ArtifactSpec } from './types.ts';
import {
  acceptanceCatalog,
  procedureCatalog,
  testingPlan,
  manifest,
} from './testing-fixtures.ts';

export function validDocument(spec: ArtifactSpec): string {
  const catalogs: Record<string, unknown> = {
    'story-map': acceptanceCatalog,
    'test-procedures': procedureCatalog,
    'sprint-1-backlog': testingPlan,
  };
  const catalog = catalogs[spec.key];
  return [
    '# 测试工件',
    ...spec.requiredSections.map((heading) => `## ${heading}`),
    '| ID | 说明 |',
    '|:---|:---|',
    ...Array.from(
      { length: 20 },
      (_, i) => `| US-${String(i + 1).padStart(3, '0')} | 痛点：明确 |`,
    ),
    '```mermaid\ngraph LR\nA --> B\n```',
    '这是已经有依据的测试业务描述。'.repeat(150),
    ...(catalog ? [manifest(catalog)] : []),
  ].join('\n');
}

export async function qualityHarness(roots: string[], config = {}) {
  const root = await mkdtemp(join(tmpdir(), 'evidence-quality-'));
  roots.push(root);
  type Handler = (
    event: Record<string, unknown>,
    ctx: ExtensionCommandContext,
  ) => unknown;
  const commands = new Map<
    string,
    { handler: (args: string, ctx: ExtensionCommandContext) => unknown }
  >();
  const tools = new Map<string, ToolDefinition>();
  const events = new Map<string, Handler>();
  const api = {
    registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool),
    registerCommand: (
      name: string,
      command: {
        handler: (args: string, ctx: ExtensionCommandContext) => unknown;
      },
    ) => commands.set(name, command),
    on: (name: string, handler: Handler) => events.set(name, handler),
    getAllTools: () => [
      { name: 'read' },
      { name: 'bash' },
      { name: 'edit' },
      { name: 'write' },
      ...tools.values(),
    ],
    setActiveTools: vi.fn(),
    setThinkingLevel: vi.fn(),
    setSessionName: vi.fn(),
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn(),
    exec: vi.fn(),
  };
  // SAFETY: Registration and exercised profile paths use only these mocked API members.
  evidenceExtension(api as unknown as ExtensionAPI);
  const ui = {
    select: vi.fn(),
    editor: vi.fn(),
    input: vi.fn(),
    confirm: vi.fn(),
    notify: vi.fn(),
    setEditorText: vi.fn(),
    setStatus: vi.fn(),
    setWidget: vi.fn(),
    theme: { fg: (_color: string, text: string) => text },
  };
  // SAFETY: Tests disable session replacement and only exercise the mocked command/UI members.
  const ctx = {
    cwd: root,
    hasUI: true,
    waitForIdle: vi.fn(),
    ui,
  } as unknown as ExtensionCommandContext;
  await writeJsonAtomic(root, '.pi/evidence.json', {
    newSessionPerPhase: false,
    ...config,
  });
  const state = createInitialState('test', '可审计的需求草稿');
  state.status = 'running';
  state.currentArtifactIndex = 4;
  state.modeling.applicable = false;
  state.modeling.rationale = '合成测试中的简单工具胶水，不具备独立业务语义。';
  await writeTextAtomic(
    root,
    'artifacts/00-input/requirements.md',
    '# 原始需求\n可审计的需求草稿',
  );
  for (const phase of ['modeling'] as const) {
    const definition = getPhaseDefinition(phase);
    await writeTextAtomic(root, definition.skillFile, '# 阶段方法');
    for (const spec of definition.artifacts) {
      await writeTextAtomic(root, spec.promptFile, '# 工件模板');
      await writeTextAtomic(root, spec.output, validDocument(spec));
    }
  }
  await seedDiscovery(root, state);
  await saveState(root, state);
  return {
    root,
    state,
    api,
    ctx,
    ui,
    events,
    command: async (name: string, args = '') =>
      commands.get(name)!.handler(args, ctx),
    tool: async (name: string, params: unknown, signal?: AbortSignal) =>
      tools.get(name)!.execute('call', params, signal, undefined, ctx),
  };
}
