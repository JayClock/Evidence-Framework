import { describe, expect, it } from 'vitest';
import { createInitialState } from './storage.ts';
import {
  advanceAfterApproval,
  currentCodingStory,
  extractStoryIds,
  moveBackOnePhase,
  requestRevision,
} from './workflow.ts';

describe('story extraction', () => {
  it('keeps first occurrence order and removes duplicates', () => {
    expect(extractStoryIds('US-002, US-001, US-002, US-010')).toEqual([
      'US-002',
      'US-001',
      'US-010',
    ]);
  });
});

describe('workflow transitions', () => {
  it('advances document phases', () => {
    const state = createInitialState('test', 'goal');
    const result = advanceAfterApproval(state);
    expect(result.nextPhase).toBe('domain');
    expect(state.phase).toBe('domain');
    expect(state.status).toBe('ready');
  });

  it('advances one coding story at a time', () => {
    const state = createInitialState('test', 'goal');
    state.phase = 'coding';
    state.coding.storyIds = ['US-001', 'US-002'];
    state.coding.tdd.stage = 'green';

    expect(currentCodingStory(state)).toBe('US-001');
    expect(advanceAfterApproval(state).nextPhase).toBe('coding:US-002');
    expect(currentCodingStory(state)).toBe('US-002');
    expect(state.coding.tdd).toEqual({ stage: 'red', red: null, green: null });
    expect(advanceAfterApproval(state).nextPhase).toBe('review');
    expect(state.phase).toBe('review');
  });

  it('clears stale stories when approved planning enters coding', () => {
    const state = createInitialState('test', 'goal');
    state.phase = 'planning';
    state.coding.storyIds = ['US-OLD'];
    expect(advanceAfterApproval(state).nextPhase).toBe('coding');
    expect(state.coding.storyIds).toEqual([]);
  });

  it('blocks when revision reaches the configured limit', () => {
    const state = createInitialState('test', 'goal');
    requestRevision(state, 'fix it', 1);
    expect(state.status).toBe('blocked');
    expect(state.feedback).toBe('fix it');
  });

  it('moves back without deleting artifacts', () => {
    const state = createInitialState('test', 'goal');
    state.phase = 'architecture';
    expect(moveBackOnePhase(state)).toBe('domain');
    expect(state.phase).toBe('domain');
    expect(state.status).toBe('ready');
  });
});
