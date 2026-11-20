import { access, mkdtemp, rename, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import type {
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type { EvidenceModelOptions } from '@evidence-poc/evidence-agent';
import {
  AI_NOT_CONFIGURED,
  AI_PROVIDER_PRESETS,
  type AiConfigStatus,
  type SaveAiConfigRequest,
  type SupportedProviderId,
  type TestAiConnectionResult,
} from '@evidence-poc/desktop-contracts/aiConfig';
import {
  createPiRuntime,
  parsePiObject,
  readPiFile,
  readPiSettings,
  savePiKey,
  savePiSelection,
} from './piAgentConfig';
import {
  piJson,
  readLegacyAuth,
  replacePiFile,
  updatePiFiles,
  type LegacyCredentialEncryption,
} from './piConfigFiles';
import {
  configuredBaseUrl,
  mergeLegacyModels,
  normalizeBaseUrl,
  qwen,
  qwenModels,
  updateModels,
} from './piModelConfig';

export const validateAiRequest = (input: unknown): SaveAiConfigRequest => {
  const r = input as SaveAiConfigRequest | null;
  if (
    !r ||
    !AI_PROVIDER_PRESETS.some((p) => p.id === r.providerId) ||
    typeof r.modelId !== 'string' ||
    !r.modelId.trim() ||
    r.modelId.length > 200 ||
    typeof r.apiKey !== 'string' ||
    r.apiKey.length > 16384 ||
    r.apiKey.trim().startsWith('!') ||
    (r.thinkingLevel !== undefined &&
      !['off', 'low', 'medium', 'high'].includes(r.thinkingLevel))
  )
    throw new Error('无效的 AI 模型配置。');
  const baseUrl = normalizeBaseUrl(r.baseUrl);
  if (r.baseUrl !== undefined && r.baseUrl !== '' && baseUrl === undefined)
    throw new Error('Base URL 必须是无凭证、查询参数或片段的 HTTP(S) 地址。');
  if (r.providerId === 'custom-openai-compatible' && !baseUrl)
    throw new Error('请填写自定义端点 Base URL。');
  return {
    providerId: r.providerId,
    modelId: r.modelId.trim(),
    apiKey: r.apiKey.trim(),
    ...(baseUrl ? { baseUrl } : {}),
    thinkingLevel: r.thinkingLevel ?? 'off',
  };
};

const selectedModel = (
  available: Awaited<ReturnType<ModelRuntime['getAvailable']>>,
  settings: SettingsManager,
) => {
  const provider = settings.getDefaultProvider();
  const id = settings.getDefaultModel();
  if (provider || id)
    return available.find((m) => m.provider === provider && m.id === id);
  return (
    available.find((m) =>
      AI_PROVIDER_PRESETS.some(
        (p) =>
          p.id === m.provider && p.recommendedModels.some((r) => r.id === m.id),
      ),
    ) ??
    available.find((m) => AI_PROVIDER_PRESETS.some((p) => p.id === m.provider))
  );
};

export class AiConfigService {
  private loaded:
    | Promise<{ runtime: ModelRuntime; settings: SettingsManager }>
    | undefined;
  private migration: Promise<void> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  readonly agentDir: string;

  constructor(
    private readonly options: {
      userDataPath: string;
      legacyEncryption?: LegacyCredentialEncryption;
      cliAuthPath?: string;
      createRuntime?: typeof ModelRuntime.create;
      connectionTimeoutMs?: number;
    },
  ) {
    this.agentDir = path.join(options.userDataPath, 'ai-agent');
  }

  onChanged(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    for (const listener of this.listeners) listener();
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private get cliAuthPath() {
    return (
      this.options.cliAuthPath ??
      path.join(homedir(), '.pi', 'agent', 'auth.json')
    );
  }
  private get modelsPath() {
    return path.join(this.agentDir, 'models.json');
  }
  private get authPath() {
    return path.join(this.agentDir, 'auth.json');
  }
  private get settingsPath() {
    return path.join(this.agentDir, 'settings.json');
  }

  private async buildRuntime(options?: Parameters<typeof createPiRuntime>[1]) {
    const runtime = await createPiRuntime(this.agentDir, {
      createRuntime: this.options.createRuntime,
      ...options,
    });
    if (runtime.getError()) throw new Error('无法加载 Pi 模型配置。');
    // DashScope pay-as-you-go is not a built-in provider in the pinned SDK.
    // Keep its preset available before the user has ever saved a configuration.
    if (!runtime.getProvider('qwen'))
      runtime.registerProvider('qwen', {
        api: 'openai-completions',
        baseUrl: qwen.defaultBaseUrl,
        authHeader: true,
        models: qwenModels,
      });
    const envKey = process.env.DASHSCOPE_API_KEY ?? process.env.QWEN_API_KEY;
    if (envKey && !(await runtime.getAuth('qwen')))
      await runtime.setRuntimeApiKey('qwen', envKey);
    const custom = runtime.getProvider('custom-openai-compatible');
    const baseUrl = custom?.baseUrl;
    if (
      baseUrl &&
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseUrl).hostname) &&
      !(await runtime.getAuth(custom.id))
    )
      await runtime.setRuntimeApiKey(custom.id, 'local-keyless');
    return runtime;
  }

  private async migrateLegacy() {
    const legacy = (file: string) => path.join(this.options.userDataPath, file);
    const [selection, auth, models] = await Promise.all([
      readPiFile(legacy('ai-settings.json')),
      readLegacyAuth(legacy('ai-auth.bin'), this.options.legacyEncryption),
      readPiFile(legacy('ai-models.json')),
    ]);
    if (selection === undefined && auth === undefined && models === undefined)
      return;
    const raw = selection === undefined ? undefined : parsePiObject(selection);
    const previous =
      raw &&
      validateAiRequest({
        providerId: raw.activeProviderId,
        modelId: raw.activeModelId,
        baseUrl: raw.baseUrl,
        thinkingLevel: raw.thinkingLevel,
        apiKey: '',
      });
    const settings = await readPiSettings(this.agentDir);
    const useLegacySelection =
      previous && !settings.getDefaultProvider() && !settings.getDefaultModel();
    const source = mergeLegacyModels(await readPiFile(this.modelsPath), models);
    const mergedModels = useLegacySelection
      ? updateModels(source, previous)
      : source;
    const nativeAuth = await readPiFile(this.authPath);
    const nativeCredentials =
      nativeAuth === undefined ? {} : parsePiObject(nativeAuth);

    await updatePiFiles(async (replace, track) => {
      await replace(this.modelsPath, mergedModels);
      if (auth)
        await replace(this.authPath, piJson({ ...auth, ...nativeCredentials }));
      // Verify that Pi can read the migrated definitions before retiring the legacy files.
      await this.buildRuntime();
      if (useLegacySelection) {
        track(this.settingsPath, await readPiFile(this.settingsPath));
        await savePiSelection(
          this.agentDir,
          settings,
          previous.providerId,
          previous.modelId,
          previous.thinkingLevel,
        );
      }
    });
    for (const [file, present] of [
      ['ai-settings.json', selection],
      ['ai-auth.bin', auth],
      ['ai-models.json', models],
    ] as const) {
      if (present !== undefined)
        await rename(legacy(file), legacy(`${file}.migrated`));
    }
  }

  private async initialize() {
    this.migration ??= this.migrateLegacy().catch((error: unknown) => {
      this.migration = undefined;
      throw error;
    });
    await this.migration;
  }
  private async load() {
    await this.queue;
    await this.initialize();
    this.loaded ??= Promise.all([
      this.buildRuntime(),
      readPiSettings(this.agentDir),
    ])
      .then(([runtime, settings]) => ({ runtime, settings }))
      .catch((error: unknown) => {
        this.loaded = undefined;
        throw error;
      });
    return this.loaded;
  }
  async getRuntime() {
    return (await this.load()).runtime;
  }

  async getModelOptions(): Promise<EvidenceModelOptions> {
    let state: Awaited<ReturnType<AiConfigService['load']>>;
    try {
      state = await this.load();
    } catch {
      throw new Error(`${AI_NOT_CONFIGURED}: 无法加载桌面 Pi 配置。`);
    }
    const { runtime, settings } = state;
    const model = selectedModel(await runtime.getAvailable(), settings);
    if (!model)
      throw new Error(`${AI_NOT_CONFIGURED}: 请先配置大模型提供商与 API Key。`);
    return {
      agentDir: this.agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: this.thinkingLevel(settings),
    };
  }

  private thinkingLevel(settings: SettingsManager) {
    const level = settings.getDefaultThinkingLevel();
    return level === 'low' || level === 'medium' || level === 'high'
      ? level
      : 'off';
  }

  async getStatus(): Promise<AiConfigStatus> {
    const hasLocalPiCliConfig = await access(this.cliAuthPath).then(
      () => true,
      () => false,
    );
    try {
      const { runtime, settings } = await this.load();
      const available = await runtime.getAvailable();
      const model = selectedModel(available, settings);
      const provider = settings.getDefaultProvider() ?? model?.provider;
      const id = settings.getDefaultModel() ?? model?.id;
      return {
        isConfigured: !!model,
        activeProviderId:
          AI_PROVIDER_PRESETS.find((p) => p.id === provider)?.id ?? null,
        activeModelId: id ?? null,
        baseUrl: configuredBaseUrl(await readPiFile(this.modelsPath), provider),
        thinkingLevel: this.thinkingLevel(settings),
        hasLocalPiCliConfig,
        availableModels: available.map(({ provider, id, name }) => ({
          provider,
          id,
          name,
        })),
      };
    } catch {
      return {
        isConfigured: false,
        activeProviderId: null,
        activeModelId: null,
        thinkingLevel: 'off',
        hasLocalPiCliConfig,
        availableModels: [],
        error: '无法加载桌面 Pi 配置；若正在升级，请解锁旧凭证的系统密钥环。',
      };
    }
  }

  /** Preview exactly the models.json we would save. A draft key stays in memory. */
  private async withDraft<T>(
    request: SaveAiConfigRequest,
    models: string | undefined,
    run: (runtime: ModelRuntime) => Promise<T>,
  ) {
    const dir = await mkdtemp(path.join(tmpdir(), 'evidence-pi-draft-'));
    try {
      const modelsPath = path.join(dir, 'models.json');
      await replacePiFile(modelsPath, models);
      const credentials = request.apiKey
        ? new InMemoryCredentialStore()
        : undefined;
      await credentials?.modify(request.providerId, async () => ({
        type: 'api_key',
        key: request.apiKey,
      }));
      return await run(await this.buildRuntime({ modelsPath, credentials }));
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  }

  async save(input: unknown) {
    const request = validateAiRequest(input);
    return this.serialize(async () => {
      await this.initialize();
      const settings = await readPiSettings(this.agentDir);
      const models = updateModels(await readPiFile(this.modelsPath), request);
      const { providerId, modelId, apiKey, thinkingLevel } = request;
      await this.withDraft(request, models, async (runtime) => {
        if (!runtime.getModel(providerId, modelId))
          throw new Error(
            '该模型不在厂商目录中；私有模型请使用自定义兼容端点。',
          );
        if (
          !(await runtime.getAvailable(providerId)).some(
            (model) => model.id === modelId,
          )
        )
          throw new Error('请填写 API Key，或配置对应厂商的环境变量。');
      });
      const runtime = await updatePiFiles(async (replace, track) => {
        await replace(this.modelsPath, models);
        if (apiKey) track(this.authPath, await readPiFile(this.authPath));
        const writer = await this.buildRuntime({ persistAuth: !!apiKey });
        if (apiKey) await savePiKey(writer, providerId, apiKey);
        // Reopen so a previous runtime fallback (for example local-keyless)
        // cannot mask the just-saved key.
        const ready = apiKey ? await this.buildRuntime() : writer;
        track(this.settingsPath, await readPiFile(this.settingsPath));
        await savePiSelection(
          this.agentDir,
          settings,
          providerId,
          modelId,
          thinkingLevel,
        );
        return ready;
      });
      this.loaded = Promise.resolve({ runtime, settings });
      this.changed();
      return { success: true };
    });
  }

  async testConnection(input: unknown): Promise<TestAiConnectionResult> {
    const request = validateAiRequest(input);
    const started = Date.now();
    try {
      await this.queue;
      await this.initialize();
      const models = updateModels(await readPiFile(this.modelsPath), request);
      return await this.withDraft(request, models, async (runtime) => {
        const model = (await runtime.getAvailable(request.providerId)).find(
          ({ id }) => id === request.modelId,
        );
        if (!model)
          return {
            success: false,
            error: '模型不可用，请检查模型名称与 API Key。',
          };
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const deadline = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('AI connection timed out'));
            }, this.options.connectionTimeoutMs ?? 15000);
          });
          const response = await Promise.race([
            runtime.completeSimple(
              model,
              {
                messages: [
                  { role: 'user', content: 'Reply OK.', timestamp: Date.now() },
                ],
              },
              { maxTokens: 8, signal: controller.signal },
            ),
            deadline,
          ]);
          if (
            response.stopReason === 'error' ||
            response.stopReason === 'aborted'
          )
            throw new Error();
        } finally {
          clearTimeout(timer);
        }
        return { success: true, latencyMs: Date.now() - started };
      });
    } catch {
      return {
        success: false,
        error: '连接失败或超时，请检查 API Key、模型名称、Base URL 和网络。',
      };
    }
  }

  async importFromLocalPiCli() {
    const cli = await readPiFile(this.cliAuthPath);
    if (cli === undefined) throw new Error('无法读取本地 Pi CLI 凭证配置。');
    const data = parsePiObject(cli);
    return this.serialize(async () => {
      await this.initialize();
      const current = await readPiFile(this.authPath);
      const credentials = current === undefined ? {} : parsePiObject(current);
      let first: SupportedProviderId | undefined;
      for (const { id } of AI_PROVIDER_PRESETS) {
        const entry = data[id] as { type?: unknown; key?: unknown } | undefined;
        // Import only literal Pi keys, including escaped dollars/bangs. Never
        // import shell commands, env references, or rotating CLI credentials.
        if (
          entry?.type !== 'api_key' ||
          typeof entry.key !== 'string' ||
          !entry.key.trim() ||
          entry.key.trim().startsWith('!') ||
          entry.key.replace(/\$[!$]/g, '').includes('$') ||
          Object.hasOwn(credentials, id)
        )
          continue;
        credentials[id] = { type: 'api_key', key: entry.key };
        first ??= id;
      }
      if (!first) return { imported: false };
      await replacePiFile(this.authPath, piJson(credentials));
      this.loaded = undefined;
      this.changed();
      return { imported: true, providerId: first };
    });
  }
}
