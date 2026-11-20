import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ModelRuntime, SettingsManager } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiConfigService, validateAiRequest } from './aiConfigService';

const directories: string[] = [];
const setup = async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'ai-config-'));
  directories.push(userDataPath);
  const createRuntime = vi.fn(ModelRuntime.create);
  const cliAuthPath = path.join(userDataPath, 'cli-auth.json');
  const options = { userDataPath, createRuntime, cliAuthPath };
  const service = new AiConfigService(options);
  const native = (file: string) => path.join(service.agentDir, file);
  const json = async (file: string) =>
    JSON.parse(await readFile(native(file), 'utf8'));
  return {
    ...options,
    service,
    native,
    json,
    noNativeAuth: () =>
      expect(stat(native('auth.json'))).rejects.toMatchObject({
        code: 'ENOENT',
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
        authPath: f.native('auth.json'),
        modelsPath: f.native('models.json'),
        modelsStorePath: f.native('models-store.json'),
        allowModelNetwork: false,
      }),
    );
    expect(await f.json('settings.json')).toEqual({
      defaultProvider: request.providerId,
      defaultModel: request.modelId,
      defaultThinkingLevel: 'low',
    });
    expect(await f.json('models.json')).toMatchObject({
      providers: { [request.providerId]: { baseUrl: request.baseUrl } },
    });
    expect(await f.json('auth.json')).toMatchObject({
      [request.providerId]: { type: 'api_key', key: request.apiKey },
    });
    expect(await readFile(f.native('models.json'), 'utf8')).not.toContain(
      request.apiKey,
    );
    expect(JSON.stringify(await f.service.getStatus())).not.toContain(
      request.apiKey,
    );
    await expect(
      stat(path.join(f.userDataPath, 'ai-settings.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const restored = new AiConfigService({
      userDataPath: f.userDataPath,
      cliAuthPath: f.cliAuthPath,
    });
    expect((await restored.getStatus()).isConfigured).toBe(true);
    expect((await restored.getModelOptions()).model?.id).toBe(request.modelId);
  });
  it('retains a saved key for blank input; supports keyless loopback without masking a new key', async () => {
    const { service, json } = await setup();
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
    expect(await json('auth.json')).toEqual({
      [request.providerId]: {
        type: 'api_key',
        key: request.apiKey,
      },
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
    await f.noNativeAuth();
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
      await f.noNativeAuth();
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
    await f.noNativeAuth();
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
      openai: { type: 'api_key', key: '!printf unsafe-command' },
      google: { type: 'api_key', key: '$GEMINI_API_KEY' },
      anthropic: { type: 'api_key', key: 'dollar$$key' },
    });
    await writeFile(f.cliAuthPath, cli);
    expect((await f.service.getStatus()).hasLocalPiCliConfig).toBe(true);
    await f.noNativeAuth();
    expect(await f.service.importFromLocalPiCli()).toEqual({
      imported: true,
      providerId: 'deepseek',
    });
    expect(await f.json('auth.json')).toEqual({
      deepseek: { type: 'api_key', key: 'cli-key' },
      anthropic: { type: 'api_key', key: 'dollar$$key' },
    });
    expect(
      (await (await f.service.getRuntime()).getAuth('anthropic'))?.auth.apiKey,
    ).toBe('dollar$key');
    await f.service.save({
      providerId: 'deepseek',
      modelId: 'deepseek-v4-pro',
      apiKey: 'desktop-wins',
    });
    expect(await f.service.importFromLocalPiCli()).toEqual({ imported: false });
    expect((await f.json('auth.json')).deepseek).toMatchObject({
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
    await f.noNativeAuth();
    await expect(stat(f.service.agentDir)).rejects.toMatchObject({
      code: 'ENOENT',
    });
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
    await rm(f.native('auth.json'));
    // Reconstruct to refresh availability after removing credentials.
    const service = new AiConfigService(f);
    await expect(service.getModelOptions()).rejects.toThrow(
      'AI_NOT_CONFIGURED',
    );
    await service.save(request);
    expect((await service.getStatus()).isConfigured).toBe(true);
  });
  it('rolls back native auth and models when the native selection save fails', async () => {
    const f = await setup();
    await f.service.save(request);
    const before = await Promise.all(
      ['auth.json', 'models.json', 'settings.json'].map((file) =>
        readFile(f.native(file), 'utf8'),
      ),
    );
    const drainErrors = SettingsManager.prototype.drainErrors;
    let flushed = false;
    const flush = SettingsManager.prototype.flush;
    vi.spyOn(SettingsManager.prototype, 'flush').mockImplementation(
      async function (this: SettingsManager) {
        await flush.call(this);
        flushed = true;
      },
    );
    vi.spyOn(SettingsManager.prototype, 'drainErrors').mockImplementation(
      function (this: SettingsManager) {
        return flushed
          ? [{ scope: 'global', error: new Error('write failed') }]
          : drainErrors.call(this);
      },
    );
    await expect(
      f.service.save({
        ...request,
        apiKey: 'replacement',
        baseUrl: 'https://another.example/v1',
      }),
    ).rejects.toThrow('Cannot write Pi settings');
    expect(
      await Promise.all(
        ['auth.json', 'models.json', 'settings.json'].map((file) =>
          readFile(f.native(file), 'utf8'),
        ),
      ),
    ).toEqual(before);
    expect(
      (await (await f.service.getRuntime()).getAuth(request.providerId))?.auth
        .apiKey,
    ).toBe(request.apiKey);
    expect((await f.service.getModelOptions()).model?.baseUrl).toBe(
      request.baseUrl,
    );
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

describe('one-time desktop migration', () => {
  const encrypted = Buffer.from('legacy encrypted bytes');
  const literalKey = 'old' + '$' + 'LITERAL';
  const legacy = async () => {
    const f = await setup();
    const file = (name: string) => path.join(f.userDataPath, name);
    const decryptString = vi.fn(() =>
      JSON.stringify({
        [request.providerId]: { type: 'api_key', key: literalKey },
        anthropic: { type: 'api_key', key: 'legacy-anthropic-key' },
      }),
    );
    const legacyEncryption = {
      isEncryptionAvailable: () => true,
      decryptString,
    };
    await writeFile(file('ai-auth.bin'), encrypted);
    await writeFile(
      file('ai-settings.json'),
      JSON.stringify({
        activeProviderId: request.providerId,
        activeModelId: request.modelId,
        thinkingLevel: request.thinkingLevel,
        baseUrl: request.baseUrl,
      }),
    );
    await writeFile(
      file('ai-models.json'),
      '{\n // legacy custom override\n "providers": {"google":{"baseUrl":"https://legacy.example/v1"}}\n}',
    );
    return {
      ...f,
      file,
      decryptString,
      legacyEncryption,
      service: new AiConfigService({ ...f, legacyEncryption }),
    };
  };

  it('migrates selection, encrypted credentials and models, then archives the old files', async () => {
    const f = await legacy();
    const [status, options] = await Promise.all([
      f.service.getStatus(),
      f.service.getModelOptions(),
    ]);
    expect(status).toMatchObject({
      isConfigured: true,
      baseUrl: request.baseUrl,
    });
    expect(options).toMatchObject({
      model: { id: request.modelId, baseUrl: request.baseUrl },
      thinkingLevel: 'low',
    });
    expect(
      (await options.modelRuntime?.getAuth(request.providerId))?.auth.apiKey,
    ).toBe(literalKey);
    expect(f.decryptString).toHaveBeenCalledExactlyOnceWith(encrypted);
    expect(await readFile(f.native('models.json'), 'utf8')).toContain(
      '// legacy custom override',
    );
    expect(options.modelRuntime?.getProvider('google')?.baseUrl).toBe(
      'https://legacy.example/v1',
    );
    expect(await readFile(f.file('ai-auth.bin.migrated'))).toEqual(encrypted);
    for (const name of ['ai-auth.bin', 'ai-settings.json', 'ai-models.json']) {
      await expect(stat(f.file(name))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect((await stat(f.file(`${name}.migrated`))).isFile()).toBe(true);
    }
    const restarted = new AiConfigService(f);
    expect((await restarted.getStatus()).isConfigured).toBe(true);
    expect(f.decryptString).toHaveBeenCalledOnce();
    if (process.platform !== 'win32')
      expect((await stat(f.native('auth.json'))).mode & 0o777).toBe(0o600);
  });

  it('keeps existing native selection and credentials while merging other legacy entries', async () => {
    const f = await legacy();
    await mkdir(f.service.agentDir, { mode: 0o700 });
    await writeFile(
      f.native('settings.json'),
      JSON.stringify({
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-6',
      }),
    );
    await writeFile(
      f.native('auth.json'),
      JSON.stringify({ anthropic: { type: 'api_key', key: 'native-wins' } }),
    );
    await writeFile(
      f.native('models.json'),
      JSON.stringify({
        providers: { anthropic: { baseUrl: 'https://native.example/v1' } },
      }),
    );
    const options = await f.service.getModelOptions();
    expect(options.model).toMatchObject({
      provider: 'anthropic',
      baseUrl: 'https://native.example/v1',
    });
    expect(
      (await options.modelRuntime?.getAuth('anthropic'))?.auth.apiKey,
    ).toBe('native-wins');
    expect(
      (await options.modelRuntime?.listCredentials())?.map(
        ({ providerId }) => providerId,
      ),
    ).toContain(request.providerId);
    expect((await f.json('models.json')).providers.google.baseUrl).toBe(
      'https://legacy.example/v1',
    );
  });

  it('preserves the old files if the OS cannot decrypt or the model definitions are invalid', async () => {
    const f = await legacy();
    const unavailable = new AiConfigService({
      ...f,
      legacyEncryption: undefined,
    });
    expect(await unavailable.getStatus()).toMatchObject({
      isConfigured: false,
      error: expect.any(String),
    });
    await f.noNativeAuth();
    expect(await readFile(f.file('ai-auth.bin'))).toEqual(encrypted);
    await writeFile(f.file('ai-models.json'), '{ invalid');
    expect(await f.service.getStatus()).toMatchObject({
      isConfigured: false,
      error: expect.any(String),
    });
    expect(await readFile(f.file('ai-auth.bin'))).toEqual(encrypted);
    await f.noNativeAuth();
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
