import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { CredentialStore } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { EvidenceModelOptions } from '@evidence-poc/evidence-agent';
import {
  AI_NOT_CONFIGURED,
  AI_PROVIDER_PRESETS,
  type AiConfigStatus,
  type AiUserSettings,
  type SaveAiConfigRequest,
  type TestAiConnectionResult,
} from '@evidence-poc/desktop-contracts/aiConfig';
import { isCredential } from './safeStorageStore';
import { writePrivateFile } from './privateFile';

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
    (r.thinkingLevel !== undefined &&
      !['off', 'low', 'medium', 'high'].includes(r.thinkingLevel))
  )
    throw new Error('无效的 AI 模型配置。');
  let baseUrl: string | undefined;
  if (r.baseUrl !== undefined && r.baseUrl !== '') {
    if (typeof r.baseUrl !== 'string' || r.baseUrl.length > 2048)
      throw new Error('无效的模型 Base URL。');
    try {
      const url = new URL(r.baseUrl);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
      baseUrl = url.toString().replace(/\/$/, '');
    } catch {
      throw new Error('Base URL 必须是无凭证、查询参数或片段的 HTTP(S) 地址。');
    }
  }
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

const settingsFor = (r: SaveAiConfigRequest): AiUserSettings => ({
  activeProviderId: r.providerId,
  activeModelId: r.modelId,
  ...(r.baseUrl ? { baseUrl: r.baseUrl } : {}),
  thinkingLevel: r.thinkingLevel ?? 'off',
});

export class AiConfigService {
  private runtime: Promise<ModelRuntime> | undefined;
  private settings: AiUserSettings | null | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private readonly configPath: string;
  readonly agentDir: string;

  constructor(
    private readonly options: {
      userDataPath: string;
      store: CredentialStore;
      cliAuthPath?: string;
      createRuntime?: typeof ModelRuntime.create;
      connectionTimeoutMs?: number;
    },
  ) {
    this.configPath = path.join(options.userDataPath, 'ai-settings.json');
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
  private async loadSettings() {
    if (this.settings !== undefined) return this.settings;
    try {
      const s = JSON.parse(
        await readFile(this.configPath, 'utf8'),
      ) as AiUserSettings;
      return (this.settings = settingsFor(
        validateAiRequest({
          providerId: s.activeProviderId,
          modelId: s.activeModelId,
          baseUrl: s.baseUrl,
          thinkingLevel: s.thinkingLevel,
          apiKey: '',
        }),
      ));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return (this.settings = null);
      throw new Error('AI 设置文件无法读取或已损坏；请重新保存模型配置。');
    }
  }
  private async buildRuntime(
    settings: AiUserSettings | null,
    store = this.options.store,
  ) {
    const create =
      this.options.createRuntime ??
      (await import('@earendil-works/pi-coding-agent')).ModelRuntime.create;
    const runtime = await create({
      credentials: store,
      modelsPath: path.join(this.options.userDataPath, 'ai-models.json'),
      modelsStorePath: path.join(
        this.options.userDataPath,
        'ai-models-store.json',
      ),
      allowModelNetwork: false,
    });
    if (settings) {
      const id = settings.activeProviderId;
      const existing = runtime.getModel(id, settings.activeModelId);
      if (id === 'qwen' || id === 'custom-openai-compatible') {
        runtime.registerProvider(id, {
          api: 'openai-completions',
          baseUrl:
            settings.baseUrl ??
            AI_PROVIDER_PRESETS.find((p) => p.id === id)?.defaultBaseUrl,
          authHeader: true,
          models: [
            {
              id: settings.activeModelId,
              name: settings.activeModelId,
              reasoning: false,
              input: ['text'],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 32768,
              maxTokens: 4096,
            },
          ],
        });
        if (!(await store.read(id))) {
          const envKey =
            id === 'qwen' ? process.env.DASHSCOPE_API_KEY : undefined;
          const local =
            settings.baseUrl &&
            ['localhost', '127.0.0.1', '[::1]'].includes(
              new URL(settings.baseUrl).hostname,
            );
          if (envKey || local)
            await runtime.setRuntimeApiKey(id, envKey ?? 'local-keyless');
        }
      } else if (existing && settings.baseUrl) {
        runtime.registerProvider(id, { baseUrl: settings.baseUrl });
      }
    }
    return runtime;
  }
  async getRuntime() {
    this.runtime ??= this.loadSettings().then((s) => this.buildRuntime(s));
    try {
      return await this.runtime;
    } catch (error) {
      this.runtime = undefined;
      throw error;
    }
  }
  private async resolveModel(
    runtime: ModelRuntime,
    settings: AiUserSettings | null,
  ) {
    const available = await runtime.getAvailable();
    if (settings)
      return available.find(
        (m) =>
          m.provider === settings.activeProviderId &&
          m.id === settings.activeModelId,
      );
    // Environment credentials work without importing or reading CLI credentials.
    return (
      available.find((m) =>
        AI_PROVIDER_PRESETS.some(
          (p) =>
            p.id === m.provider &&
            p.recommendedModels.some((r) => r.id === m.id),
        ),
      ) ?? available[0]
    );
  }
  async getModelOptions(): Promise<EvidenceModelOptions> {
    await this.queue;
    const runtime = await this.getRuntime();
    const settings = await this.loadSettings();
    const model = await this.resolveModel(runtime, settings);
    if (!model)
      throw new Error(`${AI_NOT_CONFIGURED}: 请先配置大模型提供商与 API Key。`);
    return {
      agentDir: this.agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: settings?.thinkingLevel ?? 'off',
    };
  }
  async getStatus(): Promise<AiConfigStatus> {
    await this.queue;
    const hasLocalPiCliConfig = await access(this.cliAuthPath).then(
      () => true,
      () => false,
    );
    try {
      const settings = await this.loadSettings();
      const runtime = await this.getRuntime();
      const available = await runtime.getAvailable();
      const model = await this.resolveModel(runtime, settings);
      return {
        isConfigured: !!model,
        activeProviderId:
          settings?.activeProviderId ??
          (model?.provider as AiConfigStatus['activeProviderId']) ??
          null,
        activeModelId: settings?.activeModelId ?? model?.id ?? null,
        baseUrl: settings?.baseUrl,
        thinkingLevel: settings?.thinkingLevel ?? 'off',
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
        error: '无法加载 AI 配置或安全凭证，请检查密钥环并重新保存设置。',
      };
    }
  }
  async save(input: unknown) {
    const request = validateAiRequest(input);
    return this.serialize(async () => {
      const settings = settingsFor(request);
      // Validate the model before touching credentials or settings.
      let runtime = await this.buildRuntime(settings);
      if (!runtime.getModel(request.providerId, request.modelId))
        throw new Error('该模型不在厂商目录中；私有模型请使用自定义兼容端点。');
      const previous = await this.options.store.read(request.providerId);
      if (request.apiKey)
        await this.options.store.modify(request.providerId, async () => ({
          type: 'api_key',
          key: request.apiKey,
        }));
      try {
        // Rebuild after persistence so a previous keyless/runtime override cannot
        // take precedence over the newly supplied credential.
        runtime = await this.buildRuntime(settings);
        await runtime.refresh({ allowNetwork: false });
        if (!(await this.resolveModel(runtime, settings)))
          throw new Error('请填写 API Key，或配置对应厂商的环境变量。');
        await writePrivateFile(
          this.configPath,
          JSON.stringify(settings, null, 2),
        );
      } catch (error) {
        if (request.apiKey) {
          if (previous)
            await this.options.store.modify(
              request.providerId,
              async () => previous,
            );
          else await this.options.store.delete(request.providerId);
        }
        throw error;
      }
      this.settings = settings;
      this.runtime = Promise.resolve(runtime);
      this.changed();
      return { success: true };
    });
  }
  async testConnection(input: unknown): Promise<TestAiConnectionResult> {
    const request = validateAiRequest(input);
    const started = Date.now();
    try {
      const { InMemoryCredentialStore } = await import('@earendil-works/pi-ai');
      const store = new InMemoryCredentialStore();
      const existing = await this.options.store.read(request.providerId);
      if (request.apiKey || existing)
        await store.modify(request.providerId, async () =>
          request.apiKey ? { type: 'api_key', key: request.apiKey } : existing,
        );
      const settings = settingsFor(request);
      const runtime = await this.buildRuntime(settings, store);
      const model = await this.resolveModel(runtime, settings);
      if (!model)
        return {
          success: false,
          error: '模型不可用，请检查模型名称与 API Key。',
        };
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.options.connectionTimeoutMs ?? 15000,
      );
      try {
        const response = await runtime.completeSimple(
          model,
          {
            messages: [
              { role: 'user', content: 'Reply OK.', timestamp: Date.now() },
            ],
          },
          { maxTokens: 8, signal: controller.signal },
        );
        if (
          response.stopReason === 'error' ||
          response.stopReason === 'aborted'
        )
          throw new Error();
      } finally {
        clearTimeout(timer);
      }
      return { success: true, latencyMs: Date.now() - started };
    } catch {
      return {
        success: false,
        error: '连接失败或超时，请检查 API Key、模型名称、Base URL 和网络。',
      };
    }
  }
  async importFromLocalPiCli() {
    // Explicit, read-only, literal credentials only: never execute CLI key commands.
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(await readFile(this.cliAuthPath, 'utf8'));
    } catch {
      throw new Error('无法读取本地 Pi CLI 凭证配置。');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('无效的 Pi CLI 凭证配置。');
    const providerId = await this.serialize(async () => {
      let first: string | undefined;
      for (const preset of AI_PROVIDER_PRESETS) {
        const credential = data[preset.id];
        if (!isCredential(credential)) continue;
        if (!(await this.options.store.read(preset.id)))
          await this.options.store.modify(preset.id, async () => credential);
        first ??= preset.id;
      }
      this.runtime = undefined;
      this.changed();
      return first;
    });
    return { imported: !!providerId, ...(providerId ? { providerId } : {}) };
  }
}
