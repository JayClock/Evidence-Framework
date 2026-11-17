import type { EvidenceModelOptions } from '../session/evidenceAgentSession.js';
import type { StoryAgent } from './types.js';

export interface StoryAgentOptions extends EvidenceModelOptions {
  readonly projectRoot?: string;
}

/**
 * A fresh, tool-free, in-memory conversation per request. Loading this factory
 * does not read credentials or initialize Pi; cached projections never do so.
 */
export const createStoryAgent = (
  options: StoryAgentOptions = {},
): StoryAgent => ({
  async generate({ systemPrompt, userPrompt }) {
    const sdk = await import('@earendil-works/pi-coding-agent');
    const cwd = options.projectRoot ?? process.cwd();
    const agentDir = options.agentDir ?? sdk.getAgentDir();
    const resourceLoader = new sdk.DefaultResourceLoader({
      cwd,
      agentDir,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
      appendSystemPromptOverride: () => [],
    });
    await resourceLoader.reload();
    const { session } = await sdk.createAgentSession({
      cwd,
      agentDir,
      modelRuntime: options.modelRuntime,
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      resourceLoader,
      sessionManager: sdk.SessionManager.inMemory(cwd),
      noTools: 'all',
      tools: [],
    });
    try {
      await session.prompt(userPrompt);
      const last = session.messages.at(-1);
      if (
        last?.role !== 'assistant' ||
        last.stopReason === 'error' ||
        last.stopReason === 'aborted'
      ) {
        throw new Error('Story agent did not complete an assistant response.');
      }
      const text = session.getLastAssistantText();
      if (!text?.trim())
        throw new Error('Story agent returned an empty response.');
      return text;
    } finally {
      session.dispose();
    }
  },
});
