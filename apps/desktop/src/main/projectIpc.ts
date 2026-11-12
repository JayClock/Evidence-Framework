import {
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
  type SaveDialogOptions,
  type WebContents,
} from 'electron';

import { EVIDENCE_IPC_CHANNELS } from '../shared/ipc';
import type {
  CreateProjectDialogInput,
  CreateProjectDialogResult,
  CreateProjectInput,
  SaveProjectInput,
} from '../shared/projects';

import { watchModelSource, type ModelWatcher } from './modelWatcher';
import { modelSourceOf } from './modelSource';
import { MODEL_BUNDLE_LABEL, type ProjectStore } from './projectStore';
import { listProjectTemplates } from './templates/starterModels';

/** Default file name the save dialog starts from for a single-file model. */
const DEFAULT_BUNDLE_NAME = 'model.evidence.json';

export interface ProjectIpcOptions {
  projectStore: ProjectStore;
  openEditorWindow: (rootPath: string) => unknown;
}

/**
 * Registers the project IPC surface. The renderer can only read and write the
 * model source tree; dialogs and file watching stay in the main process.
 */
export const registerProjectIpc = ({
  projectStore,
  openEditorWindow,
}: ProjectIpcOptions): void => {
  const watchers = new Map<number, ModelWatcher>();

  const stopWatching = (webContentsId: number): void => {
    watchers.get(webContentsId)?.close();
    watchers.delete(webContentsId);
  };

  const startWatching = (sender: WebContents, rootPath: string): void => {
    stopWatching(sender.id);

    const watcher = watchModelSource(modelSourceOf(rootPath), (paths) => {
      if (sender.isDestroyed()) {
        stopWatching(sender.id);
        return;
      }

      sender.send(EVIDENCE_IPC_CHANNELS.changed, {
        rootPath,
        changedAt: new Date().toISOString(),
        paths,
      });
    });

    watchers.set(sender.id, watcher);
    sender.once('destroyed', () => stopWatching(sender.id));
  };

  ipcMain.handle(EVIDENCE_IPC_CHANNELS.showOpenDialog, async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: `选择包含 .evidence/fm 的项目目录，或一个 ${MODEL_BUNDLE_LABEL} 单文件`,
      buttonLabel: '打开模型',
      properties: ['openFile', 'openDirectory'],
      filters: [{ name: 'Evidence 单文件模型', extensions: ['json'] }],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const rootPath = result.filePaths[0];

    if (result.canceled || rootPath === undefined) {
      return { success: false, canceled: true } as const;
    }

    return { success: true, rootPath } as const;
  });

  /**
   * Picks where a new project is written.
   *
   * A source tree needs an empty folder, so the dialog opens in directory mode
   * and lets the user create one; a bundle reuses the save dialog because the
   * file name is part of the decision.
   */
  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.showCreateDialog,
    async (
      event,
      input: CreateProjectDialogInput,
    ): Promise<CreateProjectDialogResult> => {
      const parent = BrowserWindow.fromWebContents(event.sender);

      if (input.kind === 'file') {
        const options: SaveDialogOptions = {
          title: '保存新的单文件履约模型',
          buttonLabel: '保存模型',
          defaultPath: input.suggestedName ?? DEFAULT_BUNDLE_NAME,
          filters: [{ name: 'Evidence 单文件模型', extensions: ['json'] }],
        };
        const result = parent
          ? await dialog.showSaveDialog(parent, options)
          : await dialog.showSaveDialog(options);

        if (result.canceled || result.filePath === undefined) {
          return { success: false, canceled: true };
        }

        return { success: true, targetPath: result.filePath, kind: 'file' };
      }

      const options: OpenDialogOptions = {
        title: '选择一个空目录存放 .evidence/fm 源树',
        buttonLabel: '在此新建模型',
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      const targetPath = result.filePaths[0];

      if (result.canceled || targetPath === undefined) {
        return { success: false, canceled: true };
      }

      return { success: true, targetPath, kind: 'directory' };
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.create,
    async (event, input: CreateProjectInput) => {
      const result = await projectStore.create(input);

      if (result.success) {
        startWatching(event.sender, result.project.rootPath);
      }

      return result;
    },
  );

  ipcMain.handle(EVIDENCE_IPC_CHANNELS.templates, async () => {
    try {
      return { success: true, templates: listProjectTemplates() } as const;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '无法读取新建模板。',
      } as const;
    }
  });

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.open,
    async (event, rootPath: string) => {
      const result = await projectStore.open(rootPath);

      if (result.success) {
        startWatching(event.sender, result.project.rootPath);
      }

      return result;
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.save,
    async (_event, input: SaveProjectInput) =>
      projectStore.save(input.rootPath, input.document),
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.openEditorWindow,
    async (_event, rootPath: string) => {
      openEditorWindow(rootPath);
    },
  );

  ipcMain.handle(EVIDENCE_IPC_CHANNELS.recent, async () => {
    try {
      return {
        success: true,
        projects: await projectStore.listRecent(),
      } as const;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '无法读取最近项目。',
      } as const;
    }
  });
};
