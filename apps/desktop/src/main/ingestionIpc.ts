import { ipcMain } from 'electron';

import {
  compileIngestionDraft,
  draftFromBusinessText,
  layoutDomainModel,
  parseBlueprint,
  readIngestionDraftJson,
} from '@evidence-poc/evidence-model-core';
import { buildIngestionPrompt } from '@evidence-poc/evidence-agent-core';
import type { IngestionDraft } from '@evidence-poc/evidence-schema';

import { EVIDENCE_INGESTION_IPC_CHANNELS } from '../shared/ipc';
import type {
  CompileDraftInput,
  CompileDraftOutcome,
  IngestDraftInput,
  IngestDraftResult,
} from '../shared/ingestion';
import type { ProjectStore } from './projectStore';

/**
 * Reads one business text through a configured model.
 *
 * The port returns the model's raw reply, not a draft: reading the JSON,
 * normalising kinds and reporting issues stay in one place, so a model and the
 * offline reader converge on the same draft shape.
 */
export type IngestionTextGenerator = (input: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

export interface IngestionIpcOptions {
  projectStore: Pick<ProjectStore, 'createFromDocument'>;
  /**
   * Model-backed reader. Without one the offline reader runs instead, and the
   * result says so, because an install with no model configured should still be
   * able to start from prose.
   */
  generate?: IngestionTextGenerator;
  openEditorWindow?: (rootPath: string) => unknown;
}

/**
 * Reads business prose into a draft, preferring a model when one is configured.
 *
 * A model failure is not fatal: the offline reader runs and the result carries
 * both the model's error and the fact that the reading came from the built-in
 * vocabulary. Silently returning an empty draft would look like "the text said
 * nothing", which is a different problem.
 */
export const readDraft = async (
  input: IngestDraftInput,
  generate?: IngestionTextGenerator,
): Promise<IngestDraftResult> => {
  const modelName = input.modelName;

  if (generate !== undefined && input.kind === 'text') {
    try {
      const prompt = buildIngestionPrompt({
        text: input.content,
        ...(modelName === undefined ? {} : { modelName }),
      });
      const reply = await generate(prompt);
      const read = readIngestionDraftJson(reply);

      if (read.success) {
        return {
          success: true,
          draft: read.draft,
          reader: 'text-model',
          issues: read.issues,
        };
      }

      const fallback = draftFromBusinessText(input.content, {
        ...(modelName === undefined ? {} : { modelName }),
        source: 'unknown',
      });

      return {
        success: true,
        draft: fallback.draft,
        reader: 'text-rules',
        issues: [
          `模型返回的内容无法读成草稿（${read.error}），已改用本地读法。`,
          ...read.issues,
          ...fallback.issues,
        ],
      };
    } catch (error) {
      const fallback = draftFromBusinessText(input.content, {
        ...(modelName === undefined ? {} : { modelName }),
        source: 'unknown',
      });

      return {
        success: true,
        draft: fallback.draft,
        reader: 'text-rules',
        issues: [
          `模型读取失败（${error instanceof Error ? error.message : String(error)}），已改用本地读法。`,
          ...fallback.issues,
        ],
      };
    }
  }

  if (input.kind === 'blueprint') {
    const parsed = parseBlueprint(input.content, {
      ...(modelName === undefined ? {} : { modelName }),
      format: input.format ?? 'auto',
    });

    return parsed.success
      ? {
          success: true,
          draft: parsed.draft,
          reader: 'blueprint',
          issues: parsed.issues.map((issue) => issue.message),
        }
      : { success: false, error: parsed.error, issues: parsed.issues.map((issue) => issue.message) };
  }

  const rules = draftFromBusinessText(input.content, {
    ...(modelName === undefined ? {} : { modelName }),
    source: 'unknown',
  });

  return {
    success: true,
    draft: rules.draft,
    reader: 'text-rules',
    issues: rules.issues,
  };
};

/**
 * Compiles a reviewed draft and writes it as a project.
 *
 * The layout travels with the response so the first canvas paint needs no
 * second pass; the compiler's findings travel too, because "we dropped your
 * contract" is something the user has to see before trusting the result.
 */
export const compileDraft = async (
  input: CompileDraftInput,
  projectStore: Pick<ProjectStore, 'createFromDocument'>,
): Promise<CompileDraftOutcome> => {
  const name = input.name.trim().length > 0 ? input.name.trim() : '文本导入的履约模型';
  const draft: IngestionDraft = {
    ...input.draft,
    modelName: name,
  };

  const compiled = compileIngestionDraft(draft, {
    modelId: input.modelId ?? modelIdFrom(name),
  });

  // Nothing to write is a reading failure, not an empty model: saving a blank
  // tree would look like the text said nothing and leave the user with a
  // project they cannot explain.
  if (compiled.document.entities.length === 0) {
    return {
      success: false,
      error:
        '没有读到可以落地的业务对象：先确认文中哪一句确立了合约关系，再重新读取。',
      issues: compiled.issues.map((issue) => issue.message),
    };
  }

  const created = await projectStore.createFromDocument({
    targetPath: input.targetPath,
    kind: input.kind,
    document: compiled.document,
  });

  if (!created.success) {
    return {
      success: false,
      error: created.error,
      issues: compiled.issues.map((issue) => issue.message),
    };
  }

  return {
    success: true,
    project: created.project,
    document: compiled.document,
    layout: layoutDomainModel(compiled.document),
    issues: compiled.issues.map((issue) => issue.message),
  };
};

const modelIdFrom = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

  return /^[a-z]/.test(slug) ? slug : 'ingested-model';
};

/** Registers the ingestion surface; reading and writing stay in this process. */
export const registerIngestionIpc = ({
  projectStore,
  generate,
  openEditorWindow,
}: IngestionIpcOptions): void => {
  ipcMain.handle(
    EVIDENCE_INGESTION_IPC_CHANNELS.draft,
    async (_event, input: IngestDraftInput) => readDraft(input, generate),
  );

  ipcMain.handle(
    EVIDENCE_INGESTION_IPC_CHANNELS.compile,
    async (_event, input: CompileDraftInput) => {
      const outcome = await compileDraft(input, projectStore);

      if (outcome.success) {
        openEditorWindow?.(outcome.project.rootPath);
      }

      return outcome;
    },
  );
};
