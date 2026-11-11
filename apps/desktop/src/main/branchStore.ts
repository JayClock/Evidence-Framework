import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { forkSessionLines } from '@evidence-poc/evidence-agent-core';
import {
  snapshotOfReport,
  type SensorReport,
} from '@evidence-poc/evidence-modeling-orchestrator';
import {
  readModelDirectory,
  writeModelDirectory,
} from '@evidence-poc/evidence-model-core';
import { diffDomainModels } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import {
  MAIN_BRANCH_ID,
  type BranchCompareInput,
  type BranchCompareResult,
  type BranchCreateInput,
  type BranchListResult,
  type BranchMergeInput,
  type BranchMergeResult,
  type BranchMetadata,
  type BranchMutationResult,
  type BranchRemoveInput,
  type BranchRemoveResult,
  type BranchSwitchInput,
  type BranchSwitchResult,
  type EvidenceBranchSummary,
} from '../shared/branches';

/** Directory holding every branch snapshot plus its manifest. */
export const BRANCH_DIRECTORY = path.join('.evidence', 'branches');
/** File remembering which branch is checked out. */
export const BRANCH_MANIFEST_FILE = 'manifest.json';
/** File holding one branch's interview lineage. */
export const BRANCH_SESSION_FILE = 'session.jsonl';
/** Relative path of the checkout every skill and sensor reads. */
export const CHECKOUT_DIRECTORY = path.join('.evidence', 'fm');
/** Relative path of the interview trace the frontier panel reads. */
export const BRANCH_TRACE_PATH = path.join(
  '.evidence',
  'traces',
  'interview-trace.json',
);

const BRANCH_METADATA_FILE = 'branch.json';

interface BranchManifest {
  activeBranchId: string;
  order: readonly string[];
}

export interface BranchStoreOptions {
  now?: () => Date;
  /** Injected so tests get stable ids instead of random suffixes. */
  createId?: (name: string) => string;
}

export interface BranchStore {
  list(rootPath: string): Promise<BranchListResult>;
  create(input: BranchCreateInput): Promise<BranchMutationResult>;
  switchTo(input: BranchSwitchInput): Promise<BranchSwitchResult>;
  merge(input: BranchMergeInput): Promise<BranchMergeResult>;
  remove(input: BranchRemoveInput): Promise<BranchRemoveResult>;
  compare(input: BranchCompareInput): Promise<BranchCompareResult>;
  /** Stamps the active branch with the verdict the sensors just produced. */
  recordVerdict(rootPath: string, report: SensorReport): Promise<void>;
  /** Absolute model root of the checkout, i.e. what the sensors read. */
  checkoutModelRoot(rootPath: string): string;
  /** Absolute transcript the active branch owns, when it has one. */
  activeSessionFile(rootPath: string): Promise<string | null>;
}

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '未知错误。';

const slugOf = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return slug === '' ? 'branch' : slug.slice(0, 40);
};

const readJson = async <T>(file: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
};

const exists = async (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false,
  );

const writeAtomically = async (file: string, content: string): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });

  const temporary = `${file}.tmp-${randomUUID()}`;

  await writeFile(temporary, content, 'utf8');
  await rename(temporary, file);
};

/**
 * File-backed branch store.
 *
 * `.evidence/fm` stays the checkout that the skills, the sensors and Git already
 * read, and every branch — including `main` — keeps a snapshot beside it. A
 * switch therefore saves the current checkout back to its own snapshot first, so
 * no edit can be lost by moving between assumptions.
 */
export const createBranchStore = ({
  now = () => new Date(),
  createId = (name) => `${slugOf(name)}-${randomUUID().slice(0, 6)}`,
}: BranchStoreOptions = {}): BranchStore => {
  const branchRoot = (rootPath: string): string =>
    path.join(path.resolve(rootPath), BRANCH_DIRECTORY);
  const branchDirectory = (rootPath: string, branchId: string): string =>
    path.join(branchRoot(rootPath), branchId);
  const modelRootOf = (rootPath: string, branchId: string): string =>
    path.join(branchDirectory(rootPath, branchId), 'fm');
  const checkoutRoot = (rootPath: string): string =>
    path.join(path.resolve(rootPath), CHECKOUT_DIRECTORY);
  const checkoutTrace = (rootPath: string): string =>
    path.join(path.resolve(rootPath), BRANCH_TRACE_PATH);
  const branchTrace = (rootPath: string, branchId: string): string =>
    path.join(branchDirectory(rootPath, branchId), 'traces', 'interview-trace.json');
  const sessionFileOf = (rootPath: string, branchId: string): string =>
    path.join(branchDirectory(rootPath, branchId), BRANCH_SESSION_FILE);
  const metadataFile = (rootPath: string, branchId: string): string =>
    path.join(branchDirectory(rootPath, branchId), BRANCH_METADATA_FILE);
  const manifestFile = (rootPath: string): string =>
    path.join(branchRoot(rootPath), BRANCH_MANIFEST_FILE);

  const readManifest = async (rootPath: string): Promise<BranchManifest> => {
    const parsed = await readJson<BranchManifest>(manifestFile(rootPath));

    return parsed ?? { activeBranchId: MAIN_BRANCH_ID, order: [] };
  };

  const writeManifest = async (
    rootPath: string,
    manifest: BranchManifest,
  ): Promise<void> => {
    await writeAtomically(
      manifestFile(rootPath),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  };

  const readMetadata = async (
    rootPath: string,
    branchId: string,
  ): Promise<BranchMetadata | null> =>
    readJson<BranchMetadata>(metadataFile(rootPath, branchId));

  const writeMetadata = async (
    rootPath: string,
    metadata: BranchMetadata,
  ): Promise<void> => {
    await writeAtomically(
      metadataFile(rootPath, metadata.id),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
  };

  /**
   * Mirrors the checkout into `.evidence/branches/<id>/fm`.
   *
   * Called before any switch, so the tree a user is looking at is never the only
   * copy of an edit.
   */
  const snapshotCheckout = async (
    rootPath: string,
    branchId: string,
  ): Promise<boolean> => {
    const checkout = checkoutRoot(rootPath);

    if (!(await exists(checkout))) {
      return false;
    }

    const document = await readModelDirectory(checkout);
    await writeModelDirectory(modelRootOf(rootPath, branchId), document.document);

    return true;
  };

  /** Writes one branch snapshot into the checkout the tools read. */
  const checkoutBranch = async (
    rootPath: string,
    branchId: string,
  ): Promise<DomainModelDocument> => {
    const source = modelRootOf(rootPath, branchId);
    const document = await readModelDirectory(source);

    await writeModelDirectory(checkoutRoot(rootPath), document.document);

    const trace = branchTrace(rootPath, branchId);

    if (await exists(trace)) {
      await mkdir(path.dirname(checkoutTrace(rootPath)), { recursive: true });
      await cp(trace, checkoutTrace(rootPath));
    }

    return document.document;
  };

  const ensureMainBranch = async (rootPath: string): Promise<void> => {
    const metadata = await readMetadata(rootPath, MAIN_BRANCH_ID);

    if (metadata !== null) {
      return;
    }

    const timestamp = now().toISOString();
    const document = await readModelDirectory(checkoutRoot(rootPath)).catch(
      () => ({ document: undefined }),
    );

    if (document.document !== undefined) {
      await writeModelDirectory(
        modelRootOf(rootPath, MAIN_BRANCH_ID),
        document.document,
      );
    }

    const trace = checkoutTrace(rootPath);

    if (await exists(trace)) {
      await mkdir(path.dirname(branchTrace(rootPath, MAIN_BRANCH_ID)), {
        recursive: true,
      });
      await cp(trace, branchTrace(rootPath, MAIN_BRANCH_ID));
    }

    await writeMetadata(rootPath, {
      id: MAIN_BRANCH_ID,
      name: '主干（main）',
      description: '当前 .evidence/fm 检出的模型',
      parentBranchId: null,
      sourceEntryId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'open',
    });

    const manifest = await readManifest(rootPath);

    await writeManifest(rootPath, {
      activeBranchId: manifest.activeBranchId,
      order: [MAIN_BRANCH_ID, ...manifest.order.filter((id) => id !== MAIN_BRANCH_ID)],
    });
  };

  const summarize = async (
    rootPath: string,
    branchId: string,
    activeBranchId: string,
  ): Promise<EvidenceBranchSummary | null> => {
    const metadata = await readMetadata(rootPath, branchId);

    if (metadata === null) {
      return null;
    }

    const modelRoot = modelRootOf(rootPath, branchId);
    const parsed = await readModelDirectory(modelRoot).catch(() => null);
    const session = sessionFileOf(rootPath, branchId);
    const sessionEntryCount = (await exists(session))
      ? (await readFile(session, 'utf8'))
          .split('\n')
          .filter((line) => line.trim() !== '').length - 1
      : 0;

    return {
      id: metadata.id,
      name: metadata.name,
      ...(metadata.description === undefined
        ? {}
        : { description: metadata.description }),
      parentBranchId: metadata.parentBranchId,
      sourceEntryId: metadata.sourceEntryId,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      modelId: parsed?.document.manifest.id ?? null,
      entityCount: parsed?.document.entities.length ?? 0,
      relationshipCount: parsed?.document.relationships.length ?? 0,
      ruleCount: parsed?.document.rules.length ?? 0,
      isActive: metadata.id === activeBranchId,
      sessionFile: (await exists(session))
        ? path
            .relative(path.resolve(rootPath), session)
            .split(path.sep)
            .join('/')
        : null,
      sessionEntryCount,
      status: metadata.status,
      ...(metadata.lastVerdict === undefined
        ? {}
        : { lastVerdict: metadata.lastVerdict }),
      ...(metadata.mergedAt === undefined ? {} : { mergedAt: metadata.mergedAt }),
    };
  };

  const listWithManifest = async (
    rootPath: string,
  ): Promise<{ manifest: BranchManifest; branches: EvidenceBranchSummary[] }> => {
    await ensureMainBranch(rootPath);

    const manifest = await readManifest(rootPath);

    // The checkout is the truth while a branch is active: mirror it back before
    // any reader looks at snapshots, so create/compare/merge never act on a
    // stale copy of the branch the user is currently editing.
    await snapshotCheckout(rootPath, manifest.activeBranchId).catch(
      () => false,
    );

    const order = [
      MAIN_BRANCH_ID,
      ...manifest.order.filter((id) => id !== MAIN_BRANCH_ID),
    ];
    const branches: EvidenceBranchSummary[] = [];

    for (const branchId of order) {
      const summary = await summarize(rootPath, branchId, manifest.activeBranchId);

      if (summary !== null) {
        branches.push(summary);
      }
    }

    return { manifest, branches };
  };

  return {
    checkoutModelRoot: (rootPath) => checkoutRoot(rootPath),

    async activeSessionFile(rootPath) {
      const { manifest } = await listWithManifest(rootPath);
      const session = sessionFileOf(rootPath, manifest.activeBranchId);

      return (await exists(session)) ? session : null;
    },

    async list(rootPath) {
      try {
        const { manifest, branches } = await listWithManifest(rootPath);

        return {
          success: true,
          branches,
          activeBranchId: manifest.activeBranchId,
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async create(input) {
      try {
        const rootPath = path.resolve(input.rootPath);

        if (input.name.trim() === '') {
          return { success: false, error: '请为新分支填写名称。' };
        }

        await ensureMainBranch(rootPath);

        const { manifest } = await listWithManifest(rootPath);
        const sourceBranchId =
          input.sourceBranchId ?? manifest.activeBranchId;
        const sourceMetadata = await readMetadata(rootPath, sourceBranchId);

        if (sourceMetadata === null) {
          return {
            success: false,
            error: `找不到来源分支 ${sourceBranchId}。`,
          };
        }

        const timestamp = now().toISOString();
        const branchId = createId(input.name);
        const document = await readModelDirectory(
          modelRootOf(rootPath, sourceBranchId),
        );

        await writeModelDirectory(
          modelRootOf(rootPath, branchId),
          document.document,
        );

        const sourceTrace = branchTrace(rootPath, sourceBranchId);

        if (await exists(sourceTrace)) {
          await mkdir(path.dirname(branchTrace(rootPath, branchId)), {
            recursive: true,
          });
          await cp(sourceTrace, branchTrace(rootPath, branchId));
        }

        const sourceSession = input.sessionFile ?? sessionFileOf(rootPath, sourceBranchId);

        if (await exists(sourceSession)) {
          const lines = (await readFile(sourceSession, 'utf8')).split('\n');

          try {
            const forked = forkSessionLines(lines, {
              newSessionId: `branch-${branchId}`,
              sourceEntryId: input.sourceEntryId ?? null,
              timestamp,
            });

            await writeAtomically(
              sessionFileOf(rootPath, branchId),
              `${forked.lines.join('\n')}\n`,
            );
          } catch {
            // A transcript that cannot be forked must not block model branching:
            // the branch simply starts without an inherited conversation.
          }
        }

        await writeMetadata(rootPath, {
          id: branchId,
          name: input.name.trim(),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          parentBranchId: sourceBranchId,
          sourceEntryId: input.sourceEntryId ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
          status: 'open',
        });

        await writeManifest(rootPath, {
          activeBranchId: manifest.activeBranchId,
          order: [...manifest.order.filter((id) => id !== branchId), branchId],
        });

        const summary = await summarize(rootPath, branchId, manifest.activeBranchId);

        if (summary === null) {
          return { success: false, error: '分支快照写入后无法读回。' };
        }

        return { success: true, branch: summary };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async switchTo(input) {
      try {
        const rootPath = path.resolve(input.rootPath);
        const { manifest, branches } = await listWithManifest(rootPath);
        const target = branches.find((branch) => branch.id === input.branchId);

        if (target === undefined) {
          return { success: false, error: `找不到分支 ${input.branchId}。` };
        }

        if (manifest.activeBranchId === input.branchId) {
          return {
            success: true,
            branch: target,
            document: (await readModelDirectory(checkoutRoot(rootPath))).document,
            savedPrevious: false,
          };
        }

        const savedPrevious = await snapshotCheckout(
          rootPath,
          manifest.activeBranchId,
        );
        const document = await checkoutBranch(rootPath, input.branchId);

        await writeManifest(rootPath, {
          activeBranchId: input.branchId,
          order: manifest.order,
        });

        const summary = await summarize(rootPath, input.branchId, input.branchId);

        if (summary === null) {
          return { success: false, error: '切换后无法读回分支元数据。' };
        }

        return { success: true, branch: summary, document, savedPrevious };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async merge(input) {
      try {
        const rootPath = path.resolve(input.rootPath);

        if (input.sourceBranchId === MAIN_BRANCH_ID) {
          return { success: false, error: '主干不能合并到自身。' };
        }

        const { manifest, branches } = await listWithManifest(rootPath);
        const source = branches.find(
          (branch) => branch.id === input.sourceBranchId,
        );

        if (source === undefined) {
          return {
            success: false,
            error: `找不到分支 ${input.sourceBranchId}。`,
          };
        }

        const mergedAt = now().toISOString();
        const document = await readModelDirectory(
          modelRootOf(rootPath, input.sourceBranchId),
        );

        // The winning tree becomes both the checkout and the main snapshot, so
        // main and the working tree can never disagree after a merge.
        const written = await writeModelDirectory(
          checkoutRoot(rootPath),
          document.document,
        );
        await writeModelDirectory(
          modelRootOf(rootPath, MAIN_BRANCH_ID),
          document.document,
        );

        const sourceTrace = branchTrace(rootPath, input.sourceBranchId);

        if (await exists(sourceTrace)) {
          await mkdir(path.dirname(checkoutTrace(rootPath)), { recursive: true });
          await cp(sourceTrace, checkoutTrace(rootPath));
          await mkdir(path.dirname(branchTrace(rootPath, MAIN_BRANCH_ID)), {
            recursive: true,
          });
          await cp(sourceTrace, branchTrace(rootPath, MAIN_BRANCH_ID));
        }

        const sourceMetadata = await readMetadata(rootPath, input.sourceBranchId);

        if (sourceMetadata !== null) {
          const keep = input.keepSourceBranch ?? true;

          if (keep) {
            await writeMetadata(rootPath, {
              ...sourceMetadata,
              status: 'merged',
              mergedAt,
              updatedAt: mergedAt,
            });
          } else {
            await rm(branchDirectory(rootPath, input.sourceBranchId), {
              recursive: true,
              force: true,
            });
          }
        }

        const mainMetadata = await readMetadata(rootPath, MAIN_BRANCH_ID);

        if (mainMetadata !== null) {
          await writeMetadata(rootPath, {
            ...mainMetadata,
            updatedAt: mergedAt,
          });
        }

        await writeManifest(rootPath, {
          activeBranchId: MAIN_BRANCH_ID,
          order: manifest.order,
        });

        const summary = await summarize(
          rootPath,
          input.sourceBranchId,
          MAIN_BRANCH_ID,
        );
        const mainSummary = await summarize(
          rootPath,
          MAIN_BRANCH_ID,
          MAIN_BRANCH_ID,
        );

        if (summary === null || mainSummary === null) {
          return { success: false, error: '合并后无法读回分支元数据。' };
        }

        return {
          success: true,
          branch: (input.keepSourceBranch ?? true) ? summary : mainSummary,
          written: written.written,
          unchanged: written.unchanged,
          removed: written.removed,
          mergedAt,
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async remove(input) {
      try {
        const rootPath = path.resolve(input.rootPath);

        if (input.branchId === MAIN_BRANCH_ID) {
          return { success: false, error: '主干不能删除。' };
        }

        const { manifest } = await listWithManifest(rootPath);

        if (manifest.activeBranchId === input.branchId) {
          return {
            success: false,
            error: '当前检出的分支不能删除，请先切回主干。',
          };
        }

        if ((await readMetadata(rootPath, input.branchId)) === null) {
          return { success: false, error: `找不到分支 ${input.branchId}。` };
        }

        await rm(branchDirectory(rootPath, input.branchId), {
          recursive: true,
          force: true,
        });
        await writeManifest(rootPath, {
          activeBranchId: manifest.activeBranchId,
          order: manifest.order.filter((id) => id !== input.branchId),
        });

        return { success: true, removedBranchId: input.branchId };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },

    async recordVerdict(rootPath, report) {
      const resolved = path.resolve(rootPath);
      const manifest = await readManifest(resolved);
      const metadata = await readMetadata(resolved, manifest.activeBranchId);

      if (metadata === null) {
        return;
      }

      await writeMetadata(resolved, {
        ...metadata,
        lastVerdict: snapshotOfReport(report),
      });
    },

    async compare(input) {
      try {
        const rootPath = path.resolve(input.rootPath);
        const base = await readModelDirectory(
          modelRootOf(rootPath, input.baseBranchId),
        ).catch(() => null);
        const target = await readModelDirectory(
          modelRootOf(rootPath, input.targetBranchId),
        ).catch(() => null);

        if (base === null || target === null) {
          return { success: false, error: '无法读取参与对比的分支模型。' };
        }

        return {
          success: true,
          comparison: {
            baseBranchId: input.baseBranchId,
            targetBranchId: input.targetBranchId,
            diff: diffDomainModels(base.document, target.document),
            baseDocument: base.document,
            targetDocument: target.document,
          },
        };
      } catch (error) {
        return { success: false, error: toMessage(error) };
      }
    },
  };
};
