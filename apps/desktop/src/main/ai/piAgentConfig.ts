import { mkdir, open, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  InMemoryCredentialStore,
  InMemoryModelsStore,
} from '@earendil-works/pi-ai';
import type {
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

export const statIfPresent = (file: string) =>
  stat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });

/** The desktop config uses only the global Pi settings, never a project's overrides. */
export const readPiSettings = async (agentDir: string) => {
  const { SettingsManager } = await import('@earendil-works/pi-coding-agent');
  const settings = SettingsManager.create(process.cwd(), agentDir, {
    projectTrusted: false,
  });
  if (settings.drainErrors().length) throw new Error('Cannot read Pi settings');
  return settings;
};

export const createPiRuntime = async (
  agentDir: string,
  { persistAuth = false } = {},
) => {
  const { ModelRuntime } = await import('@earendil-works/pi-coding-agent');
  const authPath = path.join(agentDir, 'auth.json');
  const modelsStorePath = path.join(agentDir, 'models-store.json');
  // Pi's file stores bootstrap on reads. With no existing file, keep the
  // offline catalog and credentials in memory until the user saves.
  const [auth, cache] = await Promise.all([
    statIfPresent(authPath),
    statIfPresent(modelsStorePath),
  ]);
  return ModelRuntime.create({
    authPath,
    modelsPath: path.join(agentDir, 'models.json'),
    modelsStorePath,
    allowModelNetwork: false,
    ...(auth || persistAuth
      ? {}
      : { credentials: new InMemoryCredentialStore() }),
    ...(cache ? {} : { modelsStore: new InMemoryModelsStore() }),
  });
};

export const savePiSelection = async (
  agentDir: string,
  settings: SettingsManager,
  providerId: string,
  modelId: string,
  thinkingLevel?: Parameters<SettingsManager['setDefaultThinkingLevel']>[0],
) => {
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  // SettingsManager owns the locked read/merge/write. Only set the mode when
  // creating the file; never truncate or change permissions of an existing one.
  try {
    const file = await open(path.join(agentDir, 'settings.json'), 'ax', 0o600);
    await file.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  settings.setDefaultModelAndProvider(providerId, modelId);
  if (thinkingLevel !== undefined)
    settings.setDefaultThinkingLevel(thinkingLevel);
  await settings.flush();
  if (settings.drainErrors().length)
    throw new Error('Cannot write Pi settings');
};

export const savePiKey = (
  runtime: ModelRuntime,
  providerId: string,
  key: string,
) => {
  // login() persists through the SDK's AuthStorage (not a public export).
  // The desktop only handles single-secret setup, never interactive OAuth or
  // multi-step credentials. Escape Pi's env interpolation for literal keys.
  const literalKey = key.replaceAll('$', () => '$$').replace(/^!/, () => '$!');
  return runtime.login(providerId, 'api_key', {
    prompt: async ({ type }) => {
      if (type !== 'secret')
        throw new Error('Provider requires interactive setup');
      return literalKey;
    },
    notify: () => undefined,
  });
};
