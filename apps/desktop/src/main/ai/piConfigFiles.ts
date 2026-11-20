import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Credential } from '@earendil-works/pi-ai';
import { encodePiKey, parsePiObject, readPiFile } from './piAgentConfig';

/** Native models.json has a public file format, but no SDK writer. Also used
 * to restore prior file contents if a desktop configuration save fails. */
export const replacePiFile = async (
  file: string,
  contents: string | undefined,
) => {
  if (contents === undefined) {
    await rm(file, { force: true });
    return;
  }
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const piJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Roll back failed saves within this desktop process; this is not a cross-file
 * transaction across process crashes or concurrent manual edits. */
export const updatePiFiles = async <T>(
  work: (
    replace: typeof replacePiFile,
    track: (file: string, before: string | undefined) => void,
  ) => Promise<T>,
) => {
  const undo = new Map<string, string | undefined>();
  const track = (file: string, before: string | undefined) => {
    if (!undo.has(file)) undo.set(file, before);
  };
  try {
    return await work(async (file, contents) => {
      const before = await readPiFile(file);
      if (contents === before) return;
      await replacePiFile(file, contents);
      track(file, before);
    }, track);
  } catch (error) {
    const results = await Promise.allSettled(
      [...undo].map(([file, before]) => replacePiFile(file, before)),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw new Error('无法恢复 AI 配置，请检查桌面配置目录。');
    throw error;
  }
};

export type LegacyCredentialEncryption = {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  decryptString(value: Buffer): string;
};

/** Read the old encrypted store only for one-time migration. No legacy writer. */
export const readLegacyAuth = async (
  file: string,
  encryption?: LegacyCredentialEncryption,
): Promise<Record<string, Credential> | undefined> => {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  if (
    !encryption?.isEncryptionAvailable() ||
    encryption.getSelectedStorageBackend?.() === 'basic_text'
  )
    throw new Error('无法迁移旧 AI 凭证，请先解锁系统密钥环。');
  try {
    const entries = Object.entries(
      parsePiObject(encryption.decryptString(bytes)),
    );
    return Object.fromEntries(
      entries.map(([provider, value]) => {
        const entry = value as Partial<Credential> | null;
        if (
          entry?.type === 'api_key' &&
          typeof entry.key === 'string' &&
          entry.key.trim()
        )
          return [provider, { ...entry, key: encodePiKey(entry.key) }];
        if (
          entry?.type === 'oauth' &&
          typeof entry.access === 'string' &&
          typeof entry.refresh === 'string' &&
          typeof entry.expires === 'number'
        )
          return [provider, entry];
        throw new Error('Invalid legacy credential');
      }),
    );
  } catch {
    throw new Error('旧 AI 凭证无法解密或已损坏；原文件已保留。');
  }
};
