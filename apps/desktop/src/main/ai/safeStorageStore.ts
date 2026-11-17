import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
import { writePrivateFile } from './privateFile';

export interface CredentialEncryption {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

/** Single main-process owner; serialize the whole file, including OAuth rotations. */
export class DesktopSafeCredentialStore implements CredentialStore {
  private cache: Map<string, Credential> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly file: string;

  constructor(
    userDataPath: string,
    private readonly encryption: CredentialEncryption,
  ) {
    this.file = path.join(userDataPath, 'ai-auth.bin');
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private requireEncryption() {
    if (
      !this.encryption.isEncryptionAvailable() ||
      this.encryption.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      throw new Error(
        '系统安全密钥环不可用。请启用系统密钥环，或使用进程环境变量；不会明文保存 API Key。',
      );
    }
  }

  private async load(): Promise<Map<string, Credential>> {
    if (this.cache) return this.cache;
    let buffer: Buffer;
    try {
      buffer = await readFile(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('无法读取 AI 凭证文件。');
      return (this.cache = new Map());
    }
    this.requireEncryption();
    try {
      const data: unknown = JSON.parse(this.encryption.decryptString(buffer));
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error();
      const entries = Object.entries(data);
      if (!entries.every(([, value]) => isCredential(value))) throw new Error();
      return (this.cache = new Map(entries as [string, Credential][]));
    } catch {
      throw new Error('AI 凭证无法解密或已损坏；原文件已保留。');
    }
  }

  read(providerId: string) {
    return this.exclusive(async () =>
      structuredClone((await this.load()).get(providerId)),
    );
  }
  list() {
    return this.exclusive(async () =>
      [...(await this.load())].map(([providerId, c]) => ({
        providerId,
        type: c.type,
      })),
    );
  }
  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ) {
    return this.exclusive(async () => {
      const current = await this.load();
      const updated = await fn(structuredClone(current.get(providerId)));
      if (updated === undefined)
        return structuredClone(current.get(providerId));
      const next = new Map(current).set(providerId, structuredClone(updated));
      await this.persist(next);
      return structuredClone(updated);
    });
  }
  delete(providerId: string) {
    return this.exclusive(async () => {
      const next = new Map(await this.load());
      if (!next.delete(providerId)) return;
      await this.persist(next);
    });
  }
  private async persist(next: Map<string, Credential>) {
    this.requireEncryption();
    await writePrivateFile(
      this.file,
      this.encryption.encryptString(JSON.stringify(Object.fromEntries(next))),
    );
    this.cache = next;
  }
}

export const isCredential = (value: unknown): value is Credential => {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return c.type === 'api_key'
    ? typeof c.key === 'string' && !!c.key.trim() && !c.key.startsWith('!')
    : c.type === 'oauth' &&
        typeof c.access === 'string' &&
        typeof c.refresh === 'string' &&
        typeof c.expires === 'number';
};
