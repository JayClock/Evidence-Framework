import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStoryAgent } from './storyAgent.js';

const sdk = vi.hoisted(() => ({
  createRuntime: vi.fn(),
  createSettings: vi.fn(),
}));
vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/pi/agent',
  ModelRuntime: { create: sdk.createRuntime },
  SettingsManager: { create: sdk.createSettings },
}));

const model = { provider: 'deepseek', id: 'private-model' } as Parameters<
  ModelRuntime['completeSimple']
>[0];
const completeSimple = vi.fn();
const getAvailable = vi.fn();
const modelRuntime = {
  completeSimple,
  getAvailable,
} as unknown as ModelRuntime;
const request = {
  systemPrompt: 'story instructions',
  userPrompt: 'local facts',
};

beforeEach(() => {
  vi.resetAllMocks();
  completeSimple.mockResolvedValue({
    stopReason: 'stop',
    content: [
      { type: 'thinking', thinking: 'not part of the answer' },
      { type: 'text', text: '{"narrative":' },
      { type: 'text', text: '"故事"}' },
    ],
  });
  getAvailable.mockResolvedValue([{ id: 'other' }, model]);
  sdk.createRuntime.mockResolvedValue(modelRuntime);
  sdk.createSettings.mockReturnValue({
    getDefaultProvider: () => model.provider,
    getDefaultModel: () => model.id,
    getDefaultThinkingLevel: () => 'medium',
  });
});

describe('stateless story completion', () => {
  it('uses explicit desktop dependencies and sends no history or tools', async () => {
    const agent = createStoryAgent({
      modelRuntime,
      model,
      thinkingLevel: 'high',
    });
    expect(completeSimple).not.toHaveBeenCalled();
    expect(JSON.parse((await agent.generate(request)) as string)).toEqual({
      narrative: '故事',
    });
    await agent.generate({ ...request, userPrompt: 'next scene' });
    expect(completeSimple).toHaveBeenLastCalledWith(
      model,
      {
        systemPrompt: request.systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'next scene',
            timestamp: expect.any(Number),
          },
        ],
      },
      { reasoning: 'high' },
    );
    expect(completeSimple).toHaveBeenCalledTimes(2);
    expect(sdk.createRuntime).not.toHaveBeenCalled();
    expect(sdk.createSettings).not.toHaveBeenCalled();
  });

  it('lazily resolves the CLI model from global Pi settings, without project discovery', async () => {
    const agent = createStoryAgent();
    expect(sdk.createRuntime).not.toHaveBeenCalled();
    await agent.generate(request);
    expect(sdk.createSettings).toHaveBeenCalledWith(
      process.cwd(),
      '/pi/agent',
      { projectTrusted: false },
    );
    expect(sdk.createRuntime).toHaveBeenCalledWith({
      authPath: '/pi/agent/auth.json',
      modelsPath: '/pi/agent/models.json',
      allowModelNetwork: false,
    });
    expect(completeSimple).toHaveBeenCalledWith(model, expect.anything(), {
      reasoning: 'medium',
    });
  });

  it('does not call the provider if no model is available', async () => {
    getAvailable.mockResolvedValue([]);
    await expect(createStoryAgent().generate(request)).rejects.toThrow(
      'AI_NOT_CONFIGURED',
    );
    expect(completeSimple).not.toHaveBeenCalled();
  });

  it.each(['error', 'aborted', 'length', 'toolUse'])(
    'rejects a partial %s response',
    async (stopReason) => {
      completeSimple.mockResolvedValue({
        stopReason,
        content: [{ type: 'text', text: 'partial' }],
      });
      await expect(
        createStoryAgent({ modelRuntime, model }).generate(request),
      ).rejects.toThrow('did not complete');
    },
  );

  it('rejects empty or reasoning-only output', async () => {
    completeSimple.mockResolvedValue({
      stopReason: 'stop',
      content: [{ type: 'thinking', thinking: 'hidden' }],
    });
    await expect(
      createStoryAgent({ modelRuntime, model }).generate(request),
    ).rejects.toThrow('empty response');
  });
});
