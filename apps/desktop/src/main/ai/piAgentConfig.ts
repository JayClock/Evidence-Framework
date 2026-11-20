import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type CredentialStore,
} from '@earendil-works/pi-ai';
import type {
  ModelRuntime,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

const ifPresent = (error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error;
  return undefined;
};

export const readPiFile = (file: string) =>
  readFile(file, 'utf8').catch(ifPresent);

export const parsePiObject = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid Pi configuration');
  return value as Record<string, unknown>;
};

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
  {
    persistAuth = false,
    credentials,
    modelsPath = path.join(agentDir, 'models.json'),
    createRuntime,
  }: {
    persistAuth?: boolean;
    credentials?: CredentialStore;
    modelsPath?: string;
    createRuntime?: typeof ModelRuntime.create;
  } = {},
) => {
  const create =
    createRuntime ??
    (await import('@earendil-works/pi-coding-agent')).ModelRuntime.create;
  const authPath = path.join(agentDir, 'auth.json');
  const modelsStorePath = path.join(agentDir, 'models-store.json');
  // Pi's file stores bootstrap on reads. Keep initial reads side-effect free.
  const [auth, cache] = await Promise.all([
    readPiFile(authPath),
    stat(modelsStorePath).catch(ifPresent),
  ]);
  if (auth !== undefined) parsePiObject(auth);
  return create({
    authPath,
    modelsPath,
    modelsStorePath,
    allowModelNetwork: false,
    ...(credentials
      ? { credentials }
      : auth === undefined && !persistAuth
        ? { credentials: new InMemoryCredentialStore() }
        : {}),
    ...(cache === undefined ? { modelsStore: new InMemoryModelsStore() } : {}),
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

export const encodePiKey = (key: string) =>
  key.replaceAll('$', () => '$$').replace(/^!/, () => '$!');

export const savePiKey = (
  runtime: ModelRuntime,
  providerId: string,
  key: string,
) => {
  // login() persists through Pi's AuthStorage, which is not a public export.
  const literalKey = encodePiKey(key);
  return runtime.login(providerId, 'api_key', {
    prompt: async ({ type }) => {
      if (type !== 'secret')
        throw new Error('Provider requires interactive setup');
      return literalKey;
    },
    notify: () => undefined,
  });
};
