import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlowStoryProjector } from '@evidence-poc/evidence-agent';
import {
  collectFlowScenarios,
  type FlowScenarioTrace,
} from '@evidence-poc/evidence-model-core';
import {
  writeModelBundle,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-io';
import { DomainModelDocumentSchema } from '@evidence-poc/evidence-schema';

import {
  STORY_IPC_CHANNELS,
  type StoryProjectResult,
} from '@evidence-poc/desktop-contracts/story';
import { registerStoryIpc, type StoryIpcOptions } from './storyIpc';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (
      channel: string,
      handler: (...args: unknown[]) => Promise<unknown>,
    ) => electron.handlers.set(channel, handler),
    removeHandler: (channel: string) => electron.handlers.delete(channel),
  },
}));

const model = () =>
  DomainModelDocumentSchema.parse(
    JSON.parse(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          '../../../../libs/evidence-model-core/tests/fixtures/acceptance/procurement.evidence.json',
        ),
        'utf8',
      ),
    ),
  );
const sender = () => ({
  isDestroyed: () => false,
  once: vi.fn(),
  send: vi.fn(),
});
const invoke = <T = unknown>(
  channel: string,
  input: unknown,
  window = sender(),
) => electron.handlers.get(channel)!({ sender: window }, input) as Promise<T>;
const register = (options: StoryIpcOptions = {}) =>
  registerStoryIpc({ readModel: async () => model(), ...options });

afterEach(() => {
  electron.handlers.clear();
});

describe('story IPC', () => {
  it('keeps offline playback credential-free and invalidates AI projectors on configuration changes', async () => {
    const getModelOptions = vi.fn(async () => {
      throw new Error('AI_NOT_CONFIGURED');
    });
    const ipc = register({ getModelOptions });
    const window = sender();
    const flowId = collectFlowScenarios(model())[0].flowId;
    const input = { rootPath: '/models/p', flowId, skipAi: true };
    await invoke(STORY_IPC_CHANNELS.PROJECT, input, window);
    expect(getModelOptions).not.toHaveBeenCalled();
    await expect(
      invoke(STORY_IPC_CHANNELS.PROJECT, { ...input, skipAi: false }, window),
    ).rejects.toThrow('AI_NOT_CONFIGURED');
    ipc.resetModels();
    expect(window.send).toHaveBeenCalledWith(STORY_IPC_CHANNELS.INVALIDATED, {
      rootPath: '/models/p',
    });
    await invoke(STORY_IPC_CHANNELS.PROJECT, input, window);
    expect(getModelOptions).toHaveBeenCalledOnce();
  });
  it('does not cache a model acquired before a concurrent configuration change', async () => {
    let finish: (value: { agentDir: string }) => void = () => undefined;
    const getModelOptions = vi.fn(
      () =>
        new Promise<{ agentDir: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const ipc = register({ getModelOptions });
    const window = sender();
    const flowId = collectFlowScenarios(model())[0].flowId;
    const projection = invoke(
      STORY_IPC_CHANNELS.PROJECT,
      { rootPath: '/models/p', flowId },
      window,
    );
    await vi.waitFor(() => expect(getModelOptions).toHaveBeenCalled());
    ipc.resetModels();
    finish({ agentDir: '/obsolete' });
    await expect(projection).rejects.toThrow('模型配置已变化');
  });
  it('lists aggregated flows and includes completeness gaps', async () => {
    const readModel = vi.fn(async () => model());
    register({ readModel });
    const flows = await invoke<readonly FlowScenarioTrace[]>(
      STORY_IPC_CHANNELS.LIST_FLOWS,
      {
        rootPath: '/models/p',
      },
    );
    expect(readModel).toHaveBeenCalledWith('/models/p');
    expect(flows.map(({ flowId }: { flowId: string }) => flowId)).toEqual(
      collectFlowScenarios(model()).map(({ flowId }) => flowId),
    );
    expect(
      flows.flatMap((flow) => flow.steps).some((step) => step.gaps.length > 0),
    ).toBe(true);
  });

  it.each(['directory', 'bundle'])(
    'reads saved %s projects through the real adapters',
    async (kind) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'story-ipc-'));
      try {
        const rootPath =
          kind === 'bundle' ? path.join(root, 'model.evidence.json') : root;
        if (kind === 'bundle') await writeModelBundle(rootPath, model());
        else
          await writeModelDirectory(path.join(root, '.evidence/fm'), model());
        registerStoryIpc();
        expect(
          await invoke(STORY_IPC_CHANNELS.LIST_FLOWS, { rootPath }),
        ).toHaveLength(collectFlowScenarios(model()).length);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('projects unsaved snapshots without disk reads and reuses a per-window projector', async () => {
    const readModel = vi.fn();
    const createProjector = vi.fn(createFlowStoryProjector);
    register({ readModel, createProjector });
    const window = sender();
    const document = model();
    const flowId = collectFlowScenarios(document)[0]!.flowId;
    const input = { rootPath: '/models/p', document, flowId, skipAi: true };
    const first = await invoke<StoryProjectResult>(
      STORY_IPC_CHANNELS.PROJECT,
      input,
      window,
    );
    document.entities.find(
      ({ id }) => id === 'request.payment',
    )!.examples![0]!.value.quantity = 12;
    const second = await invoke<StoryProjectResult>(
      STORY_IPC_CHANNELS.PROJECT,
      input,
      window,
    );
    expect(readModel).not.toHaveBeenCalled();
    expect(createProjector).toHaveBeenCalledTimes(1);
    expect(first.flow.traceDigest).not.toBe(second.flow.traceDigest);
    expect(second.projection.scenes).toHaveLength(second.flow.steps.length);
    expect(
      second.projection.scenes.flatMap((scene) => scene.documentCard.fields),
    ).toContainEqual(
      expect.objectContaining({ name: 'quantity', value: '12' }),
    );
    expect(window.once).toHaveBeenCalledWith('destroyed', expect.any(Function));
    window.once.mock.calls[0]![1]();
    await invoke(STORY_IPC_CHANNELS.PROJECT, input, window);
    expect(createProjector).toHaveBeenCalledTimes(2);
  });

  it('isolates caches across windows and releases handlers on disposal', async () => {
    const createProjector = vi.fn(createFlowStoryProjector);
    const ipc = register({ createProjector });
    const input = {
      rootPath: '/models/p',
      flowId: collectFlowScenarios(model())[0]!.flowId,
      skipAi: true,
    };
    await invoke(STORY_IPC_CHANNELS.PROJECT, input);
    await invoke(STORY_IPC_CHANNELS.PROJECT, input);
    expect(createProjector).toHaveBeenCalledTimes(2);
    ipc.dispose();
    expect(electron.handlers.size).toBe(0);
  });

  it('forwards a current-step question to the read-only simulator', async () => {
    const simulate = vi
      .fn()
      .mockResolvedValue({ businessImpactExplanation: '触发付款不足规则' });
    register({ simulate });
    const document = model();
    const flow = collectFlowScenarios(document)[0]!;
    const step = flow.steps[0]!;
    const before = structuredClone(document);
    const result = await invoke<{ businessImpactExplanation: string }>(
      STORY_IPC_CHANNELS.WHAT_IF,
      {
        rootPath: '/models/p',
        document,
        flowId: flow.flowId,
        currentStepSequence: step.sequence,
        stepHash: step.stepHash,
        question: '  如果只付300？  ',
      },
    );
    expect(result.businessImpactExplanation).toBe('触发付款不足规则');
    expect(simulate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: document,
        currentStepSequence: step.sequence,
        hypothesisQuestion: '如果只付300？',
      }),
      expect.objectContaining({ agent: expect.any(Object) }),
    );
    expect(document).toEqual(before);
  });

  it('rejects invalid envelopes, unknown flows, empty questions and stale steps', async () => {
    const simulate = vi.fn();
    register({ simulate });
    await expect(
      invoke(STORY_IPC_CHANNELS.LIST_FLOWS, { rootPath: 'relative' }),
    ).rejects.toThrow('路径');
    await expect(
      invoke(STORY_IPC_CHANNELS.PROJECT, { rootPath: '/p', flowId: 'missing' }),
    ).rejects.toThrow('未找到业务流');
    await expect(
      invoke(STORY_IPC_CHANNELS.WHAT_IF, { question: ' ' }),
    ).rejects.toThrow('假设问题');
    await expect(
      invoke(STORY_IPC_CHANNELS.WHAT_IF, {
        rootPath: '/p',
        flowId: collectFlowScenarios(model())[0]!.flowId,
        currentStepSequence: 1,
        stepHash: 'obsolete',
        question: '付款300？',
      }),
    ).rejects.toThrow('已变化');
    expect(simulate).not.toHaveBeenCalled();
  });
});
