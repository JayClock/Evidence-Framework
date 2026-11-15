import { describe, expect, it, vi } from 'vitest';

import { createFlowStoryProjector } from './flowStoryProjector.js';
import { STORY_SYSTEM_PROMPT } from './prompts.js';
import { StorySceneCache } from './storyCache.js';
import {
  flowFixture,
  modelFixture,
  sceneDraft,
  stepFixture,
} from './testing/fixtures.js';

const stepsFixture = () =>
  [1, 2, 3].map((sequence) =>
    stepFixture({
      sequence,
      entityId: `request.payment-${sequence}`,
      values: { amount: sequence * 100 },
    }),
  );

describe('incremental flow story projection', () => {
  it('calls the agent once per initial step and only once for an edited third step', async () => {
    const generate = vi.fn().mockResolvedValue(sceneDraft());
    const projector = createFlowStoryProjector({ agent: { generate } });
    const steps = stepsFixture();
    const first = await projector.project(flowFixture(steps));
    expect(generate).toHaveBeenCalledTimes(3);
    const edited = [
      steps[0]!,
      steps[1]!,
      stepFixture({ ...steps[2]!, values: { amount: 999 } }),
    ];
    const second = await projector.project(flowFixture(edited));
    expect(generate).toHaveBeenCalledTimes(4);
    expect(second.scenes.slice(0, 2)).toEqual(first.scenes.slice(0, 2));
    expect(second.scenes[2]!.documentCard.fields[0]!.value).toBe('999');
    const request = generate.mock.calls[3]![0];
    expect(request.systemPrompt).toBe(STORY_SYSTEM_PROMPT);
    expect(JSON.parse(request.userPrompt).step.values).toEqual({ amount: 999 });
    expect(request.userPrompt).not.toContain('payment-1');
    expect(second).toMatchObject({
      flowId: 'purchase',
      storyTitle: '采购付款',
      businessGoal: expect.any(String),
    });
  });

  it('sorts by sequence and rebinds cached scene indexes after insertion', async () => {
    const generate = vi.fn().mockResolvedValue(sceneDraft());
    const projector = createFlowStoryProjector({ agent: { generate } });
    const steps = stepsFixture();
    await projector.project(flowFixture(steps));
    const inserted = stepFixture({ entityId: 'contract.purchase' });
    const moved = steps.map((step) => ({
      ...step,
      sequence: step.sequence + 1,
    }));
    const projected = await projector.project(
      flowFixture([...moved.reverse(), inserted]),
    );
    expect(generate).toHaveBeenCalledTimes(4);
    expect(projected.scenes.map(({ stepIndex }) => stepIndex)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(projected.scenes.slice(1).map(({ stepHash }) => stepHash)).toEqual(
      steps.map(({ stepHash }) => stepHash),
    );
  });

  it('turns an isolated request gap into a business question even when the agent omits it', async () => {
    const generate = vi.fn().mockResolvedValue(sceneDraft());
    const projector = createFlowStoryProjector({ agent: { generate } });
    const step = stepFixture({ gaps: ['unpaired_request'] });
    const result = await projector.project(flowFixture([step]));
    expect(result.scenes[0]!.pendingSuspense).toMatch(/确认单据.*[？?]/u);
    expect(result.scenes[0]!.pendingSuspense).not.toContain('unpaired_request');
    expect(result.scenes[0]!.ruleEvaluations).toEqual([]);
    expect(result.scenes[0]!.stateTransitionNotice).toBeUndefined();
    // Gaps are intentionally not in M1's hash, but must still invalidate prose.
    const complete = await projector.project(
      flowFixture([{ ...step, gaps: [] }]),
    );
    expect(generate).toHaveBeenCalledTimes(2);
    expect(complete.scenes[0]!.pendingSuspense).toBeUndefined();
  });

  it('retains a generated gap question and drops unsolicited suspense for complete steps', async () => {
    const generate = vi
      .fn()
      .mockResolvedValue({
        ...sceneDraft(),
        pendingSuspense: '请问金额由哪份合同提供？',
      });
    const projector = createFlowStoryProjector({ agent: { generate } });
    const step = stepFixture({ gaps: ['missing_source'] });
    expect(
      (await projector.project(flowFixture([step]))).scenes[0]!.pendingSuspense,
    ).toBe('请问金额由哪份合同提供？');
    expect(
      (await projector.project(flowFixture([{ ...step, gaps: [] }]))).scenes[0]!
        .pendingSuspense,
    ).toBeUndefined();
  });

  it('invalidates local metadata changes, not unrelated model edits or example changes', async () => {
    const generate = vi.fn().mockResolvedValue(sceneDraft());
    const projector = createFlowStoryProjector({ agent: { generate } });
    const model = modelFixture();
    const flow = flowFixture();
    const first = await projector.project(flow, model);
    expect(first.scenes[0]!.documentCard.fields[0]!.keyData).toBe(true);
    model.entities[0]!.notes = 'unrelated context notes';
    model.entities[3]!.examples = [
      { label: '无关示例', value: { amount: 200 } },
    ];
    await projector.project(flow, model);
    expect(generate).toHaveBeenCalledTimes(1);
    model.entities[1]!.label = '供应商财务部';
    const renamed = await projector.project(flow, model);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(renamed.scenes[0]!.actingRoleLabel).toBe('供应商财务部');
    await projector.project(
      flowFixture([{ ...flow.steps[0]!, entityLabel: '新名称' }]),
      model,
    );
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('validates responses before caching and retries after model/shape errors', async () => {
    const cache = new StorySceneCache();
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce({ narrative: 'incomplete' })
      .mockResolvedValueOnce(sceneDraft({ invented: 100 }))
      .mockResolvedValueOnce(
        `\`\`\`json\n${JSON.stringify(sceneDraft())}\n\`\`\``,
      );
    const projector = createFlowStoryProjector({ agent: { generate }, cache });
    for (let index = 0; index < 4; index++) {
      await expect(projector.project(flowFixture())).rejects.toThrow();
      expect(cache.has(stepFixture().stepHash)).toBe(false);
    }
    const result = await projector.project(flowFixture());
    expect(result.scenes).toHaveLength(1);
    await projector.project(flowFixture());
    expect(generate).toHaveBeenCalledTimes(5);
  });

  it('coalesces simultaneous misses and protects cached scenes from result mutation', async () => {
    const generate = vi.fn().mockResolvedValue(sceneDraft());
    const projector = createFlowStoryProjector({ agent: { generate } });
    const [first, second] = await Promise.all([
      projector.project(flowFixture()),
      projector.project(flowFixture()),
    ]);
    expect(generate).toHaveBeenCalledTimes(1);
    Object.assign(first.scenes[0]!.documentCard.fields[0]!, {
      value: 'changed',
    });
    expect(second.scenes[0]!.documentCard.fields[0]!.value).toBe('100');
    expect(
      (await projector.project(flowFixture())).scenes[0]!.documentCard
        .fields[0]!.value,
    ).toBe('100');
  });

  it('does not allow the agent to rewrite values or invent rule decisions', async () => {
    const draft = sceneDraft();
    draft.documentCard.fields[0]!.value = '999';
    const generate = vi.fn().mockResolvedValue(draft);
    const projector = createFlowStoryProjector({ agent: { generate } });
    const result = await projector.project(flowFixture());
    expect(result.scenes[0]!.documentCard.fields[0]).toMatchObject({
      value: '100',
      keyData: false,
    });
    generate.mockResolvedValue({
      ...draft,
      ruleEvaluations: [{ satisfied: true }],
    });
    await expect(
      projector.project(
        flowFixture([stepFixture({ values: { amount: 200 } })]),
      ),
    ).rejects.toThrow();
  });

  it('handles empty traces without invoking the agent and rejects duplicate sequences', async () => {
    const generate = vi.fn();
    const projector = createFlowStoryProjector({ agent: { generate } });
    expect((await projector.project(flowFixture([]))).scenes).toEqual([]);
    await expect(
      projector.project(flowFixture([stepFixture(), stepFixture()])),
    ).rejects.toThrow('sequences');
    expect(generate).not.toHaveBeenCalled();
  });
});
