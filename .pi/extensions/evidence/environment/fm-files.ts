import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import type { FmValidationFiles } from '../modeling/fm/contracts.ts';

export const fmValidationFiles: FmValidationFiles = {
  ensureDirectory: async (path) => {
    await mkdir(path, { recursive: true });
  },
  exists: (path) =>
    stat(path).then(
      () => true,
      () => false,
    ),
  removeFile: async (path) => {
    await rm(path, { force: true });
  },
  listNames: (path) => readdir(path),
};
