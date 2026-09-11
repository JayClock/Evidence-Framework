export type QuestionStatus =
  | 'answered'
  | 'deferred'
  | 'stopped'
  | 'cancelled'
  | 'unavailable';

export interface QuestionInput {
  questionId: string;
  gapKey: string;
  prompt: string;
  impact: string;
  contextSummary: string;
  sourceRefs: string[];
}

export interface QuestionResult {
  status: QuestionStatus;
  questionId: string;
  gapKey: string;
  answer?: string;
}

export const FM_SKILL_COMMAND = 'skill:fm-modeling';
