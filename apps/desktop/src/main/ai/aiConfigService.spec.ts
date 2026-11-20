import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiConfigService } from './aiConfigService';

const model = { providerId: 'local-gateway', modelId: 'route/flash' };
const other = { providerId: 'local-gateway', modelId: 'route/strong' };
const key = 'test-gateway-key';
const directories: string[] = [];

const setup = async (baseUrl = 'http://127.0.0.1:9/v1') => {
  const agentDir = await mkdtemp(path.join(tmpdir(), 'evidence-pi-config-'));
  directories.push(agentDir);
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  const file = (name: string) => path.join(agentDir, name);
  const write = (name: string, data: unknown) =>
    writeFile(file(name), JSON.stringify(data));
  const read = (name: string) => readFile(file(name), 'utf8');
  const settings = {
    defaultProvider: model.providerId,
    defaultModel: model.modelId,
    defaultThinkingLevel: 'low',
    modelThinkingLevels: { [`${model.providerId}/${model.modelId}`]: 'xhigh' },
    theme: 'dark',
  };
  await Promise.all([
    write('settings.json', settings),
    write('auth.json', { [model.providerId]: { type: 'api_key', key } }),
    write('models.json', {
      providers: {
        [model.providerId]: {
          api: 'openai-completions',
          baseUrl,
          models: [model, other].map(({ modelId }, index) => ({
            id: modelId,
            name: index ? 'Gateway Strong' : 'Gateway Flash',
            reasoning: true,
            thinkingLevelMap: { xhigh: 'high' },
          })),
        },
      },
    }),
  ]);
  return {
    agentDir,
    service: new AiConfigService({ agentDir: getAgentDir() }),
    settings,
    file,
    write,
    read,
  };
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('desktop Pi configuration', () => {
  it('resolves the selected model, credentials and thinking level from the Pi directory', async () => {
    const { agentDir, service } = await setup();
    const status = await service.getStatus();
    expect(status).toMatchObject({
      agentDir,
      isConfigured: true,
      activeProviderId: model.providerId,
      activeModelId: model.modelId,
      activeModelName: 'Gateway Flash',
      thinkingLevel: 'xhigh',
    });
    expect(status.availableModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: other.providerId,
          id: other.modelId,
        }),
      ]),
    );
    expect(JSON.stringify(status)).not.toContain(key);
    expect(await service.getModelOptions()).toMatchObject({
      agentDir,
      model: { provider: model.providerId, id: model.modelId },
      thinkingLevel: 'xhigh',
    });
  });

  it('uses a configured provider key directly from models.json', async () => {
    const f = await setup();
    const models = JSON.parse(await f.read('models.json'));
    models.providers[model.providerId].apiKey = key;
    await f.write('models.json', models);
    await f.write('auth.json', {});
    expect(await f.service.getStatus()).toMatchObject({
      isConfigured: true,
      activeModelId: model.modelId,
    });
  });

  it('uses an available model when the saved selection is missing and reports the fallback', async () => {
    const f = await setup();
    await f.write('settings.json', { ...f.settings, defaultModel: 'unknown' });
    const status = await f.service.getStatus();
    expect(status).toMatchObject({
      isConfigured: true,
      notice: expect.any(String),
    });
    expect(status.activeModelId).not.toBe('unknown');
    expect((await f.service.getModelOptions()).model?.id).toBe(
      status.activeModelId,
    );
  });

  it('saves model and thinking in Pi settings without touching credentials or model definitions', async () => {
    const f = await setup();
    const originals = await Promise.all([
      f.read('auth.json'),
      f.read('models.json'),
    ]);
    await expect(
      f.service.selectModel({ ...model, modelId: 'unknown' }),
    ).rejects.toThrow('不可用');
    await expect(
      f.service.selectModel({ ...model, thinkingLevel: 'max' }),
    ).rejects.toThrow('不支持');
    await f.service.selectModel({ ...other, thinkingLevel: 'high' });
    expect(JSON.parse(await f.read('settings.json'))).toMatchObject({
      ...f.settings,
      defaultModel: other.modelId,
      defaultThinkingLevel: 'high',
      modelThinkingLevels: {
        ...f.settings.modelThinkingLevels,
        [`${other.providerId}/${other.modelId}`]: 'high',
      },
    });
    expect(
      await Promise.all([f.read('auth.json'), f.read('models.json')]),
    ).toEqual(originals);
    expect(await f.service.getStatus()).toMatchObject({
      activeModelId: other.modelId,
      thinkingLevel: 'high',
    });
  });

  it('does not overwrite invalid settings or expose their contents', async () => {
    const f = await setup();
    const invalid = `{"apiKey":"${key}"`;
    await writeFile(f.file('settings.json'), invalid);
    const status = await f.service.getStatus();
    expect(status).toMatchObject({
      isConfigured: false,
      error: expect.any(String),
    });
    expect(JSON.stringify(status)).not.toContain(key);
    await expect(f.service.selectModel(model)).rejects.toThrow(
      '无法读取 Pi 设置',
    );
    expect(await f.read('settings.json')).toBe(invalid);
  });

  it('tests a native gateway through Pi without changing the current selection', async () => {
    const received = vi.fn();
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk.toString();
      received(req.headers.authorization, JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (delta: object, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: 'test', object: 'chat.completion.chunk', created: 0, model: other.modelId, choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
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
      const { port } = server.address() as AddressInfo;
      const { service, read } = await setup(`http://127.0.0.1:${port}/v1`);
      const originals = await Promise.all([
        read('auth.json'),
        read('settings.json'),
        read('models.json'),
      ]);
      expect(await service.testConnection(other)).toMatchObject({
        success: true,
      });
      expect(received).toHaveBeenCalledExactlyOnceWith(
        `Bearer ${key}`,
        expect.objectContaining({ model: other.modelId }),
      );
      expect(
        await Promise.all([
          read('auth.json'),
          read('settings.json'),
          read('models.json'),
        ]),
      ).toEqual(originals);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('aborts a stalled connection test', async () => {
    const { agentDir } = await setup();
    const service = new AiConfigService({ agentDir, connectionTimeoutMs: 5 });
    const { modelRuntime } = await service.getModelOptions();
    const runtime = modelRuntime as ModelRuntime;
    const complete = vi
      .spyOn(runtime, 'completeSimple')
      .mockImplementation(() => new Promise(() => undefined));
    expect(await service.testConnection(model)).toMatchObject({
      success: false,
    });
    expect(complete.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
  });
});
