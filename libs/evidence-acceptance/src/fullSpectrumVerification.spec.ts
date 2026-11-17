import {
  buildFmCheckReport,
  collectFlowScenarios,
  createModelSession,
  evaluateRuleOnExample,
  parseModelBundleText,
  serializeModelBundle,
} from '@evidence-poc/evidence-model-core';
import { computeGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import { strictValidateDomainModel } from '@evidence-poc/evidence-schema';
import { renderDeliverables } from './renderDeliverables.js';
import { fullSpectrumModel } from '../tests/support/fullSpectrumModel.js';

describe('full-spectrum model lifecycle acceptance', () => {
  it('keeps schema, fmCheck, bundle roundtrip and all three causal scenes valid', () => {
    const model = fullSpectrumModel();
    expect(strictValidateDomainModel(model).issues).toEqual([]);
    const { report } = buildFmCheckReport({ model });
    expect(report).toMatchObject({
      valid: true,
      consistent: true,
      errors: [],
      humanConfirmation: 'not-asserted-by-machine',
    });
    const reparsed = parseModelBundleText(
      serializeModelBundle(model, { sortItems: false }),
    );
    expect(reparsed.issues).toEqual([]);
    expect(reparsed.document).toEqual(model);
    const flows = collectFlowScenarios(model);
    expect(flows.map((f) => f.flowId)).toEqual([
      'defect-escalation',
      'happy-path',
      'late-delivery',
    ]);
    for (const flow of flows) {
      const completed = new Set<string>();
      for (const [i, step] of flow.steps.entries()) {
        expect(step.sequence).toBe(i + 1);
        expect(step.basedOn.every((ref) => completed.has(ref))).toBe(true);
        completed.add(`${step.entityId}#${step.exampleLabel}`);
      }
    }
    expect(
      flows.find((f) => f.flowId === 'happy-path')!.steps.at(-1)?.entityId,
    ).toBe('conf-escrow-release');
    expect(
      flows.find((f) => f.flowId === 'defect-escalation')!.steps.at(-1)
        ?.entityId,
    ).toBe('conf-escrow-freeze');
  });

  it('evaluates every CEL kind using actual scenario data and modeled capability parameters', () => {
    const model = fullSpectrumModel();
    for (const flow of collectFlowScenarios(model)) {
      const values = new Map(flow.steps.map((s) => [s.entityId, s.values]));
      for (const entity of model.entities)
        if (
          !values.has(entity.id) &&
          entity.examples?.length === 1 &&
          !entity.examples[0].test
        )
          values.set(entity.id, entity.examples[0].value);
      for (const rule of model.rules) {
        const bindings = Object.fromEntries(
          Object.entries(rule.bindings).flatMap(([alias, binding]) =>
            'ref' in binding && values.has(binding.ref)
              ? [[alias, values.get(binding.ref)]]
              : [],
          ),
        );
        if (Object.keys(bindings).length !== Object.keys(rule.bindings).length)
          continue;
        const result = evaluateRuleOnExample(model, rule, {
          bindings,
          asOf: flow.steps.at(-1)!.asOf,
        });
        if (rule.kind === 'derivation')
          expect(result).toEqual({ minorUnits: 100000, currency: 'CNY' });
        else if (rule.id === 'rule-breach-detection-overdue')
          expect(result).toBe(flow.flowId === 'late-delivery');
        else if (rule.id === 'rule-defect-escalation')
          expect(result).toBe(flow.flowId === 'defect-escalation');
        else expect(result, `${flow.flowId}/${rule.id}`).toBe(true);
      }
    }
  });

  it('does not create history or lose selection when layouts switch, including undo and redo', async () => {
    const session = createModelSession({ document: fullSpectrumModel() });
    session.select('req-equipment-delivery');
    const before = session.getDocument();
    for (const layoutMode of ['swimlane', 'topology', 'swimlane'] as const) {
      await computeGraphLayout(session.getGraph(), { layoutMode });
      expect(session.canUndo()).toBe(false);
      expect(session.getDocument()).toBe(before);
      expect(session.getSelection().nodeId).toBe('req-equipment-delivery');
    }
    session.mutate((draft) => {
      draft.entities.find((e) => e.id === 'req-equipment-delivery')!.label =
        '经评审的交付窗口';
    });
    const changed = session.getDocument();
    expect(session.undo()).toBe(true);
    expect(session.getDocument()).toEqual(before);
    expect(session.redo()).toBe(true);
    expect(session.getDocument()).toEqual(changed);
    const layout = await computeGraphLayout(session.getGraph(), {
      layoutMode: 'swimlane',
    });
    expect(layout.nodeById.get('req-equipment-delivery')?.entity.label).toBe(
      '经评审的交付窗口',
    );
    expect(session.getSelection().nodeId).toBe('req-equipment-delivery');
  });

  it('exports a deterministic OpenAPI contract before and after both presentation modes', async () => {
    const model = fullSpectrumModel();
    const options = { openapi: true, tests: false, format: 'stepci' } as const;
    const before = await renderDeliverables(model, options);
    await computeGraphLayout(
      createModelSession({ document: model }).getGraph(),
      { layoutMode: 'swimlane' },
    );
    const after = await renderDeliverables(model, options);
    expect(after).toEqual(before);
    expect(after.endpointCount).toBeGreaterThan(0);
    expect(Object.keys(after.files)).toContain('openapi.json');
  });
});
