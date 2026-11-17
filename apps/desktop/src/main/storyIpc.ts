import path from 'node:path';

import { ipcMain, type WebContents } from 'electron';
import {
  createFlowStoryProjector,
  createStoryAgent,
  simulateWhatIf,
  type FlowStoryProjector,
  type EvidenceModelOptions,
} from '@evidence-poc/evidence-agent';
import {
  EMPTY_MODEL_ISSUE_CODE,
  buildFmCheckReport,
  collectFlowScenarios,
} from '@evidence-poc/evidence-model-core';
import {
  readModelBundle,
  readModelDirectory,
} from '@evidence-poc/evidence-model-io';
import {
  DomainModelDocumentSchema,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import {
  STORY_IPC_CHANNELS,
  type StoryModelInput,
  type StoryProjectInput,
  type StoryProjectResult,
  type StoryWhatIfInput,
} from '@evidence-poc/desktop-contracts/story';
import {
  isBundleProject,
  modelSourceOf,
  projectDirectoryOf,
} from './modelSource';

export interface StoryIpcOptions {
  readModel?: (rootPath: string) => Promise<DomainModelDocument>;
  createProjector?: typeof createFlowStoryProjector;
  simulate?: typeof simulateWhatIf;
  getModelOptions?: () => Promise<EvidenceModelOptions>;
}

const readSavedModel = async (
  rootPath: string,
): Promise<DomainModelDocument> => {
  const parsed = isBundleProject(rootPath)
    ? await readModelBundle(modelSourceOf(rootPath))
    : await readModelDirectory(modelSourceOf(rootPath));
  // Structural failures cannot be narrated as a legitimate empty story.
  if (parsed.issues.some((issue) => issue.code !== EMPTY_MODEL_ISSUE_CODE))
    throw new Error(parsed.issues.map((issue) => issue.message).join('\n'));
  return parsed.document;
};

/** Per-window caches survive file invalidation, so only changed scenes use AI. */
export const registerStoryIpc = ({
  readModel = readSavedModel,
  createProjector = createFlowStoryProjector,
  simulate = simulateWhatIf,
  getModelOptions,
}: StoryIpcOptions = {}) => {
  const projectors = new Map<
    WebContents,
    {
      rootPath: string;
      modes: Map<boolean, FlowStoryProjector>;
    }
  >();
  const tracked = new Set<WebContents>();

  const load = async (input: StoryModelInput) => {
    if (
      !input ||
      typeof input.rootPath !== 'string' ||
      !path.isAbsolute(input.rootPath)
    )
      throw new Error('无效的业务流项目路径。');
    const model = DomainModelDocumentSchema.parse(
      input.document ?? (await readModel(input.rootPath)),
    );
    const { report } = buildFmCheckReport({ model });
    return { model, flows: collectFlowScenarios(model, report) };
  };

  const loadFlow = async (input: StoryProjectInput | StoryWhatIfInput) => {
    if (typeof input?.flowId !== 'string' || !input.flowId.trim())
      throw new Error('请选择业务流。');
    const { model, flows } = await load(input);
    const flow = flows.find(({ flowId }) => flowId === input.flowId);
    if (!flow) throw new Error(`未找到业务流：${input.flowId}`);
    return { model, flow };
  };

  ipcMain.handle(
    STORY_IPC_CHANNELS.LIST_FLOWS,
    async (_event, input: StoryModelInput) => (await load(input)).flows,
  );
  ipcMain.handle(
    STORY_IPC_CHANNELS.PROJECT,
    async (event, input: StoryProjectInput): Promise<StoryProjectResult> => {
      if (input?.skipAi !== undefined && typeof input.skipAi !== 'boolean')
        throw new Error('无效的业务流放映模式。');
      const { model, flow } = await loadFlow(input);
      const sender = event.sender;
      if (sender.isDestroyed()) throw new Error('业务流窗口已关闭。');
      if (!tracked.has(sender)) {
        tracked.add(sender);
        sender.once('destroyed', () => {
          projectors.delete(sender);
          tracked.delete(sender);
        });
      }
      let cache = projectors.get(sender);
      if (cache?.rootPath !== input.rootPath) {
        cache = { rootPath: input.rootPath, modes: new Map() };
        projectors.set(sender, cache);
      }
      const skipAi = input.skipAi === true;
      let projector = cache.modes.get(skipAi);
      if (!projector) {
        const projectRoot = projectDirectoryOf(input.rootPath);
        projector = createProjector({
          skipAi,
          projectRoot,
          ...(!skipAi && getModelOptions
            ? {
                agent: createStoryAgent({
                  projectRoot,
                  ...(await getModelOptions()),
                }),
              }
            : {}),
        });
        cache.modes.set(skipAi, projector);
      }
      return { flow, projection: await projector.project(flow, model) };
    },
  );
  ipcMain.handle(
    STORY_IPC_CHANNELS.WHAT_IF,
    async (_event, input: StoryWhatIfInput) => {
      if (
        typeof input?.question !== 'string' ||
        !input.question.trim() ||
        input.question.length > 4000
      )
        throw new Error('请输入 1–4000 字的假设问题。');
      if (
        !Number.isSafeInteger(input.currentStepSequence) ||
        input.currentStepSequence < 1
      )
        throw new Error('无效的业务流步骤。');
      const { model, flow } = await loadFlow(input);
      const step = flow.steps.find(
        ({ sequence }) => sequence === input.currentStepSequence,
      );
      if (!step || step.stepHash !== input.stepHash)
        throw new Error('业务步骤已变化，请刷新放映后重试。');
      return simulate(
        {
          model,
          flow,
          currentStepSequence: input.currentStepSequence,
          hypothesisQuestion: input.question.trim(),
        },
        {
          agent: createStoryAgent({
            ...(await getModelOptions?.()),
            projectRoot: projectDirectoryOf(input.rootPath),
          }),
        },
      );
    },
  );

  return {
    resetModels: () => {
      for (const [sender, cache] of projectors) {
        cache.modes.delete(false);
        if (!sender.isDestroyed())
          sender.send(STORY_IPC_CHANNELS.INVALIDATED, {
            rootPath: cache.rootPath,
          });
      }
    },
    dispose: () => {
      projectors.clear();
      tracked.clear();
      for (const channel of [
        STORY_IPC_CHANNELS.LIST_FLOWS,
        STORY_IPC_CHANNELS.PROJECT,
        STORY_IPC_CHANNELS.WHAT_IF,
      ])
        ipcMain.removeHandler(channel);
    },
  };
};
