import { existsSync } from 'node:fs';
import path from 'node:path';

import { BrowserWindow, dialog, ipcMain } from 'electron';

import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import { readModelRoot } from '@evidence-poc/evidence-model-core';
import {
  WorkbenchInputError,
  generateWorkbench,
  resolveAssetsDirectory,
} from '@evidence-poc/evidence-visualization';

import { EVIDENCE_IPC_CHANNELS } from '../shared/ipc';
import type { ExportReviewResult } from '../shared/projects';

import { modelSourceOf, projectDirectoryOf } from './modelSource';
import { resolveSkillsRoot } from './skillsRoot';

/**
 * Writing the offline review page from the app.
 *
 * The page is generated from the sources on disk, not from the canvas: a review
 * someone mails to a colleague has to describe what was saved. Generation stays
 * in the main process because it reads the model tree and the skill assets, and
 * the renderer owns neither.
 */

export interface ReviewIpcOptions {
  /** Injected by a test; production shows the real save dialog. */
  showSaveDialog?: (input: {
    parent: BrowserWindow | null;
    defaultPath: string;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  /** Injected by a test that must not touch the filesystem. */
  generate?: typeof generateWorkbench;
  /** Injected by a test that must not read the project. */
  readDocument?: (modelRoot: string) => Promise<DomainModelDocument>;
}

/** `review.html` beside the project is a friendlier default than a dot directory. */
export const suggestedReviewFileName = (projectRoot: string): string =>
  path.join(projectDirectoryOf(projectRoot), 'review.html');

/**
 * The scopes a joint review covers.
 *
 * A joint review has to name the independent Contexts it delivers, and the model
 * already declares them: the entry Contexts that are nobody's child. Using the
 * declared set keeps the app from inventing a scope the model never claimed, and
 * a model that declares none gets the collector's refusal instead of a guess.
 */
export const reviewScopeRefs = (
  document: DomainModelDocument,
): string[] => {
  const parents = new Map(
    document.entities
      .filter((entity) => entity.category === 'context')
      .map((entity) => [
        entity.id,
        'parentContextRef' in entity ? entity.parentContextRef : undefined,
      ]),
  );

  return (document.manifest.entryContextRefs ?? []).filter(
    (ref) => parents.get(ref) === undefined,
  );
};

export const registerReviewIpc = ({
  showSaveDialog = async ({ parent, defaultPath }) => {
    const options = {
      title: '导出离线审查页',
      buttonLabel: '导出',
      defaultPath,
      filters: [{ name: '离线审查页', extensions: ['html'] }],
    };
    const result =
      parent === null
        ? await dialog.showSaveDialog(options)
        : await dialog.showSaveDialog(parent, options);

    return {
      canceled: result.canceled,
      ...(result.filePath === undefined ? {} : { filePath: result.filePath }),
    };
  },
  generate = generateWorkbench,
  readDocument = async (modelRoot) => (await readModelRoot(modelRoot)).bundle,
}: ReviewIpcOptions = {}): void => {
  ipcMain.handle(
    EVIDENCE_IPC_CHANNELS.exportReview,
    async (event, rootPath: string): Promise<ExportReviewResult> => {
      const projectRoot = projectDirectoryOf(rootPath);
      const modelRoot = modelSourceOf(projectRoot);

      try {
        const chosen = await showSaveDialog({
          parent: BrowserWindow.fromWebContents(event.sender),
          defaultPath: suggestedReviewFileName(projectRoot),
        });

        if (chosen.canceled || chosen.filePath === undefined) {
          return { status: 'cancelled' };
        }

        // An API design makes the review joint, and a joint review must name its
        // scope; a model-only page is the consistency view on its own.
        const scopeRefs = existsSync(
          path.join(projectRoot, '.evidence', 'api', 'api.json'),
        )
          ? reviewScopeRefs(await readDocument(modelRoot))
          : undefined;

        const generated = await generate({
          projectRoot,
          output: chosen.filePath,
          assetsDirectory: resolveAssetsDirectory({
            skillsRoot: resolveSkillsRoot({ projectRoot }),
            projectRoot,
            searchStartDirectory: projectRoot,
          }),
          ...(scopeRefs === undefined ? {} : { scopeRefs }),
        });

        return {
          status: 'saved',
          path: generated.output,
          counts: generated.data.counts,
        };
      } catch (error) {
        return {
          status: 'failed',
          error:
            error instanceof WorkbenchInputError || error instanceof Error
              ? error.message
              : String(error),
        };
      }
    },
  );
};
