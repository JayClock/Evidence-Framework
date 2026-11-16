import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  createFlowStoryProjector,
  type BusinessStoryProjection,
} from '@evidence-poc/evidence-agent';
import { collectFlowScenarios } from '@evidence-poc/evidence-model-core';

import { collectWorkbench } from '../generate/collectWorkbench.js';
import { collectWorkbenchStories } from '../generate/collectWorkbenchStories.js';
import { readWorkbenchModel } from '../generate/readWorkbenchModel.js';
import { generateWorkbench } from '../generate/generateWorkbench.js';
import {
  builtinAssetsDirectory,
  loadWorkbenchAssets,
} from '../render/workbenchAssets.js';
import { renderWorkbenchHtml } from '../render/workbenchRenderer.js';
import { projectWorkbenchStories } from './storyProjection.js';
import { projectWorkbenchData } from './workbenchProjection.js';

const PROCUREMENT = fileURLToPath(
  new URL(
    '../../../../examples/acceptance/procurement.evidence.json',
    import.meta.url,
  ),
);
const modelOf = async () => (await readWorkbenchModel(PROCUREMENT)).bundle;
const withRoot = async (run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbench-story-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const draftFor = ({ userPrompt }: { userPrompt: string }) => {
  const { step } = JSON.parse(userPrompt);
  return {
    phaseTitle: `走查${step.entityLabel}`,
    narrative: '业务旁白：请核对单据声明的事实。',
    actingRoleLabel: '经办人',
    targetEntityLabel: step.entityLabel,
    documentCard: {
      title: step.entityLabel,
      fields: Object.keys(step.values).map((name) => ({
        name,
        label: name,
        value: 'AI 不可改写事实值',
        keyData: false,
      })),
    },
  };
};

describe('workbench story collection', () => {
  it('includes every payment scene from the checked portable procurement model', async () => {
    await withRoot(async (root) => {
      const generate = vi.fn().mockRejectedValue(new Error('must not call AI'));
      const { data, check } = await collectWorkbench({
        projectRoot: root,
        modelRoot: PROCUREMENT,
        storyOptions: { skipAi: true, agent: { generate } },
      });
      expect(check.valid).toBe(true);
      const flow = collectFlowScenarios(await modelOf(), check)[0]!;
      expect(data.stories).toHaveLength(1);
      expect(data.stories[0]).toMatchObject({ flowId: 'payment' });
      expect(data.stories[0]!.scenes).toHaveLength(flow.steps.length);
      expect(data.stories[0]!.scenes.map((scene) => scene.stepIndex)).toEqual(
        flow.steps.map((step) => step.sequence),
      );
      expect(
        data.stories[0]!.scenes.map((scene) => scene.targetEntityLabel),
      ).toEqual(flow.steps.map((step) => step.entityLabel));
      expect(JSON.stringify(data.stories)).not.toMatch(
        /stepHash|traceDigest|sourceRefs/,
      );
      expect(generate).not.toHaveBeenCalled();
      expect(data.validation.runtime).toBe(false);
    });
  });

  it('precomputes AI prose and keeps model facts authoritative', async () => {
    const generate = vi.fn(async (request: { userPrompt: string }) =>
      draftFor(request),
    );
    const model = await modelOf();
    const stories = await collectWorkbenchStories(
      model,
      { gaps: [] },
      { agent: { generate } },
    );
    const flow = collectFlowScenarios(model)[0]!;
    expect(generate).toHaveBeenCalledTimes(flow.steps.length);
    expect(
      stories[0]!.scenes.every((scene) =>
        scene.narrative.startsWith('业务旁白'),
      ),
    ).toBe(true);
    expect(stories[0]!.scenes[0]!.documentCard.fields[0]!.value).not.toBe(
      'AI 不可改写事实值',
    );
    expect(
      stories[0]!.scenes.every((scene) => scene.ruleEvaluations.length === 0),
    ).toBe(true);
  });

  it.each(['unavailable', 'malformed'])(
    'falls back per flow when AI is %s without losing other stories or gaps',
    async (failure) => {
      const model = await modelOf();
      const firstEntity = model.entities.find((entity) =>
        entity.examples?.some((example) => example.test?.flow),
      );
      const original = firstEntity!.examples!.find(
        (example) => example.test?.flow,
      )!;
      firstEntity!.examples!.push({
        ...structuredClone(original),
        label: '独立故事',
        test: { ...original.test!, flow: 'z-independent', basedOn: [] },
      });
      const generate = vi.fn(async ({ userPrompt }: { userPrompt: string }) => {
        if (JSON.parse(userPrompt).flowId === 'payment') {
          if (failure === 'unavailable') throw new Error('offline');
          return { invalid: 'response' };
        }
        return draftFor({ userPrompt });
      });
      const stories = await collectWorkbenchStories(
        model,
        {
          gaps: [`${firstEntity!.id}: missing confirmation`],
        },
        { agent: { generate } },
      );
      expect(stories.map((story) => story.flowId)).toEqual([
        'payment',
        'z-independent',
      ]);
      expect(stories[0]!.scenes).toHaveLength(
        collectFlowScenarios(model)[0]!.steps.length,
      );
      expect(stories[0]!.scenes[0]!.narrative).toContain(
        '未执行验收或规则判定',
      );
      expect(
        stories[0]!.scenes.find((scene) => scene.pendingSuspense)
          ?.pendingSuspense,
      ).toMatch(/[？?]/);
      expect(stories[1]!.scenes[0]!.narrative).toContain('业务旁白');
    },
  );

  it('returns no stories for models without flow annotations and never invokes AI', async () => {
    const model = await modelOf();
    for (const entity of model.entities) delete entity.examples;
    const generate = vi.fn();
    expect(
      await collectWorkbenchStories(
        model,
        { gaps: [] },
        { agent: { generate } },
      ),
    ).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
    expect(
      projectWorkbenchData({
        model: {
          schemaVersion: '6.0',
          model: {},
          entities: [],
          relationships: [],
          rules: [],
        },
        check: {},
      }).stories,
    ).toEqual([]);
  });

  it('does not disguise invalid flow graphs as an AI failure', async () => {
    const model = await modelOf();
    const example = model.entities
      .flatMap((entity) => entity.examples ?? [])
      .find((example) => example.test?.flow)!;
    example.test!.basedOn = ['unknown#dependency'];
    const generate = vi.fn();
    await expect(
      collectWorkbenchStories(model, { gaps: [] }, { agent: { generate } }),
    ).rejects.toThrow('UNKNOWN_DEPENDENCY');
    expect(generate).not.toHaveBeenCalled();
  });

  it('rejects a snapshot that changes during story generation', async () => {
    await withRoot(async (root) => {
      let changed = false;
      const generate = vi.fn(async (request: { userPrompt: string }) => {
        changed = true;
        return draftFor(request);
      });
      await expect(
        collectWorkbench({
          projectRoot: root,
          modelRoot: PROCUREMENT,
          storyOptions: { agent: { generate } },
          fingerprint: async () => (changed ? 'after' : 'before'),
        }),
      ).rejects.toThrow('输入在生成期间变化');
      expect(generate).toHaveBeenCalled();
    });
  });
});

describe('single-file story export', () => {
  it('publishes all payment scenes in the JSON island with no external resources', async () => {
    await withRoot(async (root) => {
      const { output, data } = await generateWorkbench({
        projectRoot: root,
        modelRoot: PROCUREMENT,
        output: path.join(root, 'workbench.html'),
        storyOptions: { skipAi: true },
      });
      const html = await readFile(output, 'utf8');
      const island = /id="workbench-data">(.*?)<\/script>/s.exec(html);
      expect(island).not.toBeNull();
      expect(JSON.parse(island![1]!).stories).toEqual(data.stories);
      expect(data.stories[0]!.flowId).toBe('payment');
      expect(data.stories[0]!.scenes.length).toBeGreaterThan(0);
      expect(html).toContain('id="view-stories"');
      expect(html).toContain("connect-src 'none'");
      expect(html).toContain("default-src 'none'");
      expect(html).toMatch(/script-src 'sha256-[^']+'/);
      expect(html.match(/<script\b/g)).toHaveLength(2);
      expect(html).not.toMatch(
        /<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=/i,
      );
      expect(html).not.toMatch(/@@(?:DATA|APP|STYLE|CSP)@@/);
      expect(JSON.parse(island![1]!)).not.toHaveProperty('storyOptions');
    });
  });

  it('escapes script terminators in stories while preserving the displayed facts', async () => {
    await withRoot(async (root) => {
      const { data } = await collectWorkbench({
        projectRoot: root,
        modelRoot: PROCUREMENT,
        storyOptions: { skipAi: true },
      });
      const hostile =
        '</script><script src="https://private.invalid/leak">&\u2028\u2029';
      const original = data.stories[0]!;
      const scene = original.scenes[0]!;
      const input = {
        ...data,
        stories: [
          {
            ...original,
            storyTitle: hostile,
            scenes: [
              {
                ...scene,
                narrative: hostile,
                documentCard: {
                  ...scene.documentCard,
                  fields: [
                    {
                      name: 'amount',
                      label: hostile,
                      value: hostile,
                      keyData: true,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const html = renderWorkbenchHtml(
        input,
        loadWorkbenchAssets(builtinAssetsDirectory()!),
      );
      expect(html).not.toContain(hostile);
      expect(html.match(/<script\b/g)).toHaveLength(2);
      const island = /id="workbench-data">(.*?)<\/script>/s.exec(html)![1]!;
      expect(JSON.parse(island).stories).toEqual(input.stories);
    });
  });
});

describe('workbench story privacy projection', () => {
  it('whitelists nested presentation fields without exporting fact hashes or private metadata', async () => {
    const model = await modelOf();
    const story = await createFlowStoryProjector({ skipAi: true }).project(
      collectFlowScenarios(model)[0]!,
      model,
    );
    const privateData = {
      sourcePath: '/private/customer.json',
      apiKey: 'secret-token',
    };
    const scene = story.scenes[0]!;
    const input = [
      {
        ...story,
        ...privateData,
        scenes: [
          {
            ...scene,
            ...privateData,
            documentCard: {
              ...scene.documentCard,
              ...privateData,
              fields: scene.documentCard.fields.map((field) => ({
                ...field,
                ...privateData,
                sourceOrigin: '/private/interview.md',
              })),
            },
            ruleEvaluations: [
              {
                ruleName: '示例说明',
                explanation: '静态说明',
                satisfied: false,
                ...privateData,
              },
            ],
            stateTransitionNotice: '状态声明',
            pendingSuspense: '请问由谁确认？',
          },
        ],
      },
    ];
    const typed: readonly BusinessStoryProjection[] = input;
    const before = JSON.stringify(input);
    const projected = projectWorkbenchStories(typed);
    expect(projected[0]!.scenes[0]).toMatchObject({
      documentCard: { title: scene.documentCard.title },
      ruleEvaluations: [
        { ruleName: '示例说明', explanation: '静态说明', satisfied: false },
      ],
      stateTransitionNotice: '状态声明',
      pendingSuspense: '请问由谁确认？',
    });
    expect(JSON.stringify(projected)).not.toMatch(
      /private|secret-token|sourceOrigin|stepHash/,
    );
    expect(JSON.stringify(input)).toBe(before);
    expect(projected[0]!.scenes[0]).not.toBe(scene);
  });
});
