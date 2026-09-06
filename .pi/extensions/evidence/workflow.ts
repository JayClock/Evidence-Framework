import { getNextPhase, getPreviousPhase } from './phases.ts';
import { appendHistory } from './storage.ts';
import type { ActivePhase, EvidenceState } from './types.ts';

function resetTddCycle(state: EvidenceState): void {
  state.coding.baseline = null;
  state.coding.cycles = [];
  state.coding.verifications = [];
  state.coding.revisionStart = 0;
  state.coding.tdd = { stage: 'red', binding: null, red: null, green: null };
}

// Changing business scope invalidates FM validation, not its historical files.
function invalidateModelingDecision(state: EvidenceState): void {
  if (state.phase !== 'requirements' && state.phase !== 'modeling') return;
  state.modeling.applicable = null;
  state.modeling.rationale = null;
  state.modeling.machineValidated = false;
  state.modeling.simulationPassed = null;
}

export function currentCodingStory(state: EvidenceState): string | null {
  return state.coding.storyIds[state.coding.currentStoryIndex] ?? null;
}

export function advanceAfterApproval(state: EvidenceState): {
  completedSubject: string;
  nextPhase: string;
} {
  if (state.phase === 'complete') {
    return { completedSubject: 'complete', nextPhase: 'complete' };
  }

  const completedSubject =
    state.phase === 'coding'
      ? (currentCodingStory(state) ?? 'coding')
      : state.phase;

  if (
    state.phase === 'coding' &&
    state.coding.currentStoryIndex + 1 < state.coding.storyIds.length
  ) {
    state.coding.currentStoryIndex += 1;
    state.coding.changedFiles = [];
    resetTddCycle(state);
    state.status = 'ready';
    state.round = 0;
    state.currentArtifactIndex = 0;
    state.pendingGate = null;
    state.feedback = null;
    state.lastError = null;
    appendHistory(
      state,
      'gate_approved',
      `${completedSubject} → ${currentCodingStory(state)}`,
    );
    return {
      completedSubject,
      nextPhase: `coding:${currentCodingStory(state)}`,
    };
  }

  const next = getNextPhase(state.phase as ActivePhase);
  state.phase = next;
  state.status = next === 'complete' ? 'complete' : 'ready';
  state.round = 0;
  state.currentArtifactIndex = 0;
  state.pendingGate = null;
  state.feedback = null;
  state.lastError = null;
  if (next !== 'review' && next !== 'complete') {
    state.coding.changedFiles = [];
    resetTddCycle(state);
  }
  if (next === 'coding') {
    if (state.coding.planDigest === null) state.coding.storyIds = [];
    state.coding.currentStoryIndex = 0;
    state.coding.records = {};
  }
  appendHistory(state, 'gate_approved', `${completedSubject} → ${next}`);
  return { completedSubject, nextPhase: next };
}

export function requestRevision(
  state: EvidenceState,
  feedback: string,
  maxRounds: number,
): void {
  if (state.phase === 'complete')
    throw new Error('Completed workflow cannot be revised without going back');
  invalidateModelingDecision(state);
  state.round += 1;
  state.currentArtifactIndex = 0;
  state.feedback = feedback.trim();
  state.pendingGate = null;
  state.lastError = null;
  if (state.phase === 'coding') {
    state.coding.changedFiles = [];
    state.coding.tdd = { stage: 'red', binding: null, red: null, green: null };
    state.coding.revisionStart = state.coding.cycles.length;
    const story = currentCodingStory(state);
    if (story) delete state.coding.records[story];
  }
  if (state.round >= maxRounds) {
    state.status = 'blocked';
    appendHistory(state, 'max_rounds_reached', feedback.slice(0, 200));
  } else {
    state.status = 'ready';
    appendHistory(state, 'changes_requested', feedback.slice(0, 200));
  }
}

export function moveBackOnePhase(state: EvidenceState): ActivePhase | null {
  const previous = getPreviousPhase(state.phase);
  if (!previous) return null;
  const from = state.phase;
  state.phase = previous;
  invalidateModelingDecision(state);
  state.status = 'ready';
  state.round = 0;
  state.currentArtifactIndex = 0;
  state.pendingGate = null;
  state.feedback = `人工从 ${from} 回退到 ${previous}，请重新核对已有工件。`;
  state.lastReport = null;
  state.lastError = null;
  if (previous === 'coding') {
    state.coding.currentStoryIndex = Math.max(
      0,
      state.coding.storyIds.length - 1,
    );
    state.coding.changedFiles = [];
    state.coding.tdd = { stage: 'red', binding: null, red: null, green: null };
    state.coding.revisionStart = state.coding.cycles.length;
    const story = currentCodingStory(state);
    if (story) delete state.coding.records[story];
  }
  appendHistory(state, 'phase_rolled_back', `${from} → ${previous}`);
  return previous;
}
