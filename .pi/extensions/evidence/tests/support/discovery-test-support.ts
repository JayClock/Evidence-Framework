import type {
  DiscoveryContent,
  DiscoveryQuestion,
} from '../../modeling/discovery/schema.ts';
import {
  appendDiscoveryEvent,
  appendDiscoveryRecords,
  finalizeDiscovery,
  loadDiscovery,
} from '../../state/discovery/index.ts';
import {
  readText,
  REQUIREMENTS_PATH,
  saveState,
  writeTextAtomic,
} from '../../storage.ts';
import type { EvidenceState } from '../../types.ts';
import { discoveryContent, fixtureSubmission } from './discovery-fixtures.ts';
export {
  contractContent,
  discoveryContent,
  fixtureSubmission,
  subscriptionContent,
} from './discovery-fixtures.ts';

export async function saveDiscoveryContent(
  root: string,
  state: EvidenceState,
  content: DiscoveryContent,
): Promise<void> {
  await appendDiscoveryRecords(
    root,
    state,
    fixtureSubmission(content, await loadDiscovery(root, state)),
  );
}

// A current registry across multiple dialogue rounds, not a legacy snapshot.
export async function seedQuestions(
  root: string,
  state: EvidenceState,
  questions: DiscoveryQuestion[],
): Promise<void> {
  state.status = 'waiting_answer';
  for (const question of questions)
    await appendDiscoveryEvent(root, state, { kind: 'question', question });
  if (questions.length > 1)
    await appendDiscoveryEvent(root, state, {
      kind: 'question',
      question: questions[0],
    });
}

// Explicit synthetic evidence for isolated tests, never used by runtime code.
export async function seedDiscovery(
  root: string,
  state: EvidenceState,
): Promise<void> {
  if (state.discovery.stage === 'finalizing') return;
  if (!(await readText(root, REQUIREMENTS_PATH)))
    await writeTextAtomic(
      root,
      REQUIREMENTS_PATH,
      '# 合成测试输入\n明确正常、边界和异常预期。',
    );
  const { phase, status, currentArtifactIndex, execution } = state;
  const modeling = structuredClone(state.modeling);
  state.phase = 'modeling';
  state.status = 'running';
  await saveDiscoveryContent(root, state, discoveryContent());
  await finalizeDiscovery(root, state);
  state.phase = phase;
  state.status = status;
  state.execution = execution;
  state.currentArtifactIndex = currentArtifactIndex;
  state.modeling = modeling;
  await saveState(root, state);
}
