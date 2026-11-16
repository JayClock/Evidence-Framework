import {
  createModelSession,
  cloneScenarioExamples,
  replaceScenarioExamples,
  evaluateScenario,
  collectFlowScenarios,
} from '@evidence-poc/evidence-model-core';
import { createAcceptanceModel } from '@evidence-poc/evidence-api/testing';
import { projectAcceptanceTests } from './scenarioProjector.js';
import { renderStepCi } from '../renderer/stepCiRenderer.js';
import { renderHurl } from '../renderer/hurlRenderer.js';

describe('scenario studio to standard acceptance', () => {
  it('round trips cloned inline scenarios through traces and both standard renderers', () => {
    const session = createModelSession({ document: createAcceptanceModel() });
    const originalFlow = collectFlowScenarios(session.getDocument())[0].flowId;
    const cloned = cloneScenarioExamples(
      session.getDocument(),
      originalFlow,
      '另一份采购案例',
    );
    session.mutate((d) => replaceScenarioExamples(d, '另一份采购案例', cloned));
    // The on-disk representation is still just the existing FM AST.
    const restored = JSON.parse(JSON.stringify(session.getDocument()));
    expect(collectFlowScenarios(restored)).toHaveLength(2);
    const oracle = evaluateScenario(restored, '另一份采购案例');
    expect(oracle.at(-1)?.values.total_amount).toBe(500);
    const projection = projectAcceptanceTests(restored);
    expect(projection.flows).toHaveLength(2);
    expect(projection.flows.every((f) => f.steps.length === 3)).toBe(true);
    expect(renderStepCi(projection)).toContain('500');
    expect(Object.keys(renderHurl(projection))).toHaveLength(2);
    expect(session.undo()).toBe(true);
    expect(projectAcceptanceTests(session.getDocument()).flows).toHaveLength(1);
  });
});
