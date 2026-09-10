export class PanelMutex {
  private active = false;

  acquire(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  release(): void {
    this.active = false;
  }
}

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

export type ReviewStatus =
  | 'save'
  | 'revise'
  | 'deferred'
  | 'cancelled'
  | 'unavailable';

export interface ReviewResult {
  status: ReviewStatus;
  preparationId?: string;
  receiptDigest?: string;
}

export const FM_SKILL_COMMAND = 'skill:fm-modeling';
