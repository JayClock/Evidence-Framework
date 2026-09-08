import type {
  DiscoveryAnswer,
  DiscoveryQuestion,
  DiscoverySnapshot,
  QuestionResolution,
} from './discovery-schema.ts';

export function latestAnswer(
  snapshot: DiscoverySnapshot,
  questionId: string,
): DiscoveryAnswer | undefined {
  return [...snapshot.answers]
    .reverse()
    .find((answer) => answer.questionId === questionId);
}

export function activeResolution(
  snapshot: DiscoverySnapshot,
  questionId: string,
): QuestionResolution | undefined {
  if (snapshot.staleRecordKeys.includes(`resolution:${questionId}`)) return;
  return snapshot.questionResolutions.find(
    (value) => value.questionId === questionId,
  );
}

// A sourced interpretation closes a gap, not the human answer slot. History and
// voluntary corrections remain available even when no further question is needed.
export function questionIsResolved(
  snapshot: DiscoverySnapshot,
  questionId: string,
): boolean {
  const answer = latestAnswer(snapshot, questionId);
  return (
    (answer !== undefined && answer.status !== 'unknown') ||
    activeResolution(snapshot, questionId) !== undefined
  );
}

export function unansweredQuestions(
  snapshot: DiscoverySnapshot,
): DiscoveryQuestion[] {
  return snapshot.questions.filter(
    (question) =>
      !latestAnswer(snapshot, question.id) &&
      !activeResolution(snapshot, question.id),
  );
}

export function unresolvedBlockingQuestions(
  snapshot: DiscoverySnapshot,
): DiscoveryQuestion[] {
  return snapshot.questions.filter(
    (question) =>
      question.blocking && !questionIsResolved(snapshot, question.id),
  );
}

export function pendingQuestions(
  snapshot: DiscoverySnapshot,
): DiscoveryQuestion[] {
  if (snapshot.interaction.stopped || snapshot.interaction.needsConsolidation)
    return [];
  return unansweredQuestions(snapshot).filter(
    (question) =>
      snapshot.interaction.activeQuestionId === question.id &&
      !snapshot.interaction.deferredQuestionIds.includes(question.id),
  );
}

// This is an identity guard, not an LLM semantic classifier. Stable keys handle
// paraphrases declared as the same gap; text normalization catches trivial renames
// in old journals. Different business objects may legitimately use the same wording.
export function duplicateQuestion(
  snapshot: DiscoverySnapshot,
  question: DiscoveryQuestion,
): DiscoveryQuestion | undefined {
  const normalized = (value: string) =>
    value
      .normalize('NFKC')
      .replace(/[\s\p{P}]+/gu, '')
      .toLowerCase();
  return snapshot.questions.find(
    (previous) =>
      previous.id !== question.id &&
      ((question.gapKey !== undefined && previous.gapKey === question.gapKey) ||
        (previous.target?.contractRef === question.target?.contractRef &&
          previous.target?.fulfillmentRef === question.target?.fulfillmentRef &&
          // Distinct explicit subject keys distinguish domain/channel questions.
          (question.target !== null ||
            !previous.gapKey ||
            !question.gapKey ||
            previous.gapKey.split('.')[0] === question.gapKey.split('.')[0]) &&
          normalized(previous.prompt) === normalized(question.prompt))),
  );
}
