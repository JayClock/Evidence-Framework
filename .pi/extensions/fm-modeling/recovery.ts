import { readdir, rename, rm, stat } from 'node:fs/promises';

import { digestDirectory } from './model.js';
import { fmPaths } from './paths.js';
import { StateStore, type ModelState } from './state.js';

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function verifyCurrentModel(root: string, state: ModelState): Promise<void> {
  if (!state.modelDigest) return;
  const model = fmPaths(root).model;
  if (!(await directoryExists(model))) throw new Error('正式 FM 模型目录缺失');
  const actual = await digestDirectory(model);
  if (actual !== state.modelDigest) {
    throw new Error(`正式 FM 模型被外部修改：expected ${state.modelDigest}, actual ${actual}`);
  }
}

export async function recoverWorkspace(
  root: string,
  store = new StateStore(root),
): Promise<ModelState | null> {
  const recovered = await store.recover();
  if (!recovered.state) return null;
  let state = recovered.state;
  const paths = fmPaths(root);
  const modelExists = await directoryExists(paths.model);
  const backupExists = await directoryExists(paths.backup);

  if (state.modelDigest) {
    if (!modelExists && backupExists && (await digestDirectory(paths.backup)) === state.modelDigest) {
      await rename(paths.backup, paths.model);
    } else {
      await verifyCurrentModel(root, state);
      if (backupExists) await rm(paths.backup, { recursive: true, force: true });
    }
  } else if (modelExists) {
    throw new Error('发现不属于当前 Run 的外部 FM 模型，拒绝导入或覆盖');
  }

  try {
    for (const entry of await readdir(paths.staging)) {
      await rm(`${paths.staging}/${entry}`, { recursive: true, force: true });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  if (state.execution) {
    state = { ...state, execution: null };
    await store.saveState(state);
  }
  return state;
}
