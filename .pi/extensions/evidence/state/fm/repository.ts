import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type {
  FmModelFile,
  FmValidationResult,
  RuntimeOptions,
  ValidationOptions,
} from '../../modeling/fm/contracts.ts';
import { normalizeFmModelFiles } from '../../modeling/fm/files.ts';
import { projectPath, writeTextAtomic } from '../../storage.ts';
import { FM_MODEL_ROOT, FM_STATUS_PATH } from './paths.ts';

async function listFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile())
        result.push(relative(directory, absolute).replaceAll('\\', '/'));
    }
  }
  await visit(directory);
  return result.sort((left, right) => left.localeCompare(right));
}

export async function listFmModelFiles(root: string): Promise<string[]> {
  const absoluteRoot = resolve(root, FM_MODEL_ROOT);
  try {
    const files = await listFiles(absoluteRoot);
    return files.map((path) => `${FM_MODEL_ROOT}/${path}`);
  } catch {
    return [];
  }
}
export function createFmRepository(
  validateFmModel: (options: ValidationOptions) => Promise<FmValidationResult>,
) {
  async function replaceFmModel(
    options: RuntimeOptions & { files: FmModelFile[]; draftOnly?: boolean },
  ): Promise<FmValidationResult & { files: string[] }> {
    const files = normalizeFmModelFiles(options.files);
    const stagingParent = resolve(options.root, '.evidence', 'staging');
    await mkdir(stagingParent, { recursive: true });
    const staging = await mkdtemp(join(stagingParent, 'fm-model-'));
    try {
      await Promise.all(
        ['entities', 'fulfillments', 'relationships', 'rules'].map(
          (directory) => mkdir(join(staging, directory), { recursive: true }),
        ),
      );
      for (const file of files) {
        const output = join(staging, ...file.path.split('/'));
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, file.content, 'utf8');
      }
      const validation = await validateFmModel({
        ...options,
        modelDir: staging,
      });
      if (!validation.passed || options.draftOnly)
        return { ...validation, files: [] };

      const target = resolve(options.root, FM_MODEL_ROOT);
      const backup = `${target}.backup`;
      await mkdir(dirname(target), { recursive: true });
      await rm(backup, { recursive: true, force: true });
      let hadTarget = false;
      try {
        await stat(target);
        hadTarget = true;
        await rename(target, backup);
      } catch {
        hadTarget = false;
      }
      try {
        await rename(staging, target);
        await rm(backup, { recursive: true, force: true });
      } catch (error) {
        if (hadTarget) await rename(backup, target);
        throw error;
      }
      return {
        ...validation,
        files: await listFmModelFiles(options.root),
      };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  async function removeFmModel(root: string): Promise<void> {
    await rm(projectPath(root, FM_MODEL_ROOT), {
      recursive: true,
      force: true,
    });
  }
  async function writeFmStatus(root: string, content: string): Promise<void> {
    await writeTextAtomic(root, FM_STATUS_PATH, content);
  }
  return { replaceFmModel, listFmModelFiles, removeFmModel, writeFmStatus };
}
