import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import {
  AI_PROVIDER_PRESETS,
  type SaveAiConfigRequest,
} from '@evidence-poc/desktop-contracts/aiConfig';
import { piJson } from './piConfigFiles';

export const qwen = AI_PROVIDER_PRESETS.find(({ id }) => id === 'qwen')!;
const compatibleDefinition = (id: string) => ({
  id,
  name: id,
  reasoning: false,
  input: ['text' as const],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 32768,
  maxTokens: 4096,
});
export const qwenModels = qwen.recommendedModels.map(({ id }) =>
  compatibleDefinition(id),
);

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const modelConfig = (source: string) => {
  const errors: ParseError[] = [];
  const result: unknown = parse(source.replace(/^\uFEFF/, ''), errors);
  if (
    errors.length ||
    !isObject(result) ||
    !isObject(result.providers) ||
    !Object.values(result.providers).every(isObject)
  )
    throw new Error('无法读取 Pi models.json。');
  return result as { providers: Record<string, Record<string, unknown>> };
};

export const normalizeBaseUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return url.toString().replace(/\/$/, '');
  } catch {
    // Malformed URL or a non-web scheme: do not leak it to the renderer.
  }
  return undefined;
};

export const configuredBaseUrl = (
  source: string | undefined,
  providerId: string | undefined,
) =>
  source === undefined || !providerId
    ? undefined
    : normalizeBaseUrl(modelConfig(source).providers[providerId]?.baseUrl);

/** Change only the selected provider. Other native definitions and comments stay intact. */
export const updateModels = (
  source: string | undefined,
  { providerId, modelId, baseUrl }: SaveAiConfigRequest,
) => {
  const original = source ?? piJson({ providers: {} });
  const prior = modelConfig(original).providers[providerId];
  const provider = { ...prior };
  delete provider.baseUrl;
  if (baseUrl) provider.baseUrl = baseUrl;
  if (providerId === 'qwen' || providerId === 'custom-openai-compatible') {
    provider.baseUrl ??= qwen.defaultBaseUrl;
    provider.api ??= 'openai-completions';
    provider.authHeader ??= true;
    const models = (provider.models ?? []) as { id: string }[];
    const defaults = providerId === 'qwen' ? qwenModels : [];
    provider.models = [
      ...new Map(
        [...defaults, compatibleDefinition(modelId), ...models].map((m) => [
          m.id,
          m,
        ]),
      ).values(),
    ];
  }
  const next = Object.keys(provider).length ? provider : undefined;
  if (JSON.stringify(prior) === JSON.stringify(next)) return source;
  return applyEdits(
    original,
    modify(original, ['providers', providerId], next, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  );
};

export const mergeLegacyModels = (
  native: string | undefined,
  legacy: string | undefined,
) => {
  if (native === undefined || legacy === undefined) return native ?? legacy;
  const current = modelConfig(native);
  return piJson({
    ...current,
    providers: { ...modelConfig(legacy).providers, ...current.providers },
  });
};
