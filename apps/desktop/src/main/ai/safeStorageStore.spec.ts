import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DesktopSafeCredentialStore,
  type CredentialEncryption,
} from './safeStorageStore';

const directories: string[] = [];
const directory = async () => {
  const d = await mkdtemp(path.join(tmpdir(), 'ai-store-'));
  directories.push(d);
  return d;
};
const encryption: CredentialEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (s) =>
    Buffer.from(`encrypted:${Buffer.from(s).toString('base64')}`),
  decryptString: (b) => {
    if (!b.toString().startsWith('encrypted:')) throw new Error();
    return Buffer.from(b.toString().slice(10), 'base64').toString();
  },
};
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe('DesktopSafeCredentialStore', () => {
  it('encrypts, atomically persists with private permissions and reloads', async () => {
    const d = await directory();
    const store = new DesktopSafeCredentialStore(d, encryption);
    await store.modify('deepseek', async () => ({
      type: 'api_key',
      key: 'secret-key',
    }));
    const file = path.join(d, 'ai-auth.bin');
    expect((await readFile(file)).toString()).not.toContain('secret-key');
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(
      await new DesktopSafeCredentialStore(d, encryption).read('deepseek'),
    ).toEqual({ type: 'api_key', key: 'secret-key' });
    expect(await store.list()).toEqual([
      { providerId: 'deepseek', type: 'api_key' },
    ]);
  });
  it('serializes modifications across providers; undefined leaves a credential unchanged', async () => {
    const store = new DesktopSafeCredentialStore(await directory(), encryption);
    await Promise.all(
      ['a', 'b'].map((p) =>
        store.modify(p, async () => ({ type: 'api_key', key: p })),
      ),
    );
    expect(await store.modify('a', async () => undefined)).toEqual({
      type: 'api_key',
      key: 'a',
    });
    await store.delete('a');
    expect(await store.read('a')).toBeUndefined();
    expect(await store.list()).toEqual([{ providerId: 'b', type: 'api_key' }]);
  });
  it.each([false, true])(
    'refuses unavailable or basic_text encryption (%s)',
    async (available) => {
      const d = await directory();
      const store = new DesktopSafeCredentialStore(d, {
        ...encryption,
        isEncryptionAvailable: () => available,
        getSelectedStorageBackend: () => 'basic_text',
      });
      await expect(
        store.modify('p', async () => ({ type: 'api_key', key: 'secret' })),
      ).rejects.toThrow('不会明文保存');
      expect(await store.read('p')).toBeUndefined();
    },
  );
  it('never treats corruption as an empty store or overwrites it', async () => {
    const d = await directory();
    const file = path.join(d, 'ai-auth.bin');
    await writeFile(file, 'damaged');
    const store = new DesktopSafeCredentialStore(d, encryption);
    await expect(store.read('p')).rejects.toThrow('原文件已保留');
    await expect(
      store.modify('p', async () => ({ type: 'api_key', key: 'new' })),
    ).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('damaged');
  });
});
