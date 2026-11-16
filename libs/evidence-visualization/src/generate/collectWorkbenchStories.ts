import {
  createFlowStoryProjector,
  type BusinessStoryProjection,
  type FlowStoryProjectorOptions,
} from '@evidence-poc/evidence-agent';
import {
  collectFlowScenarios,
  type FmCheckReport,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

/** Invalid flow graphs fail the export; only AI generation may fall back. */
export const collectWorkbenchStories = async (
  model: DomainModelDocument,
  check: Pick<FmCheckReport, 'gaps'>,
  options: FlowStoryProjectorOptions = {},
): Promise<readonly BusinessStoryProjection[]> => {
  const flows = collectFlowScenarios(model, check);
  const projector = createFlowStoryProjector(options);
  const offline = createFlowStoryProjector({ skipAi: true });
  const stories: BusinessStoryProjection[] = [];
  for (const flow of flows) {
    stories.push(
      await projector
        .project(flow, model)
        .catch(() => offline.project(flow, model)),
    );
  }
  return stories;
};
