import type {
  FlowScenarioTrace,
  FlowStepTrace,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  type DomainModelDocument,
} from '@evidence-poc/evidence-schema';

import { STORY_SYSTEM_PROMPT } from './prompts.js';
import { responseObject, SceneDraftSchema } from './responseSchemas.js';
import { createStoryAgent } from './storyAgent.js';
import { StorySceneCache } from './storyCache.js';
import type {
  BusinessStoryProjection,
  StoryAgent,
  StoryScene,
} from './types.js';

export interface FlowStoryProjectorOptions {
  /** Deterministic fact cards only; never initialize or call an LLM. */
  readonly skipAi?: boolean;
  readonly agent?: StoryAgent;
  readonly cache?: StorySceneCache;
}

export interface FlowStoryProjector {
  project(
    trace: FlowScenarioTrace,
    model?: DomainModelDocument,
  ): Promise<BusinessStoryProjection>;
}

const suspenseFor = (step: FlowStepTrace): string =>
  step.gaps.some((gap) => /unpaired_request|confirmation/iu.test(gap))
    ? `⚠️ 业务待决悬念：《${step.entityLabel}》尚缺对应的确认单据，请问由谁、通过何种单据、在多长期限内完成确认？`
    : `⚠️ 业务待决悬念：《${step.entityLabel}》的业务依据或责任约定尚待补齐，请问需要补充哪些单据、数据来源或经办责任？`;

/** Delta generation only sees local facts, not the entire flow or transcript. */
export const createFlowStoryProjector = (
  options: FlowStoryProjectorOptions = {},
): FlowStoryProjector => {
  const agent = options.skipAi
    ? undefined
    : (options.agent ?? createStoryAgent());
  const cache = options.cache ?? new StorySceneCache();
  const pending = new Map<string, Promise<StoryScene>>();

  return {
    async project(trace, model) {
      const ordered = [...trace.steps].sort((a, b) => a.sequence - b.sequence);
      const sequences = new Set<number>();
      for (const step of ordered) {
        if (
          !Number.isSafeInteger(step.sequence) ||
          step.sequence < 1 ||
          sequences.has(step.sequence)
        ) {
          throw new Error(
            'Story trace requires unique positive step sequences.',
          );
        }
        sequences.add(step.sequence);
      }
      const scenes: StoryScene[] = [];
      for (const step of ordered) {
        const entity = model?.entities.find(
          (item) => item.id === step.entityId,
        );
        const labelOf = (ref: string | undefined): string | undefined =>
          model?.entities.find((item) => item.id === ref)?.label;
        if (agent === undefined) {
          const actingRoleLabel =
            labelOf(step.actingRoleRef) ?? step.actingRoleRef ?? '待明确经办方';
          scenes.push({
            stepIndex: step.sequence,
            stepHash: step.stepHash,
            phaseTitle: `办理《${step.entityLabel}》`,
            narrative: `${actingRoleLabel}办理《${step.entityLabel}》，业务时点为${step.asOf}。仅展示模型声明的事实，未执行验收或规则判定。`,
            actingRoleLabel,
            targetEntityLabel: step.entityLabel,
            documentCard: {
              title: step.entityLabel,
              fields: Object.keys(step.values)
                .sort()
                .map((name) => {
                  const attribute = entity?.attributes?.find(
                    (item) => item.name === name,
                  );
                  return {
                    name,
                    label: attribute?.label ?? name,
                    value:
                      typeof step.values[name] === 'string'
                        ? (step.values[name] as string)
                        : compactCanonicalJson(step.values[name]),
                    keyData: attribute?.keyData ?? false,
                  };
                }),
              ...(step.basedOn.length === 0
                ? {}
                : { basisNotes: `声明依据：${step.basedOn.join('、')}` }),
            },
            ruleEvaluations: [],
            ...(step.gaps.length === 0
              ? {}
              : { pendingSuspense: suspenseFor(step) }),
          });
          // Offline output must not read or populate the AI scene cache.
          continue;
        }
        // Do not include examples, sequence or traceDigest: unrelated edits and
        // inserting a step must not invalidate unchanged local business facts.
        const facts = {
          entityId: step.entityId,
          entityKind: step.entityKind,
          entityLabel: step.entityLabel,
          stepHash: step.stepHash,
          actingRoleRef: step.actingRoleRef,
          responsibleRoleRef: step.responsibleRoleRef,
          contextRef: step.contextRef,
          asOf: step.asOf,
          basedOn: step.basedOn,
          values: step.values,
          derivedAssertions: step.derivedAssertions,
          gaps: step.gaps,
        };
        const context = {
          flowId: trace.flowId,
          flowTitle: trace.flowTitle,
          step: facts,
          attributes: entity?.attributes ?? [],
          actingRoleLabel: labelOf(step.actingRoleRef),
          responsibleRoleLabel: labelOf(step.responsibleRoleRef),
          contextLabel: labelOf(step.contextRef),
        };
        const contextKey = compactCanonicalJson(context);
        let scene = cache.get(step.stepHash, contextKey);
        if (scene === undefined) {
          const pendingKey = compactCanonicalJson([step.stepHash, contextKey]);
          let generation = pending.get(pendingKey);
          if (generation === undefined) {
            generation = (async (): Promise<StoryScene> => {
              const draft = SceneDraftSchema.parse(
                responseObject(
                  await agent.generate({
                    systemPrompt: STORY_SYSTEM_PROMPT,
                    userPrompt: contextKey,
                  }),
                ),
              );
              const fieldNames = draft.documentCard.fields.map(
                ({ name }) => name,
              );
              if (
                new Set(fieldNames).size !== fieldNames.length ||
                fieldNames.length !== Object.keys(step.values).length ||
                fieldNames.some((name) => !Object.hasOwn(step.values, name))
              ) {
                throw new Error(
                  `Story card fields must match facts for '${step.entityId}'.`,
                );
              }
              const { pendingSuspense, ...prose } = draft;
              const generated: StoryScene = {
                ...prose,
                stepIndex: step.sequence,
                stepHash: step.stepHash,
                actingRoleLabel:
                  context.actingRoleLabel ??
                  (step.actingRoleRef === undefined
                    ? '待明确经办方'
                    : draft.actingRoleLabel),
                targetEntityLabel: step.entityLabel,
                documentCard: {
                  ...draft.documentCard,
                  fields: draft.documentCard.fields.map((field) => ({
                    ...field,
                    // The LLM may label facts, but cannot change their values
                    // or promote an unmodeled field to key business data.
                    value:
                      typeof step.values[field.name] === 'string'
                        ? (step.values[field.name] as string)
                        : compactCanonicalJson(step.values[field.name]),
                    keyData:
                      entity?.attributes?.find(
                        ({ name }) => name === field.name,
                      )?.keyData ?? false,
                  })),
                },
                // A trace declares facts, not executed rule decisions. Rule
                // truth and consequences belong to the explicit CEL sandbox.
                ruleEvaluations: [],
                ...(step.gaps.length === 0
                  ? {}
                  : {
                      pendingSuspense:
                        pendingSuspense !== undefined &&
                        /[?？]/u.test(pendingSuspense) &&
                        !step.gaps.some((gap) => pendingSuspense.includes(gap))
                          ? pendingSuspense
                          : suspenseFor(step),
                    }),
              };
              cache.set(step.stepHash, generated, contextKey);
              return generated;
            })();
            pending.set(pendingKey, generation);
          }
          try {
            scene = structuredClone(await generation);
          } finally {
            if (pending.get(pendingKey) === generation)
              pending.delete(pendingKey);
          }
        }
        scenes.push({
          ...scene,
          stepIndex: step.sequence,
          stepHash: step.stepHash,
        });
      }
      return {
        flowId: trace.flowId,
        storyTitle: trace.flowTitle,
        storySummary:
          scenes.length === 0
            ? '该业务流尚无已声明的业务步骤。'
            : `${scenes.length} 个业务环节：${scenes.map(({ phaseTitle }) => phaseTitle).join(' → ')}`,
        businessGoal: `逐步核对${trace.flowTitle}中的单据流转、经办责任与履约依据。`,
        scenes,
      };
    },
  };
};
