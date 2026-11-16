import { readFileSync } from 'node:fs';

import {
  buildFmCheckReport,
  collectFlowScenarios,
} from '@evidence-poc/evidence-model-core';
import { DomainModelDocumentSchema } from '@evidence-poc/evidence-schema';
import { describe, expect, it, vi } from 'vitest';

import { createFlowStoryProjector, simulateWhatIf } from '../index.js';
import { sceneDraft } from './testing/fixtures.js';

const acceptanceModel = (name: string) =>
  DomainModelDocumentSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../evidence-model-core/tests/fixtures/acceptance/${name}.evidence.json`,
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );

describe('M1 trace to M2 story integration', () => {
  it.each(['procurement', 'procurement-deposit'])(
    'projects %s and regenerates only its edited request scene',
    async (name) => {
      const model = acceptanceModel(name);
      const { report } = buildFmCheckReport({ model });
      const flows = collectFlowScenarios(model, report);
      const generate = vi
        .fn()
        .mockImplementation(async ({ userPrompt }: { userPrompt: string }) => {
          const { step } = JSON.parse(userPrompt);
          return sceneDraft(step.values);
        });
      const projector = createFlowStoryProjector({ agent: { generate } });
      for (const flow of flows) {
        const projection = await projector.project(flow, model);
        expect(projection.scenes).toHaveLength(flow.steps.length);
        expect(projection.scenes.map(({ stepHash }) => stepHash)).toEqual(
          flow.steps.map(({ stepHash }) => stepHash),
        );
        for (const [index, scene] of projection.scenes.entries()) {
          expect(
            scene.documentCard.fields.map(({ name }) => name).sort(),
          ).toEqual(Object.keys(flow.steps[index]!.values).sort());
          expect(Boolean(scene.pendingSuspense)).toBe(
            flow.steps[index]!.gaps.length > 0,
          );
        }
      }
      const initialCalls = generate.mock.calls.length;
      expect(initialCalls).toBe(
        flows.reduce((count, flow) => count + flow.steps.length, 0),
      );
      model.entities.find(
        ({ id }) => id === 'request.payment',
      )!.examples![0]!.value.quantity = 12;
      const nextReport = buildFmCheckReport({ model }).report;
      for (const flow of collectFlowScenarios(model, nextReport))
        await projector.project(flow, model);
      expect(generate).toHaveBeenCalledTimes(initialCalls + 1);
    },
  );

  it('runs native derivations and a deadline decision on a real declared payment trace', async () => {
    const model = acceptanceModel('procurement');
    model.rules.push({
      type: 'rule',
      id: 'rule.late-payment',
      kind: 'breach',
      label: '付款逾期',
      description: '晚于付款请求约定时间付款',
      contextRef: 'context.procurement',
      bindings: {
        payment: { ref: 'confirmation.payment' },
        request: { ref: 'request.payment' },
      },
      expression:
        'payment.confirmed_at > request.expired_at && payment.total_amount > 0.0',
      resultType: 'bool',
    });
    const flow = collectFlowScenarios(model)[0]!;
    const current = flow.steps.find(
      ({ exampleLabel }) => exampleLabel === 'confirmed',
    )!;
    const generate = vi.fn().mockResolvedValue({
      businessImpactExplanation:
        '本次付款超过合同约定的付款期限，触发逾期判定。',
    });
    const result = await simulateWhatIf(
      {
        model,
        flow,
        currentStepSequence: current.sequence,
        hypothesisQuestion: '如果4月2日才付款会怎样？',
        hypothesis: {
          asOf: '2026-04-02T10:00:00Z',
          values: { confirmed_at: '2026-04-02T10:00:00Z' },
        },
      },
      { agent: { generate } },
    );
    expect(result.ruleOutcome).toEqual({
      ruleId: 'rule.late-payment',
      result: true,
    });
    expect(
      JSON.parse(generate.mock.calls[0]![0].userPrompt).currentValues
        .total_amount,
    ).toBe(500);
  });
});
