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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPiRuntime,
  readPiSettings,
  savePiKey,
  savePiSelection,
} from './piAgentConfig';

let root: string;
let agentDir: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'evidence-pi-'));
  agentDir = path.join(root, '.pi', 'agent');
});
afterEach(() => rm(root, { recursive: true, force: true }));

const json = async (file: string) =>
  JSON.parse(await readFile(path.join(agentDir, file), 'utf8'));

describe('native Pi storage', () => {
  it('only provisions private native files when saving', async () => {
    const settings = await readPiSettings(agentDir);
    const runtime = await createPiRuntime(agentDir);
    expect(settings.getDefaultModel()).toBeUndefined();
    expect(runtime.getProvider('deepseek')?.auth.apiKey?.name).toBe(
      'DeepSeek API key',
    );
    await expect(stat(agentDir)).rejects.toMatchObject({ code: 'ENOENT' });

    const writable = await createPiRuntime(agentDir, { persistAuth: true });
    await savePiKey(writable, 'deepseek', 'first$key');
    await savePiSelection(
      agentDir,
      settings,
      'deepseek',
      'deepseek-chat',
      'high',
    );
    expect(await json('auth.json')).toEqual({
      deepseek: { type: 'api_key', key: 'first$$key' },
    });
    expect(await json('settings.json')).toMatchObject({
      defaultProvider: 'deepseek',
      defaultModel: 'deepseek-chat',
      defaultThinkingLevel: 'high',
    });
    const reopened = await createPiRuntime(agentDir);
    expect((await reopened.getAuth('deepseek'))?.auth.apiKey).toBe('first$key');
    if (process.platform !== 'win32') {
      expect((await stat(agentDir)).mode & 0o777).toBe(0o700);
      for (const file of ['auth.json', 'settings.json']) {
        expect((await stat(path.join(agentDir, file))).mode & 0o777).toBe(
          0o600,
        );
      }
    }
  });

  it('merges settings and auth without replacing unrelated entries', async () => {
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(agentDir, 'auth.json'),
      JSON.stringify({ openai: { type: 'api_key', key: 'existing' } }),
    );
    await writeFile(
      path.join(agentDir, 'settings.json'),
      JSON.stringify({ theme: 'dark', defaultThinkingLevel: 'xhigh' }),
    );
    await savePiKey(await createPiRuntime(agentDir), 'deepseek', 'second');
    await savePiSelection(
      agentDir,
      await readPiSettings(agentDir),
      'deepseek',
      'deepseek-chat',
    );
    expect(await json('auth.json')).toMatchObject({
      openai: { key: 'existing' },
      deepseek: { key: 'second' },
    });
    expect(await json('settings.json')).toEqual({
      theme: 'dark',
      defaultThinkingLevel: 'xhigh',
      defaultProvider: 'deepseek',
      defaultModel: 'deepseek-chat',
    });
  });

  it('does not overwrite corrupt settings', async () => {
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(agentDir, 'settings.json'), '{bad');
    await expect(readPiSettings(agentDir)).rejects.toThrow(
      'Cannot read Pi settings',
    );
    expect(await readFile(path.join(agentDir, 'settings.json'), 'utf8')).toBe(
      '{bad',
    );
  });
});
