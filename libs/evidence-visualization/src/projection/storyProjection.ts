import type {
  BusinessStoryProjection,
  StoryScene,
} from '@evidence-poc/evidence-agent';

/** Only presentation data crosses into the shareable offline page. */
export type WorkbenchStoryScene = Omit<StoryScene, 'stepHash'>;
export interface WorkbenchStory
  extends Omit<BusinessStoryProjection, 'scenes'> {
  readonly scenes: readonly WorkbenchStoryScene[];
}

/** Do not serialize caches, local fact hashes or future agent metadata. */
export const projectWorkbenchStories = (
  stories: readonly BusinessStoryProjection[],
): readonly WorkbenchStory[] =>
  stories.map((story) => ({
    flowId: story.flowId,
    storyTitle: story.storyTitle,
    storySummary: story.storySummary,
    businessGoal: story.businessGoal,
    scenes: story.scenes.map((scene) => ({
      stepIndex: scene.stepIndex,
      phaseTitle: scene.phaseTitle,
      narrative: scene.narrative,
      actingRoleLabel: scene.actingRoleLabel,
      targetEntityLabel: scene.targetEntityLabel,
      documentCard: {
        title: scene.documentCard.title,
        fields: scene.documentCard.fields.map((field) => ({
          name: field.name,
          label: field.label,
          value: field.value,
          keyData: field.keyData,
        })),
        ...(scene.documentCard.basisNotes === undefined
          ? {}
          : { basisNotes: scene.documentCard.basisNotes }),
      },
      ruleEvaluations: scene.ruleEvaluations.map((rule) => ({
        ruleName: rule.ruleName,
        explanation: rule.explanation,
        satisfied: rule.satisfied,
      })),
      ...(scene.stateTransitionNotice === undefined
        ? {}
        : { stateTransitionNotice: scene.stateTransitionNotice }),
      ...(scene.pendingSuspense === undefined
        ? {}
        : { pendingSuspense: scene.pendingSuspense }),
    })),
  }));
