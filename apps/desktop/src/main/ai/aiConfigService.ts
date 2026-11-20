import path from 'node:path';
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from '@earendil-works/pi-ai';
import type {
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type { EvidenceModelOptions } from '@evidence-poc/evidence-agent';
import {
  AI_NOT_CONFIGURED,
  AI_THINKING_LEVELS,
  type AiConfigStatus,
  type ModelRef,
  type SelectModelRequest,
  type TestAiConnectionResult,
} from '@evidence-poc/desktop-contracts/aiConfig';

type Model = Parameters<ModelRuntime['completeSimple']>[0];
const matches = (model: Model, ref: ModelRef) =>
  model.provider === ref.providerId && model.id === ref.modelId;

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 512;

const parseSelection = (input: unknown): SelectModelRequest => {
  const request = input as Partial<SelectModelRequest> | null;
  if (
    !isId(request?.providerId) ||
    !isId(request.modelId) ||
    (request.thinkingLevel !== undefined &&
      !AI_THINKING_LEVELS.includes(request.thinkingLevel))
  )
    throw new Error('无效的 Pi 模型选项。');
  return request as SelectModelRequest;
};

const savedModel = (available: readonly Model[], settings: SettingsManager) =>
  available.find(
    ({ provider, id }) =>
      provider === settings.getDefaultProvider() &&
      id === settings.getDefaultModel(),
  );

const thinkingLevel = (model: Model, settings: SettingsManager) =>
  clampThinkingLevel(
    model,
    settings.getModelThinkingLevel(model.provider, model.id) ??
      settings.getDefaultThinkingLevel() ??
      'off',
  );

export class AiConfigService {
  private state?: Promise<{ runtime: ModelRuntime; settings: SettingsManager }>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: {
      agentDir: string;
      connectionTimeoutMs?: number;
    },
  ) {}

  get agentDir() {
    return this.options.agentDir;
  }

  private async readSettings() {
    const { SettingsManager } = await import('@earendil-works/pi-coding-agent');
    const settings = SettingsManager.create(
      process.cwd(),
      this.options.agentDir,
      {
        projectTrusted: false,
      },
    );
    if (settings.drainErrors().length) throw new Error('无法读取 Pi 设置。');
    return settings;
  }

  private async loadRuntime() {
    const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
    const { agentDir } = this.options;
    const runtime = await ModelRuntime.create({
      authPath: path.join(agentDir, 'auth.json'),
      modelsPath: path.join(agentDir, 'models.json'),
      modelsStorePath: path.join(agentDir, 'models-store.json'),
      allowModelNetwork: false,
    });
    if (runtime.getError() && !runtime.getAvailableSnapshot().length)
      throw new Error('无法加载 Pi 模型配置。');
    return runtime;
  }

  private load() {
    this.state ??= Promise.all([this.loadRuntime(), this.readSettings()]).then(
      ([runtime, settings]) => ({ runtime, settings }),
    );
    return this.state;
  }

  private serialize<T>(action: () => Promise<T>) {
    const work = this.queue.then(action);
    this.queue = work.catch(() => undefined);
    return work;
  }

  reload() {
    return this.serialize(async () => {
      this.state = undefined;
    });
  }

  private async loadSelection() {
    await this.queue;
    const { runtime, settings } = await this.load();
    const available = runtime.getAvailableSnapshot();
    const saved = savedModel(available, settings);
    return {
      runtime,
      settings,
      available,
      saved,
      model: saved ?? available[0],
    };
  }

  async getModelOptions(): Promise<EvidenceModelOptions> {
    const { runtime, settings, model } = await this.loadSelection().catch(
      () => {
        throw new Error(`${AI_NOT_CONFIGURED}: 无法读取 Pi 配置。`);
      },
    );
    if (!model)
      throw new Error(`${AI_NOT_CONFIGURED}: 请先在 Pi 中配置可用模型。`);
    return {
      agentDir: this.options.agentDir,
      modelRuntime: runtime,
      model,
      thinkingLevel: thinkingLevel(model, settings),
    };
  }

  async getStatus(): Promise<AiConfigStatus> {
    const empty: AiConfigStatus = {
      agentDir: this.options.agentDir,
      isConfigured: false,
      activeProviderId: null,
      activeModelId: null,
      activeModelName: null,
      thinkingLevel: 'off',
      availableModels: [],
    };
    try {
      const { settings, available, saved, model } = await this.loadSelection();
      const notice =
        !saved && (settings.getDefaultProvider() || settings.getDefaultModel())
          ? 'Pi 默认模型不可用。请选择一个可用模型，或在 Pi 中检查配置。'
          : undefined;
      return {
        ...empty,
        isConfigured: model !== undefined,
        activeProviderId: model?.provider ?? null,
        activeModelId: model?.id ?? null,
        activeModelName: model?.name ?? null,
        thinkingLevel: model ? thinkingLevel(model, settings) : 'off',
        availableModels: available.map((entry) => ({
          provider: entry.provider,
          id: entry.id,
          name: entry.name,
          thinkingLevels: getSupportedThinkingLevels(entry),
        })),
        notice,
      };
    } catch {
      return { ...empty, error: '无法读取 Pi 配置，请检查配置文件与权限。' };
    }
  }

  async selectModel(input: unknown): Promise<void> {
    const request = parseSelection(input);
    return this.serialize(async () => {
      const { runtime } = await this.load();
      const settings = await this.readSettings();
      const model = runtime
        .getAvailableSnapshot()
        .find((m) => matches(m, request));
      if (!model) throw new Error('所选 Pi 模型不可用。');
      if (
        request.thinkingLevel !== undefined &&
        !getSupportedThinkingLevels(model).includes(request.thinkingLevel)
      )
        throw new Error('所选 Pi 模型不支持此思考级别。');
      settings.setDefaultModelAndProvider(model.provider, model.id);
      if (request.thinkingLevel !== undefined) {
        settings.setDefaultThinkingLevel(request.thinkingLevel);
        settings.setModelThinkingLevel(
          model.provider,
          model.id,
          request.thinkingLevel,
        );
      }
      await settings.flush();
      if (settings.drainErrors().length) throw new Error('无法保存 Pi 设置。');
      this.state = Promise.resolve({ runtime, settings });
    });
  }

  async testConnection(input: unknown): Promise<TestAiConnectionResult> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = parseSelection(input);
      await this.queue;
      const { runtime } = await this.load();
      const model = runtime
        .getAvailableSnapshot()
        .find((m) => matches(m, request));
      if (!model) return { success: false, error: '所选 Pi 模型不可用。' };
      const controller = new AbortController();
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('AI connection timed out'));
        }, this.options.connectionTimeoutMs ?? 15_000);
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
      if (response.stopReason !== 'stop' && response.stopReason !== 'length')
        throw new Error('No completion');
      return { success: true, latencyMs: Date.now() - started };
    } catch {
      return {
        success: false,
        error: '连接失败或超时，请检查 Pi 模型配置与网络。',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
