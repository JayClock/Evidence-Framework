import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
} from 'electron';

import { buildDelivery } from '@evidence-poc/evidence-api';
import type { DeliveryBundle } from '@evidence-poc/evidence-api';

import type {
  LiveDeliveryInput,
  LiveDeliveryResult,
  ExportLiveDeliveryInput,
} from '../shared/delivery';
import { EVIDENCE_IPC_CHANNELS } from '../shared/ipc';
import type {
  DeliveryPreviewResult,
  ExportDeliveryResult,
} from '../shared/projects';

import {
  livePreviewOf,
  validateLiveDeliveryInput,
  deliveryFilesOf,
  previewOf,
  readDelivery,
  suggestedDeliveryDirectory,
} from './deliveryProjection';
import { modelSourceOf, projectDirectoryOf } from './modelSource';

/**
 * The delivery hand-off, from the app.
 *
 * Both calls project the model on disk, not the canvas: what a colleague receives
 * has to describe what was saved. The preview exists so the modeler reads the
 * boundaries before writing four files into a folder they will have to explain.
 */

export interface DeliveryIpcOptions {
  /** Injected by a test; production shows the real directory picker. */
  showDirectoryDialog?: (input: {
    parent: BrowserWindow | null;
    defaultPath: string;
  }) => Promise<{ canceled: boolean; directory?: string }>;
  /** Injected by a test that must not read the project. */
  build?: (modelRoot: string) => Promise<DeliveryBundle>;
  /** Injected by a test that must not touch the filesystem. */
  write?: (
    directory: string,
    files: { path: string; content: string }[],
  ) => Promise<void>;
}

const writeFiles = async (
  directory: string,
  files: { path: string; content: string }[],
): Promise<void> => {
  await mkdir(directory, { recursive: true });

  for (const file of files) {
    await writeFile(path.join(directory, file.path), file.content, 'utf8');
  }
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const registerDeliveryIpc = ({
  showDirectoryDialog = async ({ parent, defaultPath }) => {
    const options: OpenDialogOptions = {
      title: '导出交付物',
      buttonLabel: '导出',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    };
    const result =
      parent === null
        ? await dialog.showOpenDialog(options)
        : await dialog.showOpenDialog(parent, options);

    return {
      canceled: result.canceled,
      ...(result.filePaths[0] === undefined
        ? {}
        : { directory: result.filePaths[0] }),
    };
  },
  build = readDelivery,
  write = writeFiles,
}: DeliveryIpcOptions = {}): void => {
  const modelRootOfProject = (rootPath: string): string =>
    modelSourceOf(projectDirectoryOf(rootPath));

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.deliveryLivePreview,
    async (_event, input: LiveDeliveryInput): Promise<LiveDeliveryResult> => {
      try {
        return { success: true, analysis: livePreviewOf(input) };
      } catch (error) {
        return {
          success: false,
          revision: input?.revision ?? -1,
          error: errorMessage(error),
        };
      }
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.exportLiveDelivery,
    async (
      event,
      input: ExportLiveDeliveryInput,
    ): Promise<ExportDeliveryResult> => {
      try {
        validateLiveDeliveryInput(input);
        // Freeze before the asynchronous directory picker; no later canvas/disk read.
        const frozen = structuredClone(input);
        const analysis = livePreviewOf(frozen);
        if (!analysis.canExportDraft)
          throw new Error('API 存在阻塞项，不能导出草稿。');
        if (analysis.modelDigest !== frozen.expectedModelDigest)
          throw new Error('预览已过期，请等待重新计算后导出。');
        const bundle = buildDelivery(frozen.document);
        const chosen = await showDirectoryDialog({
          parent: BrowserWindow.fromWebContents(event.sender),
          defaultPath: suggestedDeliveryDirectory(
            projectDirectoryOf(frozen.rootPath),
          ),
        });
        if (chosen.canceled || chosen.directory === undefined)
          return { status: 'cancelled' };
        const files = [
          ...deliveryFilesOf(bundle),
          { path: 'api-changes.md', content: analysis.changeLog },
          {
            path: 'draft-status.json',
            content: JSON.stringify(
              {
                mode: 'draft',
                releaseAuthorized: false,
                modelDigest: analysis.modelDigest,
                baseModelDigest: analysis.baseModelDigest,
                issues: analysis.issues,
              },
              null,
              2,
            ),
          },
        ];
        await write(chosen.directory, files);
        return {
          status: 'saved',
          directory: chosen.directory,
          files: files.map((file) => file.path),
          serviceCount: bundle.services.length,
          routeCount: bundle.routes.length,
        };
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.deliveryPreview,
    async (_event, rootPath: string): Promise<DeliveryPreviewResult> => {
      try {
        return {
          success: true,
          preview: previewOf(await build(modelRootOfProject(rootPath))),
        };
      } catch (error) {
        return { success: false, error: errorMessage(error) };
      }
    },
  );

  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.exportDelivery,
    async (event, rootPath: string): Promise<ExportDeliveryResult> => {
      const projectDirectory = projectDirectoryOf(rootPath);

      try {
        const bundle = await build(modelRootOfProject(rootPath));
        const chosen = await showDirectoryDialog({
          parent: BrowserWindow.fromWebContents(event.sender),
          defaultPath: suggestedDeliveryDirectory(projectDirectory),
        });

        if (chosen.canceled || chosen.directory === undefined) {
          return { status: 'cancelled' };
        }

        const files = deliveryFilesOf(bundle);

        await write(chosen.directory, files);

        return {
          status: 'saved',
          directory: chosen.directory,
          files: files.map((file) => file.path),
          serviceCount: bundle.services.length,
          routeCount: bundle.routes.length,
        };
      } catch (error) {
        return { status: 'failed', error: errorMessage(error) };
      }
    },
  );
};
