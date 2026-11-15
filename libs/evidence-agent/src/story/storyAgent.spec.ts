import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoryAgent } from './storyAgent.js';

const fake = vi.hoisted(() => ({
  reload: vi.fn(),
  prompt: vi.fn(),
  dispose: vi.fn(),
  getLastAssistantText: vi.fn(),
  createAgentSession: vi.fn(),
  inMemory: vi.fn(),
  resourceOptions: {} as Record<string, unknown>,
  messages: [{ role: 'assistant', stopReason: 'stop' }],
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/agent',
  DefaultResourceLoader: class {
    constructor(options: Record<string, unknown>) {
      fake.resourceOptions = options;
    }
    reload = fake.reload;
  },
  SessionManager: { inMemory: fake.inMemory },
  createAgentSession: fake.createAgentSession,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fake.messages = [{ role: 'assistant', stopReason: 'stop' }];
  fake.prompt.mockResolvedValue(undefined);
  fake.reload.mockResolvedValue(undefined);
  fake.getLastAssistantText.mockReturnValue('{"narrative":"故事"}');
  fake.createAgentSession.mockImplementation(async () => ({
    session: {
      messages: fake.messages,
      prompt: fake.prompt,
      dispose: fake.dispose,
      getLastAssistantText: fake.getLastAssistantText,
    },
  }));
});

describe('tool-free story agent adapter', () => {
  it('loads lazily, uses isolated in-memory sessions and disables project discovery', async () => {
    const agent = createStoryAgent({ projectRoot: '/project' });
    expect(fake.createAgentSession).not.toHaveBeenCalled();
    const request = {
      systemPrompt: 'story instructions',
      userPrompt: 'local facts',
    };
    expect(await agent.generate(request)).toBe('{"narrative":"故事"}');
    await agent.generate(request);
    expect(fake.createAgentSession).toHaveBeenCalledTimes(2);
    expect(fake.inMemory).toHaveBeenCalledWith('/project');
    expect(fake.resourceOptions).toMatchObject({
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noContextFiles: true,
      noThemes: true,
    });
    expect((fake.resourceOptions.systemPromptOverride as () => string)()).toBe(
      request.systemPrompt,
    );
    expect(fake.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/project', noTools: 'all', tools: [] }),
    );
    expect(fake.prompt).toHaveBeenCalledWith('local facts');
    expect(fake.dispose).toHaveBeenCalledTimes(2);
  });

  it('disposes a session after a provider failure', async () => {
    fake.prompt.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(
      createStoryAgent().generate({ systemPrompt: 's', userPrompt: 'u' }),
    ).rejects.toThrow('provider unavailable');
    expect(fake.dispose).toHaveBeenCalledOnce();
  });

  it.each(['error', 'aborted'])(
    'refuses a partial %s response',
    async (stopReason) => {
      fake.messages = [{ role: 'assistant', stopReason }];
      await expect(
        createStoryAgent().generate({ systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow('did not complete');
      expect(fake.dispose).toHaveBeenCalledOnce();
    },
  );

  it('rejects empty model output rather than caching a success', async () => {
    fake.getLastAssistantText.mockReturnValue(' ');
    await expect(
      createStoryAgent().generate({ systemPrompt: 's', userPrompt: 'u' }),
    ).rejects.toThrow('empty response');
    expect(fake.dispose).toHaveBeenCalledOnce();
  });
});
