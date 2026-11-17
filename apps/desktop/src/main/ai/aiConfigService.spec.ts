import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiConfigService, validateAiRequest } from './aiConfigService';

const directories: string[] = [];
const setup = async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'ai-config-'));
  directories.push(userDataPath);
  const store = new InMemoryCredentialStore();
  const createRuntime = vi.fn(ModelRuntime.create);
  const cliAuthPath = path.join(userDataPath, 'cli-auth.json');
  return {
    userDataPath,
    store,
    createRuntime,
    cliAuthPath,
    service: new AiConfigService({
      userDataPath,
      store,
      createRuntime,
      cliAuthPath,
    }),
  };
};
const request = {
  providerId: 'custom-openai-compatible' as const,
  modelId: 'private-model',
  apiKey: 'secret-desktop-key',
  baseUrl: 'https://gateway.example/v1',
  thinkingLevel: 'low' as const,
};
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe('AI configuration with the pinned Pi SDK', () => {
  it('isolates all runtime paths, persists only public settings and restores selection', async () => {
    const f = await setup();
    await f.service.save(request);
    const options = await f.service.getModelOptions();
    expect(options.agentDir).toBe(path.join(f.userDataPath, 'ai-agent'));
    expect(options.model).toMatchObject({
      id: request.modelId,
      provider: request.providerId,
      baseUrl: request.baseUrl,
    });
    expect(options.thinkingLevel).toBe('low');
    expect(f.createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: f.store,
        modelsPath: path.join(f.userDataPath, 'ai-models.json'),
        modelsStorePath: path.join(f.userDataPath, 'ai-models-store.json'),
        allowModelNetwork: false,
      }),
    );
    const settings = await readFile(
      path.join(f.userDataPath, 'ai-settings.json'),
      'utf8',
    );
    expect(settings).not.toContain(request.apiKey);
    expect(JSON.stringify(await f.service.getStatus())).not.toContain(
      request.apiKey,
    );
    const restored = new AiConfigService({
      userDataPath: f.userDataPath,
      store: f.store,
      cliAuthPath: f.cliAuthPath,
    });
    expect((await restored.getStatus()).isConfigured).toBe(true);
    expect((await restored.getModelOptions()).model?.id).toBe(request.modelId);
  });
  it('retains a saved key for blank input; supports keyless loopback without masking a new key', async () => {
    const { service, store } = await setup();
    await service.save({
      ...request,
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
    });
    expect((await service.getStatus()).isConfigured).toBe(true);
    await service.save({ ...request, baseUrl: 'http://localhost:11434/v1' });
    const runtime = await service.getRuntime();
    expect((await runtime.getAuth(request.providerId))?.auth.apiKey).toBe(
      request.apiKey,
    );
    await service.save({ ...request, apiKey: '' });
    expect(await store.read(request.providerId)).toEqual({
      type: 'api_key',
      key: request.apiKey,
    });
  });
  it('detects DashScope environment credentials without CLI or prior settings', async () => {
    vi.stubEnv('DASHSCOPE_API_KEY', 'env-qwen-key');
    const f = await setup();
    const status = await f.service.getStatus();
    expect(status.availableModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'qwen', id: 'qwen-plus' }),
      ]),
    );
    await f.service.save({
      ...request,
      providerId: 'qwen',
      modelId: 'qwen-plus',
      apiKey: '',
      baseUrl: undefined,
    });
    expect(
      (await (await f.service.getRuntime()).getAuth('qwen'))?.auth.apiKey,
    ).toBe('env-qwen-key');
    expect(await f.store.list()).toEqual([]);
  });
  it('checks a real local OpenAI-compatible endpoint through the SDK without saving credentials', async () => {
    const f = await setup();
    let body = '';
    let authorization: string | undefined;
    const server = createServer(async (req, res) => {
      authorization = req.headers.authorization;
      for await (const chunk of req) body += chunk.toString();
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (delta: object, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 0, model: 'local-test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
      res.end(
        event({ role: 'assistant', content: 'OK' }, null) +
          event({}, 'stop') +
          'data: [DONE]\n\n',
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
      const result = await f.service.testConnection({
        ...request,
        baseUrl,
        apiKey: '',
      });
      expect(result).toMatchObject({
        success: true,
        latencyMs: expect.any(Number),
      });
      expect(JSON.parse(body)).toMatchObject({
        model: request.modelId,
        stream: true,
      });
      expect(authorization).toBe('Bearer local-keyless');
      expect(await f.store.list()).toEqual([]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it('bounds a provider that ignores abort and does not leak draft credentials', async () => {
    const f = await setup();
    let signal: AbortSignal | undefined;
    const service = new AiConfigService({
      ...f,
      connectionTimeoutMs: 10,
      createRuntime: async (options) => {
        const runtime = await ModelRuntime.create(options);
        vi.spyOn(runtime, 'completeSimple').mockImplementation(
          async (_model, _context, options) => {
            signal = options?.signal;
            return new Promise(() => undefined);
          },
        );
        return runtime;
      },
    });
    expect(await service.testConnection(request)).toMatchObject({
      success: false,
      error: expect.stringContaining('超时'),
    });
    expect(signal?.aborted).toBe(true);
    expect(await f.store.list()).toEqual([]);
  });
  it('registers Qwen compatible models and preserves SDK protocols for built-ins', async () => {
    const { service } = await setup();
    await service.save({
      ...request,
      providerId: 'qwen',
      modelId: 'qwen-plus',
      baseUrl: undefined,
    });
    expect((await service.getModelOptions()).model).toMatchObject({
      provider: 'qwen',
      api: 'openai-completions',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    await service.save({
      ...request,
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });
    expect((await service.getModelOptions()).model).toMatchObject({
      provider: 'anthropic',
      api: 'anthropic-messages',
      baseUrl: request.baseUrl,
    });
  });
  it('never automatically reads CLI credentials and imports literals only without overwriting desktop keys', async () => {
    const f = await setup();
    const cli = JSON.stringify({
      deepseek: { type: 'api_key', key: 'cli-key' },
      openai: { type: 'api_key', key: '!echo dangerous' },
    });
    await writeFile(f.cliAuthPath, cli);
    expect((await f.service.getStatus()).hasLocalPiCliConfig).toBe(true);
    expect(await f.store.list()).toEqual([]);
    expect(await f.service.importFromLocalPiCli()).toEqual({
      imported: true,
      providerId: 'deepseek',
    });
    expect(await f.store.read('deepseek')).toMatchObject({ key: 'cli-key' });
    expect(await f.store.read('openai')).toBeUndefined();
    await f.store.modify('deepseek', async () => ({
      type: 'api_key',
      key: 'desktop-wins',
    }));
    await f.service.importFromLocalPiCli();
    expect(await f.store.read('deepseek')).toMatchObject({
      key: 'desktop-wins',
    });
    expect(await readFile(f.cliAuthPath, 'utf8')).toBe(cli);
  });
  it('tests with a temporary runtime, performs a real completion path and redacts provider errors', async () => {
    const f = await setup();
    const complete = vi.fn().mockResolvedValue({ stopReason: 'stop' });
    const service = new AiConfigService({
      ...f,
      createRuntime: async (options) => {
        const isolated = await ModelRuntime.create(options);
        vi.spyOn(isolated, 'completeSimple').mockImplementation(complete);
        return isolated;
      },
    });
    expect(await service.testConnection(request)).toMatchObject({
      success: true,
      latencyMs: expect.any(Number),
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ id: request.modelId }),
      expect.any(Object),
      expect.objectContaining({
        maxTokens: 8,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(await f.store.list()).toEqual([]);
    await expect(
      readFile(path.join(f.userDataPath, 'ai-settings.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    complete.mockResolvedValueOnce({
      stopReason: 'error',
      errorMessage: request.apiKey,
    } as never);
    const result = await service.testConnection(request);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(request.apiKey);
  });
  it('fails with AI_NOT_CONFIGURED rather than using a different provider, then recovers on save', async () => {
    const f = await setup();
    await f.service.save(request);
    await f.store.delete(request.providerId);
    // Reconstruct to refresh availability after removing credentials.
    const service = new AiConfigService(f);
    await expect(service.getModelOptions()).rejects.toThrow(
      'AI_NOT_CONFIGURED',
    );
    await service.save(request);
    expect((await service.getStatus()).isConfigured).toBe(true);
  });
  it('keeps previous credentials and selection if settings cannot be persisted', async () => {
    const f = await setup();
    await f.service.save(request);
    await rm(path.join(f.userDataPath, 'ai-settings.json'));
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(f.userDataPath, 'ai-settings.json'));
    await expect(
      f.service.save({ ...request, apiKey: 'replacement' }),
    ).rejects.toThrow();
    expect(await f.store.read(request.providerId)).toMatchObject({
      key: request.apiKey,
    });
    expect((await f.service.getModelOptions()).model?.id).toBe(request.modelId);
  });
  it('shares lazy runtime initialization and publishes changes only after a successful save', async () => {
    const f = await setup();
    const listener = vi.fn();
    f.service.onChanged(listener);
    const [a, b] = await Promise.all([
      f.service.getRuntime(),
      f.service.getRuntime(),
    ]);
    expect(a).toBe(b);
    expect(f.createRuntime).toHaveBeenCalledTimes(1);
    await expect(f.service.save({ ...request, apiKey: '' })).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();
    await f.service.save(request);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('AI configuration input boundary', () => {
  it.each([
    null,
    {},
    { ...request, providerId: 'unknown' },
    { ...request, modelId: '' },
    { ...request, thinkingLevel: 'max' },
    { ...request, apiKey: ' !echo unsafe-command' },
    { ...request, baseUrl: 'file:///private' },
    { ...request, baseUrl: 'https://user:secret@host/v1' },
    { ...request, baseUrl: 'https://host/v1?key=secret' },
  ])('rejects malformed requests', (input) => {
    expect(() => validateAiRequest(input)).toThrow();
  });
});
