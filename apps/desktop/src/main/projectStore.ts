import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  isModelBundleFile,
  isModelBundlePath,
  readModelBundle,
  readModelDirectory,
  writeModelBundle,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import type {
  EvidenceProjectSummary,
  OpenProjectResult,
  SaveProjectResult,
} from '../shared/projects';

/** Relative location of the FM source tree inside a project root. */
export const MODEL_DIRECTORY = path.join('.evidence', 'fm');
export const MODEL_MANIFEST_FILE = 'model.json';
export const RECENT_PROJECTS_FILE = 'recent-projects.json';

/** Suffix the open dialog and error messages name for single-file models. */
export const MODEL_BUNDLE_LABEL = '*.evidence.json';

const MAX_RECENT_PROJECTS = 20;

export interface ProjectStoreOptions {
  /** Absolute path of the JSON file remembering recent projects. */
  recentProjectsFile: string;
  now?: () => Date;
}

export interface ProjectStore {
  listRecent(): Promise<readonly EvidenceProjectSummary[]>;
  open(rootPath: string): Promise<OpenProjectResult>;
  save(
    rootPath: string,
    document: DomainModelDocument,
  ): Promise<SaveProjectResult>;
  /** Latest mtime of the model source tree, used to detect external writes. */
  fingerprint(rootPath: string): Promise<string | null>;
}

/** Absolute path of `<rootPath>/.evidence/fm`. */
export const modelRootFor = (rootPath: string): string =>
  path.join(path.resolve(rootPath), MODEL_DIRECTORY);

const modelRootOf = (rootPath: string): string => modelRootFor(rootPath);

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知错误。';

const readRecent = async (file: string): Promise<EvidenceProjectSummary[]> => {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as EvidenceProjectSummary[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    return [];
  }
};

const writeAtomically = async (
  absolute: string,
  content: string,
): Promise<void> => {
  await mkdir(path.dirname(absolute), { recursive: true });

  const temporary = `${absolute}.tmp-${randomUUID()}`;

  await writeFile(temporary, content, 'utf8');
  await rename(temporary, absolute);
};

const summarize = (
  rootPath: string,
  document: DomainModelDocument,
  lastOpenedAt: string,
  kind: 'directory' | 'file' = 'directory',
): EvidenceProjectSummary => ({
  rootPath: path.resolve(rootPath),
  // A bundle project has no `.evidence/fm`: the file itself is the model
  // source every reader (scripts, MCP, canvas) is pointed at.
  modelRoot: kind === 'file' ? path.resolve(rootPath) : modelRootOf(rootPath),
  kind,
  name: document.manifest.name,
  modelId: document.manifest.id,
  modelVersion: document.manifest.version,
  entityCount: document.entities.length,
  relationshipCount: document.relationships.length,
  ruleCount: document.rules.length,
  lastOpenedAt,
});

/**
 * File-backed project store for the desktop shell.
 *
 * The store never keeps a model in memory: `open` parses the current source
 * tree, `save` writes the document the renderer holds, so an external agent can
 * keep editing the same files without fighting a hidden cache.
 */
export const createProjectStore = ({
  recentProjectsFile,
  now = () => new Date(),
}: ProjectStoreOptions): ProjectStore => {
  const remember = async (project: EvidenceProjectSummary): Promise<void> => {
    const previous = await readRecent(recentProjectsFile);
    const next = [
      project,
      ...previous.filter((item) => item.rootPath !== project.rootPath),
    ].slice(0, MAX_RECENT_PROJECTS);

    await writeAtomically(
      recentProjectsFile,
      `${JSON.stringify(next, null, 2)}\n`,
    );
  };

  return {
    async listRecent() {
      return readRecent(recentProjectsFile);
    },

    async open(rootPath) {
      try {
        if (await isModelBundleFile(rootPath)) {
          const parsed = await readModelBundle(rootPath);

          if (
            parsed.issues.length > 0 &&
            parsed.document.entities.length === 0
          ) {
            return {
              success: false,
              error: parsed.issues
                .map((issue) => `${issue.path}: ${issue.message}`)
                .join('\n'),
            };
          }

          const project = summarize(
            rootPath,
            parsed.document,
            now().toISOString(),
            'file',
          );

          await remember(project);

          return {
            success: true,
            project,
            document: parsed.document,
            issues: parsed.issues,
          };
        }

        const modelRoot = modelRootOf(rootPath);
        const manifestPath = path.join(modelRoot, MODEL_MANIFEST_FILE);

        await stat(manifestPath).catch(() => {
          throw new Error(
            `未找到 ${path.join(MODEL_DIRECTORY, MODEL_MANIFEST_FILE)}，请选择一个包含 .evidence/fm 源树的项目，或一个 ${MODEL_BUNDLE_LABEL} 单文件。`,
          );
        });

        const parsed = await readModelDirectory(modelRoot);

        if (parsed.issues.length > 0 && parsed.document.entities.length === 0) {
          return {
            success: false,
            error: parsed.issues
              .map((issue) => `${issue.path}: ${issue.message}`)
              .join('\n'),
          };
        }

        const project = summarize(
          rootPath,
          parsed.document,
          now().toISOString(),
        );

        await remember(project);

        return {
          success: true,
          project,
          document: parsed.document,
          issues: parsed.issues,
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async save(rootPath, document) {
      try {
        if (isModelBundlePath(rootPath)) {
          // The document the renderer holds already carries the bundle extras
          // (`validation`, `readme`), so writing it back stays lossless.
          const written = await writeModelBundle(rootPath, document);

          return {
            success: true,
            written: written.written ? [path.basename(rootPath)] : [],
            unchanged: written.written ? [] : [path.basename(rootPath)],
            removed: [],
            savedAt: now().toISOString(),
          };
        }

        const modelRoot = modelRootOf(rootPath);

        await mkdir(modelRoot, { recursive: true });

        const result = await writeModelDirectory(modelRoot, document);

        return {
          success: true,
          written: result.written,
          unchanged: result.unchanged,
          removed: result.removed,
          savedAt: now().toISOString(),
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async fingerprint(rootPath) {
      if (isModelBundlePath(rootPath)) {
        const content = await readFile(rootPath, 'utf8').catch(() => null);

        return content === null
          ? null
          : createHash('sha1').update(content).digest('hex');
      }

      const modelRoot = modelRootOf(rootPath);
      const parsed = await readModelDirectory(modelRoot).catch(() => null);

      if (parsed === null || parsed.files.length === 0) {
        return null;
      }

      const hash = createHash('sha1');

      for (const file of [...parsed.files].sort((left, right) =>
        left.path.localeCompare(right.path),
      )) {
        hash.update(file.path).update('\u0000').update(file.content);
        hash.update('\u0000');
      }

      return hash.digest('hex');
    },
  };
};
