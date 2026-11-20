import path from 'node:path';
import type { EvidenceModelOptions } from '../session/evidenceAgentSession.js';
import type { StoryAgent } from './types.js';

export type StoryAgentOptions = EvidenceModelOptions;

const resolveModel = async (options: StoryAgentOptions) => {
  const { modelRuntime, model, thinkingLevel } = options;
  if (modelRuntime && model) return { modelRuntime, model, thinkingLevel };

  // Standalone callers (including the CLI) use Pi's global selection and
  // credentials, but never load working-copy instructions or extensions.
  const { getAgentDir, ModelRuntime, SettingsManager } = await import(
    '@earendil-works/pi-coding-agent'
  );
  const agentDir = options.agentDir ?? getAgentDir();
  const settings = SettingsManager.create(process.cwd(), agentDir, {
    projectTrusted: false,
  });
  const runtime =
    modelRuntime ??
    (await ModelRuntime.create({
      authPath: path.join(agentDir, 'auth.json'),
      modelsPath: path.join(agentDir, 'models.json'),
      allowModelNetwork: false,
    }));
  const provider = settings.getDefaultProvider();
  const id = settings.getDefaultModel();
  const available = model ? [] : await runtime.getAvailable();
  const selected =
    model ??
    available.find((m) => m.provider === provider && m.id === id) ??
    available[0];
  if (!selected)
    throw new Error('AI_NOT_CONFIGURED: no available story model.');
  return {
    modelRuntime: runtime,
    model: selected,
    thinkingLevel: thinkingLevel ?? settings.getDefaultThinkingLevel(),
  };
};

/** Stateless model completion. Offline and cached projections never resolve a model. */
export const createStoryAgent = (
  options: StoryAgentOptions = {},
): StoryAgent => {
  let selection: ReturnType<typeof resolveModel> | undefined;
  return {
    async generate({ systemPrompt, userPrompt }) {
      selection ??= resolveModel(options).catch((error: unknown) => {
        selection = undefined;
        throw error;
      });
      const { modelRuntime, model, thinkingLevel } = await selection;
      const response = await modelRuntime.completeSimple(
        model,
        {
          systemPrompt,
          messages: [
            { role: 'user', content: userPrompt, timestamp: Date.now() },
          ],
        },
        thinkingLevel && thinkingLevel !== 'off'
          ? { reasoning: thinkingLevel }
          : undefined,
      );
      if (response.stopReason !== 'stop')
        throw new Error('Story model did not complete an assistant response.');
      const text = response.content
        .flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n')
        .trim();
      if (!text) throw new Error('Story model returned an empty response.');
      return text;
    },
  };
};
