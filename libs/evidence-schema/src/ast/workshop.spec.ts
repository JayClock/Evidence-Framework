import { describe, expect, it } from 'vitest';

import {
  WORKSHOP_STEPS,
  WORKSHOP_STEP_IDS,
  isWorkshopStepId,
  workshopStepFocus,
  workshopStepRank,
} from './workshop.js';

describe('workshop steps', () => {
  it('walks seven steps, each with a label and a hint', () => {
    expect(WORKSHOP_STEPS).toHaveLength(7);

    for (const step of WORKSHOP_STEPS) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.hint.length).toBeGreaterThan(0);
    }
  });

  it('keeps the ids unique, so a chip maps to one step', () => {
    expect(new Set(WORKSHOP_STEP_IDS).size).toBe(WORKSHOP_STEPS.length);
  });

  it('numbers the steps from one', () => {
    expect(workshopStepRank('anchor-contract')).toBe(1);
    expect(workshopStepRank('connect-flow')).toBe(7);
  });

  it('names the step the modeler picked for their next turn', () => {
    expect(workshopStepFocus('name-things')).toBe('【第 3 步 · 补上标的物与领域组件】');
  });

  it('rejects a step the vocabulary does not know', () => {
    expect(isWorkshopStepId('anchor-contract')).toBe(true);
    expect(isWorkshopStepId('design-database')).toBe(false);
    expect(isWorkshopStepId(undefined)).toBe(false);
  });
});
