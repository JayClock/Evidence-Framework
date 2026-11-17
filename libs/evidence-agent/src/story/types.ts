import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import type { FlowScenarioTrace } from '@evidence-poc/evidence-model-core';

/** A field on a business document, including its modeled data provenance. */
export interface DocumentCardField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly keyData: boolean;
  readonly sourceOrigin?: string;
}

export interface StoryScene {
  /** The trace's one-based sequence, assigned by the projector, never the LLM. */
  readonly stepIndex: number;
  readonly stepHash: string;
  readonly phaseTitle: string;
  readonly narrative: string;
  readonly actingRoleLabel: string;
  readonly targetEntityLabel: string;
  readonly documentCard: {
    readonly title: string;
    readonly fields: readonly DocumentCardField[];
    readonly basisNotes?: string;
  };
  readonly ruleEvaluations: readonly {
    readonly ruleName: string;
    readonly explanation: string;
    readonly satisfied: boolean;
  }[];
  readonly stateTransitionNotice?: string;
  readonly pendingSuspense?: string;
}

export interface BusinessStoryProjection {
  readonly flowId: string;
  readonly storyTitle: string;
  readonly storySummary: string;
  readonly businessGoal: string;
  readonly scenes: readonly StoryScene[];
}

/** A narrow, injectable LLM boundary. Every response is runtime-validated. */
export interface StoryAgent {
  generate(request: {
    readonly systemPrompt: string;
    readonly userPrompt: string;
  }): Promise<unknown>;
}

export interface WhatIfHypothesis {
  /** An explicit RFC 3339 clock; never inferred from the machine's date. */
  readonly asOf?: string;
  /** Partial overrides of the current step's declared input attributes only. */
  readonly values?: Readonly<Record<string, unknown>>;
}

export interface WhatIfInput {
  readonly model: DomainModelDocument;
  readonly flow: FlowScenarioTrace;
  readonly currentStepSequence: number;
  readonly hypothesisQuestion: string;
  /** Bypass natural-language extraction for reproducible callers/tests. */
  readonly hypothesis?: WhatIfHypothesis;
  /** Select one relevant rule; otherwise evaluate all completion/breach rules. */
  readonly ruleId?: string;
}

export interface WhatIfRuleOutcome {
  readonly ruleId: string;
  readonly result: boolean;
}

export interface WhatIfResult {
  readonly hypothesis: WhatIfHypothesis;
  /** First outcome, retained as the single-rule convenience contract. */
  readonly ruleOutcome: WhatIfRuleOutcome;
  readonly ruleOutcomes: readonly WhatIfRuleOutcome[];
  readonly businessImpactExplanation: string;
}
